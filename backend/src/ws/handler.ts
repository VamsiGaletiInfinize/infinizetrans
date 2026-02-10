import { WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { connectionManager, ManagedConnection } from './connectionManager';
import { TranscriptionSession, TranscriptResult } from '../services/transcribe';
import { pivotTranslate, autoTranslate } from '../services/translate';
import { synthesizeSpeech } from '../services/polly';
import {
  transcribeToTranslateCode,
  getTranslateCode,
  PIVOT_LANGUAGE,
} from '../utils/languages';
import {
  WsClientMessage,
  CaptionEvent,
  TranslatedAudioEvent,
  ChatEvent,
  ParticipantInfo,
} from '../types';

/* ------------------------------------------------------------------ */
/*  State per connection                                               */
/* ------------------------------------------------------------------ */

const transcriptionSessions = new Map<string, TranscriptionSession>();
const PARTIAL_THROTTLE_MS = 100; // reduced from 300ms for faster caption updates
const lastPartialTime = new Map<string, number>();
const MAX_FRAME_BYTES = 65_536;

/* ------------------------------------------------------------------ */
/*  Pivot cache — reuse partial pivot translations for finals          */
/* ------------------------------------------------------------------ */

interface PivotCacheEntry {
  sourceText: string;
  pivotText: string;
  srcLang: string;
  timestamp: number;
}

const pivotCache = new Map<string, PivotCacheEntry>();
const PIVOT_CACHE_TTL_MS = 10_000;

function getCachedPivot(connectionId: string, text: string, srcLang: string): string | null {
  const entry = pivotCache.get(connectionId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > PIVOT_CACHE_TTL_MS) {
    pivotCache.delete(connectionId);
    return null;
  }
  // Reuse if the final text matches or starts with the cached partial
  if (entry.srcLang === srcLang && text === entry.sourceText) {
    return entry.pivotText;
  }
  return null;
}

function setCachedPivot(connectionId: string, sourceText: string, pivotText: string, srcLang: string): void {
  pivotCache.set(connectionId, { sourceText, pivotText, srcLang, timestamp: Date.now() });
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
        targetLanguage: msg.targetLanguage,
        translatedAudioEnabled: msg.translatedAudioEnabled,
      };
      connectionManager.add(connectionId, ws, info);
      startTranscription(connectionId, info);
      ws.send(JSON.stringify({ type: 'joined', connectionId }));
      break;
    }

    case 'updateTarget': {
      connectionManager.updateInfo(connectionId, {
        targetLanguage: msg.targetLanguage,
      });
      break;
    }

    case 'toggleAudio': {
      connectionManager.updateInfo(connectionId, {
        translatedAudioEnabled: msg.enabled,
      });
      break;
    }

    case 'chat': {
      await handleChatMessage(connectionId, msg.text);
      break;
    }

    case 'stop': {
      stopTranscription(connectionId);
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
  if (session) session.pushAudio(data);
}

/* ------------------------------------------------------------------ */
/*  Transcription lifecycle (auto language detection)                   */
/* ------------------------------------------------------------------ */

function startTranscription(connectionId: string, info: ParticipantInfo): void {
  stopTranscription(connectionId);

  const session = new TranscriptionSession((result) => {
    onTranscriptResult(connectionId, info, result);
  });

  transcriptionSessions.set(connectionId, session);
  session.start().catch((err) => {
    console.error(`[Transcribe] Session failed for ${connectionId}:`, err.message);
  });

  console.log(`[Transcribe] Started auto-detect session for ${info.attendeeName}`);
}

function stopTranscription(connectionId: string): void {
  const session = transcriptionSessions.get(connectionId);
  if (session) {
    session.stop();
    transcriptionSessions.delete(connectionId);
    lastPartialTime.delete(connectionId);
    pivotCache.delete(connectionId);
  }
}

/* ------------------------------------------------------------------ */
/*  Speech transcript → Pivot translate → Broadcast                    */
/* ------------------------------------------------------------------ */

async function onTranscriptResult(
  connectionId: string,
  speaker: ParticipantInfo,
  result: TranscriptResult,
): Promise<void> {
  const t0 = Date.now();
  const { text, isFinal, detectedLanguage, startTimeMs, endTimeMs } = result;

  // Map Transcribe code (e.g. "en-US") → Translate code (e.g. "en")
  const srcLang = detectedLanguage
    ? transcribeToTranslateCode(detectedLanguage)
    : PIVOT_LANGUAGE;

  // Throttle partials
  if (!isFinal) {
    const now = Date.now();
    const last = lastPartialTime.get(connectionId) ?? 0;
    if (now - last < PARTIAL_THROTTLE_MS) return;
    lastPartialTime.set(connectionId, now);
  }

  const participants = connectionManager.getMeetingParticipants(speaker.meetingId);
  if (participants.length === 0) return;

  // Step 1: Pivot to English (if not already English)
  let pivotText = text;
  if (srcLang !== PIVOT_LANGUAGE) {
    // Check pivot cache first
    const cached = getCachedPivot(connectionId, text, srcLang);
    if (cached) {
      pivotText = cached;
    } else {
      try {
        const r = await pivotTranslate(text, srcLang, PIVOT_LANGUAGE);
        pivotText = r.translatedText;
        setCachedPivot(connectionId, text, pivotText, srcLang);
      } catch (err: any) {
        console.error(`[Pivot] ${srcLang}→en failed:`, err.message);
        pivotText = text; // fallback to original
      }
    }
  }

  const tPivot = Date.now();

  // Step 2: Group listeners by target language
  const groups = new Map<string, ManagedConnection[]>();
  for (const p of participants) {
    const tgt = getTranslateCode(p.info.targetLanguage);
    if (!groups.has(tgt)) groups.set(tgt, []);
    groups.get(tgt)!.push(p);
  }

  // Step 3: Translate from English pivot → each target, send captions immediately
  // Then fire Polly synthesis in background (non-blocking)
  const pollyJobs: Promise<void>[] = [];

  const translateJobs = Array.from(groups.entries()).map(
    async ([targetCode, members]) => {
      try {
        const tTranslateStart = Date.now();
        let translatedText: string;

        if (targetCode === srcLang) {
          translatedText = text;
        } else if (targetCode === PIVOT_LANGUAGE) {
          translatedText = pivotText;
        } else {
          const r = await pivotTranslate(pivotText, PIVOT_LANGUAGE, targetCode);
          translatedText = r.translatedText;
        }

        // Send caption immediately (fast path)
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
        const json = JSON.stringify(caption);
        for (const m of members) {
          if (m.ws.readyState === WebSocket.OPEN) m.ws.send(json);
        }

        const tCaptionSent = Date.now();

        if (isFinal) {
          console.log(
            `[Timing] ${speaker.attendeeName} → ${targetCode}: ` +
            `pivot=${tPivot - t0}ms, translate=${tCaptionSent - tTranslateStart}ms, ` +
            `caption_total=${tCaptionSent - t0}ms`
          );

          // Fire Polly in background — don't block caption delivery
          pollyJobs.push(
            synthesizeForMembers(speaker, translatedText, targetCode, members, t0)
          );
        }
      } catch (err: any) {
        console.error(`[Translate] pivot→${targetCode} failed:`, err.message);
      }
    },
  );

  // Wait for all captions to be sent
  await Promise.allSettled(translateJobs);

  // Wait for Polly synthesis (runs in parallel for all target languages)
  if (pollyJobs.length > 0) {
    await Promise.allSettled(pollyJobs);
  }
}

/* ------------------------------------------------------------------ */
/*  Chat → Auto-detect → Pivot → Broadcast                            */
/* ------------------------------------------------------------------ */

async function handleChatMessage(
  connectionId: string,
  text: string,
): Promise<void> {
  const conn = connectionManager.get(connectionId);
  if (!conn) return;

  const sender = conn.info;
  const participants = connectionManager.getMeetingParticipants(sender.meetingId);
  if (participants.length === 0) return;

  // Group by target language
  const groups = new Map<string, ManagedConnection[]>();
  for (const p of participants) {
    const tgt = getTranslateCode(p.info.targetLanguage);
    if (!groups.has(tgt)) groups.set(tgt, []);
    groups.get(tgt)!.push(p);
  }

  // Translate for each group using auto-detect
  const jobs = Array.from(groups.entries()).map(
    async ([targetCode, members]) => {
      try {
        const { detectedSource, translatedText } = await autoTranslate(text, targetCode);

        const chatEvent: ChatEvent = {
          type: 'chat',
          senderAttendeeId: sender.attendeeId,
          senderName: sender.attendeeName,
          originalText: text,
          translatedText,
          detectedLanguage: detectedSource,
          targetLanguage: targetCode,
          timestamp: Date.now(),
        };
        const json = JSON.stringify(chatEvent);
        for (const m of members) {
          if (m.ws.readyState === WebSocket.OPEN) m.ws.send(json);
        }
      } catch (err: any) {
        console.error(`[Chat] Translation to ${targetCode} failed:`, err.message);
      }
    },
  );

  await Promise.allSettled(jobs);
}

/* ------------------------------------------------------------------ */
/*  Polly synthesis                                                    */
/* ------------------------------------------------------------------ */

async function synthesizeForMembers(
  speaker: ParticipantInfo,
  translatedText: string,
  targetCode: string,
  members: ManagedConnection[],
  pipelineStartMs: number,
): Promise<void> {
  const wantAudio = members.filter(
    (m) =>
      m.info.translatedAudioEnabled &&
      m.info.attendeeId !== speaker.attendeeId &&
      m.ws.readyState === WebSocket.OPEN,
  );
  if (wantAudio.length === 0) return;

  try {
    const tPollyStart = Date.now();
    const audioBuffer = await synthesizeSpeech(
      translatedText,
      wantAudio[0].info.targetLanguage,
    );
    if (!audioBuffer) return; // No voice for this language

    const tPollyDone = Date.now();

    const audioEvent: TranslatedAudioEvent = {
      type: 'audio',
      speakerAttendeeId: speaker.attendeeId,
      audioData: audioBuffer.toString('base64'),
      targetLanguage: targetCode,
    };
    const json = JSON.stringify(audioEvent);
    for (const m of wantAudio) m.ws.send(json);

    console.log(
      `[Timing] Polly ${targetCode}: synthesis=${tPollyDone - tPollyStart}ms, ` +
      `total_pipeline=${Date.now() - pipelineStartMs}ms`
    );
  } catch (err: any) {
    console.error(`[Polly] Synthesis failed for ${targetCode}:`, err.message);
  }
}

/* ------------------------------------------------------------------ */
/*  Disconnect + helpers                                               */
/* ------------------------------------------------------------------ */

function handleDisconnect(connectionId: string): void {
  stopTranscription(connectionId);
  pivotCache.delete(connectionId);
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
