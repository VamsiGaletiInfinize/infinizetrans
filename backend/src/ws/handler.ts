import { WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { connectionManager } from './connectionManager';
import { TranscriptionSession, TranscriptResult } from '../services/transcribe';
import { DeepgramTranscriptionSession } from '../services/deepgram';
import { NovaSonicSession } from '../services/novaSonic';
import { pivotTranslate } from '../services/translate';
import { synthesizeSpeech } from '../services/polly';
import {
  transcribeToTranslateCode,
  getTranslateCode,
  getTranscribeCode,
  getNovaSonicVoice,
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

type SessionType = TranscriptionSession | DeepgramTranscriptionSession | NovaSonicSession;
const transcriptionSessions = new Map<string, SessionType>();
const PARTIAL_THROTTLE_MS = 100;
const lastPartialTime = new Map<string, number>();
const MAX_FRAME_BYTES = 65_536;

/* Legacy pipeline state (only used when pipeline.provider === 'legacy') */
const partialTranslationCache = new Map<string, { originalText: string; translatedText: string }>();

interface PreSynthEntry {
  translatedText: string;
  audioPromise: Promise<Buffer | null>;
}
const preSynthCache = new Map<string, PreSynthEntry>();
const lastPreSynthTime = new Map<string, number>();
const PRE_SYNTH_THROTTLE_MS = 1000;

const STALE_PARTIAL_MS = 5000;
const stalePartialTimers = new Map<string, ReturnType<typeof setTimeout>>();
const interimPollyFired = new Set<string>();
const latestPartialState = new Map<string, { translatedText: string; speaker: ParticipantInfo }>();

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
        logger.info('🎤 Mic ON — starting session', {
          attendee: conn.info.attendeeName,
        });
        startTranscription(connectionId, conn.info);
      }
      break;
    }

    case 'mic_off': {
      const session = transcriptionSessions.get(connectionId);
      if (session instanceof NovaSonicSession) {
        logger.info('🔇 Mic OFF — finishing Nova Sonic session gracefully', { connectionId });
        session.finishGracefully();
        transcriptionSessions.delete(connectionId);
      } else if (session instanceof DeepgramTranscriptionSession) {
        logger.info('🔇 Mic OFF — finishing Deepgram session gracefully', { connectionId });
        session.finishGracefully();
        transcriptionSessions.delete(connectionId);
        lastPartialTime.delete(connectionId);
        cleanupPartialState(connectionId);
      } else {
        stopTranscription(connectionId);
      }
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Audio frames → Session                                             */
/* ------------------------------------------------------------------ */

function handleAudioFrame(connectionId: string, data: Buffer): void {
  if (data.length > MAX_FRAME_BYTES) return;
  const session = transcriptionSessions.get(connectionId);

  // Auto-restart if session died
  const needsRestart = !session
    || (session instanceof DeepgramTranscriptionSession && !session.isAlive())
    || (session instanceof NovaSonicSession && !session.isAlive());

  if (needsRestart) {
    const conn = connectionManager.get(connectionId);
    if (conn) {
      logger.info('🔄 Auto-restarting session (audio arrived with no active session)', {
        attendee: conn.info.attendeeName,
      });
      startTranscription(connectionId, conn.info);
      const newSession = transcriptionSessions.get(connectionId);
      if (newSession) newSession.pushAudio(data);
    }
    return;
  }

  session!.pushAudio(data);
}

/* ------------------------------------------------------------------ */
/*  Session lifecycle                                                  */
/* ------------------------------------------------------------------ */

function startTranscription(connectionId: string, info: ParticipantInfo): void {
  stopTranscription(connectionId);

  // Determine target language from partner or speaker's declared target
  const partner = connectionManager.getPartner(info.meetingId, connectionId);
  const targetLang = partner?.info.spokenLanguage || info.targetLanguage;

  // Check if Nova Sonic is enabled and supports both languages
  const useNovaSonic = config.pipeline.provider === 'nova-sonic'
    && getNovaSonicVoice(targetLang) !== null;

  if (useNovaSonic) {
    startNovaSonicSession(connectionId, info, targetLang);
  } else {
    startLegacySession(connectionId, info);
  }
}

/* ------------------------------------------------------------------ */
/*  Nova Sonic pipeline (speech-to-speech)                             */
/* ------------------------------------------------------------------ */

function startNovaSonicSession(
  connectionId: string,
  info: ParticipantInfo,
  targetLanguage: string,
): void {
  const voiceId = getNovaSonicVoice(targetLanguage)!;

  logger.info('🚀 Starting Nova Sonic session', {
    attendee: info.attendeeName,
    source: info.spokenLanguage,
    target: targetLanguage,
    voice: voiceId,
    model: config.novaSonic.modelId,
  });

  const session = new NovaSonicSession({
    region: config.novaSonic.region,
    modelId: config.novaSonic.modelId,
    sourceLanguage: info.spokenLanguage,
    targetLanguage,
    voiceId,
    attendeeName: info.attendeeName,

    onCaption: (originalText, translatedText, isFinal) => {
      const p = connectionManager.getPartner(info.meetingId, connectionId);
      if (!p || p.ws.readyState !== WebSocket.OPEN) return;

      const caption: CaptionEvent = {
        type: 'caption',
        speakerAttendeeId: info.attendeeId,
        speakerName: info.attendeeName,
        originalText,
        translatedText,
        isFinal,
        detectedLanguage: info.spokenLanguage,
        targetLanguage,
      };
      p.ws.send(JSON.stringify(caption));
    },

    onAudioComplete: (wavBuffer) => {
      const p = connectionManager.getPartner(info.meetingId, connectionId);
      if (!p || p.ws.readyState !== WebSocket.OPEN) return;

      const audioEvent: TranslatedAudioEvent = {
        type: 'audio',
        speakerAttendeeId: info.attendeeId,
        audioData: wavBuffer.toString('base64'),
        targetLanguage,
      };
      p.ws.send(JSON.stringify(audioEvent));

      logger.info(`[Timing] ${info.attendeeName} (${info.spokenLanguage}) → ${p.info.attendeeName} (${targetLanguage}): Nova Sonic audio sent`);
    },

    onError: (error) => {
      logger.error('[NovaSonic] Session error, falling back to legacy pipeline', {
        error: error.message,
        attendee: info.attendeeName,
      });
      // Fall back to legacy pipeline
      transcriptionSessions.delete(connectionId);
      startLegacySession(connectionId, info);
    },
  });

  transcriptionSessions.set(connectionId, session);
  session.start().catch((err) => {
    logger.error('❌ Nova Sonic session failed to start', {
      connectionId,
      attendee: info.attendeeName,
      error: err.message,
    });
    // Fall back to legacy pipeline
    transcriptionSessions.delete(connectionId);
    startLegacySession(connectionId, info);
  });
}

/* ------------------------------------------------------------------ */
/*  Legacy pipeline (Deepgram + Translate + Polly)                     */
/* ------------------------------------------------------------------ */

function startLegacySession(connectionId: string, info: ParticipantInfo): void {
  const transcribeCode = getTranscribeCode(info.spokenLanguage);
  if (!transcribeCode) {
    console.error(`[Transcribe] No transcribe code for ${info.spokenLanguage}`);
    return;
  }

  const useDeepgram = config.deepgram.provider === 'deepgram' && config.deepgram.apiKey;

  if (useDeepgram) {
    logger.info('🚀 Starting Deepgram transcription (legacy)', {
      attendee: info.attendeeName,
      language: transcribeCode,
      meetingId: info.meetingId,
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
      });
    });
  } else {
    logger.info('🚀 Starting AWS Transcribe (legacy)', {
      attendee: info.attendeeName,
      language: transcribeCode,
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
  interimPollyFired.delete(connectionId);
  latestPartialState.delete(connectionId);
}

/* ------------------------------------------------------------------ */
/*  Legacy: Speech transcript → Translate → Caption + TTS to partner   */
/* ------------------------------------------------------------------ */

async function onTranscriptResult(
  connectionId: string,
  speaker: ParticipantInfo,
  result: TranscriptResult,
): Promise<void> {
  const t0 = Date.now();
  const { text, isFinal, detectedLanguage, startTimeMs, endTimeMs } = result;

  const srcLang = transcribeToTranslateCode(detectedLanguage);

  if (!isFinal) {
    const now = Date.now();
    const last = lastPartialTime.get(connectionId) ?? 0;
    if (now - last < PARTIAL_THROTTLE_MS) return;
    lastPartialTime.set(connectionId, now);
  }

  const partner = connectionManager.getPartner(speaker.meetingId, connectionId);

  const targetCode = partner
    ? getTranslateCode(partner.info.spokenLanguage)
    : getTranslateCode(speaker.targetLanguage);

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

    if (!isFinal) {
      partialTranslationCache.set(connectionId, { originalText: text, translatedText });
    } else {
      partialTranslationCache.delete(connectionId);
    }
  }

  const tTranslated = Date.now();

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

  if (partner && partner.ws.readyState === WebSocket.OPEN) {
    partner.ws.send(JSON.stringify(caption));
  }

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

  if (!isFinal && partner && translatedText.length > 10 && !interimPollyFired.has(connectionId)) {
    latestPartialState.set(connectionId, { translatedText, speaker });

    const existingTimer = stalePartialTimers.get(connectionId);
    if (existingTimer) clearTimeout(existingTimer);

    stalePartialTimers.set(connectionId, setTimeout(async () => {
      const state = latestPartialState.get(connectionId);
      const p = connectionManager.getPartner(speaker.meetingId, connectionId);
      if (!state || !p || p.ws.readyState !== WebSocket.OPEN) return;

      interimPollyFired.add(connectionId);

      try {
        const audioBuffer = await synthesizeSpeech(state.translatedText, p.info.spokenLanguage);
        if (audioBuffer && p.ws.readyState === WebSocket.OPEN) {
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

  if (isFinal && partner && partner.ws.readyState === WebSocket.OPEN) {
    const pendingTimer = stalePartialTimers.get(connectionId);
    if (pendingTimer) clearTimeout(pendingTimer);
    stalePartialTimers.delete(connectionId);
    latestPartialState.delete(connectionId);

    if (interimPollyFired.has(connectionId)) {
      interimPollyFired.delete(connectionId);
      console.log(
        `[Timing] ${speaker.attendeeName} (${srcLang}) → ${partner.info.attendeeName} (${targetCode}): ` +
        `SKIPPED final polly (already played via interim)`
      );
      preSynthCache.delete(connectionId);
      lastPreSynthTime.delete(connectionId);
      return;
    }

    const tPollyStart = Date.now();

    const cached = preSynthCache.get(connectionId);
    preSynthCache.delete(connectionId);
    lastPreSynthTime.delete(connectionId);

    let audioBuffer: Buffer | null = null;
    let usedPreSynth = false;

    if (cached && cached.translatedText === translatedText) {
      audioBuffer = await cached.audioPromise;
      usedPreSynth = !!audioBuffer;
    }

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
