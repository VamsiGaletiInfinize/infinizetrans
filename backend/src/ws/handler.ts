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
  }
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

  // Translate (pivotTranslate internally optimizes for English pairs → 1 hop)
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

  // For final transcripts: synthesize TTS and send audio to partner
  if (isFinal && partner && partner.ws.readyState === WebSocket.OPEN) {
    console.log(
      `[Timing] ${speaker.attendeeName} (${srcLang}) → ${partner.info.attendeeName} (${targetCode}): ` +
      `translate=${tTranslated - t0}ms`
    );

    try {
      const tPollyStart = Date.now();
      const audioBuffer = await synthesizeSpeech(translatedText, partner.info.spokenLanguage);
      if (audioBuffer && partner.ws.readyState === WebSocket.OPEN) {
        const audioEvent: TranslatedAudioEvent = {
          type: 'audio',
          speakerAttendeeId: speaker.attendeeId,
          audioData: audioBuffer.toString('base64'),
          targetLanguage: targetCode,
        };
        partner.ws.send(JSON.stringify(audioEvent));

        console.log(
          `[Timing] Polly ${targetCode}: synthesis=${Date.now() - tPollyStart}ms, ` +
          `total_pipeline=${Date.now() - t0}ms`
        );
      }
    } catch (err: any) {
      console.error(`[Polly] Synthesis failed for ${targetCode}:`, err.message);
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
