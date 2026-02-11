import { WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { connectionManager } from './connectionManager';
import { TranscriptionSession, TranscriptResult } from '../services/transcribe';
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

/* ------------------------------------------------------------------ */
/*  State per connection                                               */
/* ------------------------------------------------------------------ */

const transcriptionSessions = new Map<string, TranscriptionSession>();
const PARTIAL_THROTTLE_MS = 100;
const lastPartialTime = new Map<string, number>();
const MAX_FRAME_BYTES = 65_536;

/* ------------------------------------------------------------------ */
/*  Incremental TTS state                                              */
/*                                                                     */
/*  Tracks how much of the current partial transcript has already      */
/*  been translated + synthesized, so we can TTS sentence-by-sentence  */
/*  instead of waiting for Transcribe's isFinal.                       */
/* ------------------------------------------------------------------ */

interface IncrementalTtsState {
  /** Characters from the original (source-language) partial text already sent for TTS. */
  spokenLength: number;
  /** Pending TTS promise chain — ensures audio chunks are sent in order. */
  ttsChain: Promise<void>;
  /** Timestamp of last TTS chunk enqueued — for time-based forcing. */
  lastTtsTime: number;
}

const incrementalTtsState = new Map<string, IncrementalTtsState>();

/** Sentence-ending punctuation across supported languages. */
const SENTENCE_END_RE = /[.!?。！？]\s*/g;
/** Clause-level boundaries (commas, semicolons, colons, dashes followed by space). */
const CLAUSE_END_RE = /[,;:–—]\s+/g;
/** Minimum characters before we trigger incremental TTS (avoids tiny fragments). */
const MIN_TTS_CHARS = 5;
/** Force a TTS chunk at a word boundary after this many new characters. */
const FORCE_TTS_CHARS = 25;
/** Force TTS if this many ms have elapsed since the last chunk, even with fewer chars. */
const FORCE_TTS_INTERVAL_MS = 1500;

/**
 * Find the position just after the last sentence-ending punctuation
 * in `text` that occurs at or after `afterPos`.
 * Returns -1 if no boundary found.
 */
function findLastBoundary(text: string, afterPos: number, regex: RegExp): number {
  regex.lastIndex = afterPos;
  let lastEnd = -1;
  let m;
  while ((m = regex.exec(text)) !== null) {
    lastEnd = m.index + m[0].length;
  }
  return lastEnd;
}

/** Find the last whitespace position in `text` for a clean word-boundary split. */
function findLastWordBoundary(text: string): number {
  const i = text.lastIndexOf(' ');
  return i > 0 ? i : text.length;
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
/*  Transcription lifecycle (fixed language)                           */
/* ------------------------------------------------------------------ */

function startTranscription(connectionId: string, info: ParticipantInfo): void {
  stopTranscription(connectionId);

  const transcribeCode = getTranscribeCode(info.spokenLanguage);
  if (!transcribeCode) {
    console.error(`[Transcribe] No transcribe code for ${info.spokenLanguage}`);
    return;
  }

  const session = new TranscriptionSession(transcribeCode, (result) => {
    onTranscriptResult(connectionId, info, result);
  });

  transcriptionSessions.set(connectionId, session);
  session.start().catch((err) => {
    console.error(`[Transcribe] Session failed for ${connectionId}:`, err.message);
  });

  console.log(`[Transcribe] Started fixed-language (${transcribeCode}) session for ${info.attendeeName}`);
}

function stopTranscription(connectionId: string): void {
  const session = transcriptionSessions.get(connectionId);
  if (session) {
    session.stop();
    transcriptionSessions.delete(connectionId);
    lastPartialTime.delete(connectionId);
    incrementalTtsState.delete(connectionId);
  }
}

/* ------------------------------------------------------------------ */
/*  Speech transcript → Translate → Caption + Incremental TTS          */
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

  // Find the other participant in this 2-person call
  const partner = connectionManager.getPartner(speaker.meetingId, connectionId);

  // Target language: partner's spoken language (translate code)
  const targetCode = partner
    ? getTranslateCode(partner.info.spokenLanguage)
    : getTranslateCode(speaker.targetLanguage);

  // --- Incremental TTS: check every partial for sentence boundaries ---
  // This runs before the caption throttle so we don't miss boundaries.
  if (!isFinal) {
    enqueueIncrementalTts(connectionId, speaker, text, srcLang, partner, targetCode);

    // Throttle partial caption updates (text-only display)
    const now = Date.now();
    const last = lastPartialTime.get(connectionId) ?? 0;
    if (now - last < PARTIAL_THROTTLE_MS) return;
    lastPartialTime.set(connectionId, now);
  }

  // Translate full text for caption display
  let translatedText = text;
  if (srcLang !== targetCode) {
    try {
      const r = await pivotTranslate(text, srcLang, targetCode);
      translatedText = r.translatedText;
    } catch (err: any) {
      console.error(`[Translate] ${srcLang}→${targetCode} failed:`, err.message);
      translatedText = text;
    }
  }

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

  // --- Final: TTS only the remaining un-spoken tail ---
  if (isFinal && partner && partner.ws.readyState === WebSocket.OPEN) {
    const state = incrementalTtsState.get(connectionId);
    const spokenLen = state?.spokenLength ?? 0;
    const remainingOriginal = text.substring(spokenLen).trim();

    if (remainingOriginal.length > 0) {
      // Translate just the remaining portion
      let remainingTranslated = remainingOriginal;
      if (srcLang !== targetCode) {
        try {
          const r = await pivotTranslate(remainingOriginal, srcLang, targetCode);
          remainingTranslated = r.translatedText;
        } catch {
          remainingTranslated = remainingOriginal;
        }
      }

      const tTranslated = Date.now();

      try {
        const audioBuffer = await synthesizeSpeech(remainingTranslated, partner.info.spokenLanguage);
        if (audioBuffer && partner.ws.readyState === WebSocket.OPEN) {
          const audioEvent: TranslatedAudioEvent = {
            type: 'audio',
            speakerAttendeeId: speaker.attendeeId,
            audioData: audioBuffer.toString('base64'),
            targetLanguage: targetCode,
          };
          partner.ws.send(JSON.stringify(audioEvent));

          console.log(
            `[Timing] Final tail "${remainingOriginal.substring(0, 40)}": ` +
            `translate=${tTranslated - t0}ms, total=${Date.now() - t0}ms`
          );
        }
      } catch (err: any) {
        console.error(`[Polly] Final tail synthesis failed:`, err.message);
      }
    } else {
      console.log(`[Timing] Final: all text already spoken incrementally (${Date.now() - t0}ms)`);
    }

    // Reset incremental state for the next speech segment
    incrementalTtsState.delete(connectionId);
  }
}

/* ------------------------------------------------------------------ */
/*  Incremental TTS — sentence-boundary detection on partials          */
/*                                                                     */
/*  As partial transcripts grow, we detect completed sentences and     */
/*  immediately translate + synthesize them. This gives the listener   */
/*  audio feedback during continuous speech, instead of waiting for    */
/*  Transcribe's isFinal (which requires a pause).                     */
/*                                                                     */
/*  Uses a promise chain per connection to guarantee audio chunks      */
/*  arrive at the client in the correct order.                         */
/* ------------------------------------------------------------------ */

function enqueueIncrementalTts(
  connectionId: string,
  speaker: ParticipantInfo,
  originalText: string,
  srcLang: string,
  partner: { ws: WebSocket; info: ParticipantInfo } | null,
  targetCode: string,
): void {
  if (!partner || partner.ws.readyState !== WebSocket.OPEN) return;

  let state = incrementalTtsState.get(connectionId);
  if (!state) {
    state = { spokenLength: 0, ttsChain: Promise.resolve(), lastTtsTime: Date.now() };
    incrementalTtsState.set(connectionId, state);
  }

  const newText = originalText.substring(state.spokenLength);
  if (newText.length < MIN_TTS_CHARS) return;

  const now = Date.now();
  const elapsed = now - state.lastTtsTime;

  // 1. Best: sentence boundary (.!?)
  let chunkEnd = findLastBoundary(originalText, state.spokenLength, SENTENCE_END_RE);

  // 2. Good: clause boundary (,;:—) if enough text accumulated
  if (chunkEnd <= state.spokenLength && newText.length >= 10) {
    chunkEnd = findLastBoundary(originalText, state.spokenLength, CLAUSE_END_RE);
  }

  // 3. Fallback: force at word boundary if text is long enough
  if (chunkEnd <= state.spokenLength && newText.length > FORCE_TTS_CHARS) {
    const wordBoundary = findLastWordBoundary(newText);
    chunkEnd = state.spokenLength + wordBoundary;
  }

  // 4. Time-based: if enough time elapsed, force at word boundary even with less text
  if (chunkEnd <= state.spokenLength && elapsed >= FORCE_TTS_INTERVAL_MS && newText.length >= 8) {
    const wordBoundary = findLastWordBoundary(newText);
    chunkEnd = state.spokenLength + wordBoundary;
  }

  if (chunkEnd <= state.spokenLength) return;

  const chunk = originalText.substring(state.spokenLength, chunkEnd).trim();
  if (chunk.length < MIN_TTS_CHARS) return;

  // Update state immediately so the next partial doesn't re-process
  state.spokenLength = chunkEnd;
  state.lastTtsTime = now;

  // Chain the TTS work to preserve audio ordering
  state.ttsChain = state.ttsChain.then(async () => {
    try {
      // Translate the chunk
      let translatedChunk = chunk;
      if (srcLang !== targetCode) {
        try {
          const r = await pivotTranslate(chunk, srcLang, targetCode);
          translatedChunk = r.translatedText;
        } catch {
          translatedChunk = chunk;
        }
      }

      // Synthesize and send audio
      const audioBuffer = await synthesizeSpeech(translatedChunk, partner.info.spokenLanguage);
      if (audioBuffer && partner.ws.readyState === WebSocket.OPEN) {
        const audioEvent: TranslatedAudioEvent = {
          type: 'audio',
          speakerAttendeeId: speaker.attendeeId,
          audioData: audioBuffer.toString('base64'),
          targetLanguage: targetCode,
        };
        partner.ws.send(JSON.stringify(audioEvent));

        console.log(
          `[IncrementalTTS] ${speaker.attendeeName}: "${chunk.substring(0, 50)}${chunk.length > 50 ? '...' : ''}" → ${targetCode} (${chunk.length}ch)`
        );
      }
    } catch (err: any) {
      console.error(`[IncrementalTTS] Failed:`, err.message);
    }
  });
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
