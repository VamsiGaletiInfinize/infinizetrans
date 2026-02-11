import { WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { connectionManager } from './connectionManager';
import { TranscriptionSession, TranscriptResult } from '../services/transcribe';
import { DeepgramTranscriptionSession } from '../services/deepgram';
import { pivotTranslate } from '../services/translate';
import { synthesizeSpeech } from '../services/polly';
import {
  transcribeToTranslateCode,
  getTranslateCode,
  getTranscribeCode,
} from '../utils/languages';
import {
  WsClientMessage,
  CaptionEvent,
  TranslatedAudioEvent,
  ParticipantInfo,
} from '../types';
import { config } from '../config';
import { logger, logTranscription } from '../utils/logger';

/* ------------------------------------------------------------------ */
/*  State per connection                                               */
/* ------------------------------------------------------------------ */

const transcriptionSessions = new Map<string, TranscriptionSession | DeepgramTranscriptionSession>();
const PARTIAL_THROTTLE_MS = 100;
const lastPartialTime = new Map<string, number>();
const MAX_FRAME_BYTES = 65_536;

/* Translation cache: reuse partial translations on finals to skip redundant API calls */
const partialTranslationCache = new Map<string, { originalText: string; translatedText: string }>();

/* Polly pre-synthesis: start Polly in background during partials so audio is
   ready instantly when the final arrives. Throttled to 1 call/second max. */
interface PreSynthEntry {
  translatedText: string;
  audioPromise: Promise<Buffer | null>;
}
const preSynthCache = new Map<string, PreSynthEntry>();
const lastPreSynthTime = new Map<string, number>();
const PRE_SYNTH_THROTTLE_MS = 1000; // At most 1 background Polly call per second

/* Stale partial timer: if no final arrives within 5s of continuous speech,
   synthesize Polly for the current partial so the listener doesn't wait 30+s. */
const STALE_PARTIAL_MS = 5000;
const stalePartialTimers = new Map<string, ReturnType<typeof setTimeout>>();
const interimPollyText = new Map<string, string>(); // normalized text already played
const latestPartialState = new Map<string, { translatedText: string; speaker: ParticipantInfo }>();

function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(/[.,!?;:'"()\-]/g, '').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */

export function handleWebSocketConnection(
  ws: WebSocket,
  _req: IncomingMessage,
): void {
  const connectionId = connectionManager.generateId();
  console.log(`[WS] Connected: ${connectionId}`);

  ws.on('message', async (data: RawData, isBinary: boolean) => {
    try {
      if (isBinary) {
        handleAudioFrame(connectionId, data as Buffer);
      } else {
        const msg: WsClientMessage = JSON.parse(data.toString());
        await handleControlMessage(connectionId, ws, msg);
      }
    } catch (err: any) {
      console.error(`[WS] Error from ${connectionId}:`, err.message);
      sendError(ws, err.message);
    }
  });

  ws.on('close', () => handleDisconnect(connectionId));
  ws.on('error', (err) => {
    console.error(`[WS] Socket error ${connectionId}:`, err.message);
    handleDisconnect(connectionId);
  });
}

/* ------------------------------------------------------------------ */
/*  Control messages                                                   */
/* ------------------------------------------------------------------ */

async function handleControlMessage(
  connectionId: string,
  ws: WebSocket,
  msg: WsClientMessage,
): Promise<void> {
  switch (msg.action) {
    case 'join': {
      const info: ParticipantInfo = {
        meetingId: msg.meetingId,
        attendeeId: msg.attendeeId,
        attendeeName: msg.attendeeName,
        spokenLanguage: msg.spokenLanguage,
        targetLanguage: msg.targetLanguage,
      };
      connectionManager.add(connectionId, ws, info);
      startTranscription(connectionId, info);
      ws.send(JSON.stringify({ type: 'joined', connectionId }));
      break;
    }

    case 'stop': {
      stopTranscription(connectionId);
      break;
    }

    case 'mic_on': {
      const conn = connectionManager.get(connectionId);
      if (conn) {
        logger.info('🎤 Mic ON — starting new Deepgram session', {
          attendee: conn.info.attendeeName,
        });
        startTranscription(connectionId, conn.info);
      }
      break;
    }

    case 'mic_off': {
      const session = transcriptionSessions.get(connectionId);
      if (session && session instanceof DeepgramTranscriptionSession) {
        logger.info('🔇 Mic OFF — finishing Deepgram session gracefully', {
          connectionId,
        });
        // Don't kill session immediately — let Deepgram finalize buffered audio
        session.finishGracefully();
        transcriptionSessions.delete(connectionId);
        lastPartialTime.delete(connectionId);
        // Clean up stale partial timer (the finishGracefully final will handle Polly)
        cleanupPartialState(connectionId);
      } else {
        stopTranscription(connectionId);
      }
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Audio frames → Transcribe                                          */
/* ------------------------------------------------------------------ */

function handleAudioFrame(connectionId: string, data: Buffer): void {
  if (data.length > MAX_FRAME_BYTES) return;
  const session = transcriptionSessions.get(connectionId);

  // Safety net: if audio arrives but no session exists (or Deepgram connection died),
  // auto-restart so we never miss speech.
  if (!session || (session instanceof DeepgramTranscriptionSession && !session.isAlive())) {
    const conn = connectionManager.get(connectionId);
    if (conn) {
      logger.info('🔄 Auto-restarting Deepgram session (audio arrived with no active session)', {
        attendee: conn.info.attendeeName,
      });
      startTranscription(connectionId, conn.info);
      const newSession = transcriptionSessions.get(connectionId);
      if (newSession) newSession.pushAudio(data);
    }
    return;
  }

  session.pushAudio(data);
}

/* ------------------------------------------------------------------ */
/*  Transcription lifecycle (fixed language)                           */
/* ------------------------------------------------------------------ */

function startTranscription(connectionId: string, info: ParticipantInfo): void {
  stopTranscription(connectionId);

  const transcribeCode = getTranscribeCode(info.spokenLanguage);
  if (!transcribeCode) {
    console.error(`[Transcribe] No transcribe code for ${info.spokenLanguage}`);
    return;
  }

  const useDeepgram = config.deepgram.provider === 'deepgram' && config.deepgram.apiKey;

  if (useDeepgram) {
    // Use Deepgram for superior accuracy (95-98%) and sub-second latency
    logger.info('🚀 Starting Deepgram transcription', {
      attendee: info.attendeeName,
      language: transcribeCode,
      meetingId: info.meetingId,
      provider: 'Deepgram Nova-3',
      targetLatency: '<500ms',
    });

    const session = new DeepgramTranscriptionSession({
      apiKey: config.deepgram.apiKey,
      languageCode: transcribeCode,
      attendeeName: info.attendeeName,
      onTranscript: (result) => {
        onTranscriptResult(connectionId, info, result);
      },
    });

    transcriptionSessions.set(connectionId, session);
    session.start().catch((err) => {
      logTranscription.error(`Session failed for ${info.attendeeName}`, err);
      logger.error('❌ Deepgram session failed', {
        connectionId,
        attendee: info.attendeeName,
        error: err.message,
        stack: err.stack,
      });
    });

    logger.info('✅ Deepgram Nova-3 session started', {
      attendee: info.attendeeName,
      language: transcribeCode,
      accuracy: '95-98%',
      latency: '<500ms',
    });
  } else {
    // Use AWS Transcribe (fallback)
    logger.info('🚀 Starting AWS Transcribe', {
      attendee: info.attendeeName,
      language: transcribeCode,
      meetingId: info.meetingId,
      provider: 'AWS Transcribe',
    });

    const session = new TranscriptionSession(transcribeCode, (result) => {
      onTranscriptResult(connectionId, info, result);
    });

    transcriptionSessions.set(connectionId, session);
    session.start().catch((err) => {
      logger.error('❌ AWS Transcribe session failed', {
        connectionId,
        attendee: info.attendeeName,
        error: err.message,
      });
    });

    logger.info('✅ AWS Transcribe session started', {
      attendee: info.attendeeName,
      language: transcribeCode,
    });
  }
}

function stopTranscription(connectionId: string): void {
  const session = transcriptionSessions.get(connectionId);
  if (session) {
    session.stop();
    transcriptionSessions.delete(connectionId);
    lastPartialTime.delete(connectionId);
  }
  cleanupPartialState(connectionId);
}

function cleanupPartialState(connectionId: string): void {
  preSynthCache.delete(connectionId);
  lastPreSynthTime.delete(connectionId);
  partialTranslationCache.delete(connectionId);
  const timer = stalePartialTimers.get(connectionId);
  if (timer) clearTimeout(timer);
  stalePartialTimers.delete(connectionId);
  interimPollyText.delete(connectionId);
  latestPartialState.delete(connectionId);
}

/* ------------------------------------------------------------------ */
/*  Speech transcript → Translate → Caption + TTS to partner           */
/* ------------------------------------------------------------------ */

async function onTranscriptResult(
  connectionId: string,
  speaker: ParticipantInfo,
  result: TranscriptResult,
): Promise<void> {
  const t0 = Date.now();
  const { text, isFinal, detectedLanguage, startTimeMs, endTimeMs } = result;

  // Source language (Translate code, e.g. 'en', 'hi')
  const srcLang = transcribeToTranslateCode(detectedLanguage);

  // Throttle partials
  if (!isFinal) {
    const now = Date.now();
    const last = lastPartialTime.get(connectionId) ?? 0;
    if (now - last < PARTIAL_THROTTLE_MS) return;
    lastPartialTime.set(connectionId, now);
  }

  // Find the other participant in this 2-person call
  const partner = connectionManager.getPartner(speaker.meetingId, connectionId);

  // Target language: partner's spoken language (translate code)
  // Falls back to speaker's declared target if partner hasn't joined yet
  const targetCode = partner
    ? getTranslateCode(partner.info.spokenLanguage)
    : getTranslateCode(speaker.targetLanguage);

  // Translate — reuse cached partial translation on finals when text matches
  let translatedText = text;
  let usedCache = false;
  if (srcLang !== targetCode) {
    const cached = partialTranslationCache.get(connectionId);
    if (isFinal && cached && cached.originalText === text) {
      translatedText = cached.translatedText;
      usedCache = true;
    } else {
      try {
        const r = await pivotTranslate(text, srcLang, targetCode);
        translatedText = r.translatedText;
      } catch (err: any) {
        console.error(`[Translate] ${srcLang}→${targetCode} failed:`, err.message);
        translatedText = text;
      }
    }

    // Cache partial translations for reuse on finals
    if (!isFinal) {
      partialTranslationCache.set(connectionId, { originalText: text, translatedText });
    } else {
      partialTranslationCache.delete(connectionId);
    }
  }

  const tTranslated = Date.now();

  // Build caption event
  const caption: CaptionEvent = {
    type: 'caption',
    speakerAttendeeId: speaker.attendeeId,
    speakerName: speaker.attendeeName,
    originalText: text,
    translatedText,
    isFinal,
    detectedLanguage: srcLang,
    targetLanguage: targetCode,
    startTimeMs,
    endTimeMs,
  };

  // Send caption to partner
  if (partner && partner.ws.readyState === WebSocket.OPEN) {
    partner.ws.send(JSON.stringify(caption));
  }

  // --- Background Polly pre-synthesis ---
  // Start Polly in the background during partials so the audio is ready
  // instantly when the final arrives. Throttled to 1 call/sec to limit cost.
  if (!isFinal && partner && translatedText.length > 10) {
    const now = Date.now();
    const lastTime = lastPreSynthTime.get(connectionId) ?? 0;
    if (now - lastTime >= PRE_SYNTH_THROTTLE_MS) {
      lastPreSynthTime.set(connectionId, now);
      preSynthCache.set(connectionId, {
        translatedText,
        audioPromise: synthesizeSpeech(translatedText, partner.info.spokenLanguage).catch(() => null),
      });
    }
  }

  // --- Stale partial timer: play Polly during long continuous speech ---
  // If no final arrives within 5s, synthesize the current partial so the
  // listener doesn't wait 30+ seconds. Tracks what was played to avoid repetition.
  if (!isFinal && partner && translatedText.length > 10) {
    // Save latest state so the timer callback can access it
    latestPartialState.set(connectionId, { translatedText, speaker });

    // Reset the timer on each partial (debounce)
    const existingTimer = stalePartialTimers.get(connectionId);
    if (existingTimer) clearTimeout(existingTimer);

    stalePartialTimers.set(connectionId, setTimeout(async () => {
      const state = latestPartialState.get(connectionId);
      const p = connectionManager.getPartner(speaker.meetingId, connectionId);
      if (!state || !p || p.ws.readyState !== WebSocket.OPEN) return;

      try {
        const audioBuffer = await synthesizeSpeech(state.translatedText, p.info.spokenLanguage);
        if (audioBuffer && p.ws.readyState === WebSocket.OPEN) {
          // Save what we played so we can skip it when the final arrives
          interimPollyText.set(connectionId, normalizeForComparison(state.translatedText));

          const audioEvent: TranslatedAudioEvent = {
            type: 'audio',
            speakerAttendeeId: state.speaker.attendeeId,
            audioData: audioBuffer.toString('base64'),
            targetLanguage: targetCode,
          };
          p.ws.send(JSON.stringify(audioEvent));
          console.log(
            `[Timing] ${state.speaker.attendeeName} (${srcLang}) → ${p.info.attendeeName} (${targetCode}): ` +
            `INTERIM polly (stale partial after ${STALE_PARTIAL_MS}ms)`
          );
        }
      } catch (err: any) {
        console.error(`[Polly] Interim synthesis failed:`, err.message);
      }
    }, STALE_PARTIAL_MS));
  }

  // --- Final transcript: synthesize TTS and send audio to partner ---
  if (isFinal && partner && partner.ws.readyState === WebSocket.OPEN) {
    // Cancel any pending stale partial timer
    const pendingTimer = stalePartialTimers.get(connectionId);
    if (pendingTimer) clearTimeout(pendingTimer);
    stalePartialTimers.delete(connectionId);
    latestPartialState.delete(connectionId);

    // Check if interim Polly already played similar text (avoid repetition)
    const interimPlayed = interimPollyText.get(connectionId);
    interimPollyText.delete(connectionId);

    const normalizedFinal = normalizeForComparison(translatedText);
    if (interimPlayed && normalizedFinal.startsWith(interimPlayed)) {
      // Already played via interim — skip to avoid repetition
      console.log(
        `[Timing] ${speaker.attendeeName} (${srcLang}) → ${partner.info.attendeeName} (${targetCode}): ` +
        `SKIPPED final polly (already played via interim)`
      );
      preSynthCache.delete(connectionId);
      lastPreSynthTime.delete(connectionId);
      return;
    }

    const tPollyStart = Date.now();

    // Check if we have pre-synthesized audio that matches
    const cached = preSynthCache.get(connectionId);
    preSynthCache.delete(connectionId);
    lastPreSynthTime.delete(connectionId);

    let audioBuffer: Buffer | null = null;
    let usedPreSynth = false;

    if (cached && cached.translatedText === translatedText) {
      // Cache hit — Polly was already running in the background
      audioBuffer = await cached.audioPromise;
      usedPreSynth = !!audioBuffer;
    }

    // Fresh synthesis if no cache hit or pre-synth returned null
    if (!audioBuffer) {
      try {
        audioBuffer = await synthesizeSpeech(translatedText, partner.info.spokenLanguage);
      } catch (err: any) {
        console.error(`[Polly] Synthesis failed for ${targetCode}:`, err.message);
      }
    }

    console.log(
      `[Timing] ${speaker.attendeeName} (${srcLang}) → ${partner.info.attendeeName} (${targetCode}): ` +
      `translate=${tTranslated - t0}ms${usedCache ? ' (cached)' : ''}, ` +
      `polly=${Date.now() - tPollyStart}ms${usedPreSynth ? ' (pre-synth)' : ''}, ` +
      `total=${Date.now() - t0}ms`
    );

    if (audioBuffer && partner.ws.readyState === WebSocket.OPEN) {
      const audioEvent: TranslatedAudioEvent = {
        type: 'audio',
        speakerAttendeeId: speaker.attendeeId,
        audioData: audioBuffer.toString('base64'),
        targetLanguage: targetCode,
      };
      partner.ws.send(JSON.stringify(audioEvent));
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Disconnect + helpers                                               */
/* ------------------------------------------------------------------ */

function handleDisconnect(connectionId: string): void {
  stopTranscription(connectionId);
  const info = connectionManager.remove(connectionId);
  if (info) {
    console.log(`[WS] Disconnected: ${info.attendeeName} from ${info.meetingId}`);
  }
}

function sendError(ws: WebSocket, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', message }));
  }
}
