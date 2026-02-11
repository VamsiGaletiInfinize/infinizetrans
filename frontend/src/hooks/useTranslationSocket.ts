'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Caption, WsServerMessage, WsJoinMessage } from '@/types';
import { AudioPlayer } from '@/lib/audioPlayer';

export interface TranslationSocketOptions {
  meetingId: string;
  attendeeId: string;
  attendeeName: string;
  spokenLanguage: string;
  targetLanguage: string;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 500;
const MAX_RECONNECT_DELAY = 8000;

export function useTranslationSocket(
  options: TranslationSocketOptions | null,
) {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const intentionalClose = useRef(false);

  const sendAudioFrame = useCallback((pcm: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(pcm);
  }, []);

  const connectWs = useCallback(() => {
    const opts = optionsRef.current;
    if (!opts) return;

    // Clean up any existing connection
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    if (!playerRef.current) playerRef.current = new AudioPlayer();

    ws.onopen = () => {
      setConnected(true);
      reconnectAttempts.current = 0;
      console.log('[WS] Connected');

      const join: WsJoinMessage = {
        action: 'join',
        meetingId: opts.meetingId,
        attendeeId: opts.attendeeId,
        attendeeName: opts.attendeeName,
        spokenLanguage: opts.spokenLanguage,
        targetLanguage: opts.targetLanguage,
      };
      ws.send(JSON.stringify(join));
    };

    ws.onmessage = (ev) => {
      try {
        const msg: WsServerMessage = JSON.parse(ev.data);

        if (msg.type === 'caption') {
          setCaptions((prev) => applyCaptionUpdate(prev, msg as any));
        } else if (msg.type === 'audio') {
          playerRef.current?.playMp3((msg as any).audioData);
        } else if (msg.type === 'error') {
          console.error('[WS] Server error:', (msg as any).message);
        }
      } catch { /* ignore non-JSON (e.g. joined ack) */ }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      // Auto-reconnect unless intentionally closed
      if (!intentionalClose.current && optionsRef.current) {
        const attempt = reconnectAttempts.current;
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            INITIAL_RECONNECT_DELAY * Math.pow(2, attempt),
            MAX_RECONNECT_DELAY,
          );
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimer.current = setTimeout(() => {
            reconnectAttempts.current++;
            connectWs();
          }, delay);
        } else {
          console.error('[WS] Max reconnect attempts reached');
        }
      }
    };

    ws.onerror = (err) => {
      console.error('[WS] Socket error:', err);
    };
  }, []);

  // Connect / disconnect
  useEffect(() => {
    if (!options) return;

    intentionalClose.current = false;
    reconnectAttempts.current = 0;
    connectWs();

    return () => {
      intentionalClose.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.meetingId, options?.attendeeId]);

  useEffect(() => () => playerRef.current?.destroy(), []);

  return { captions, connected, sendAudioFrame };
}

const MAX_CAPTIONS = 50;

function applyCaptionUpdate(
  prev: Caption[],
  msg: {
    speakerAttendeeId: string;
    speakerName: string;
    originalText: string;
    translatedText: string;
    detectedLanguage: string;
    isFinal: boolean;
  },
): Caption[] {
  if (msg.isFinal) {
    const filtered = prev.filter(
      (c) => !(c.speakerAttendeeId === msg.speakerAttendeeId && !c.isFinal),
    );
    return [
      ...filtered,
      {
        id: `${msg.speakerAttendeeId}-${Date.now()}`,
        speakerAttendeeId: msg.speakerAttendeeId,
        speakerName: msg.speakerName,
        originalText: msg.originalText,
        translatedText: msg.translatedText,
        detectedLanguage: msg.detectedLanguage,
        isFinal: true,
        timestamp: Date.now(),
      },
    ].slice(-MAX_CAPTIONS);
  }

  const idx = prev.findIndex(
    (c) => c.speakerAttendeeId === msg.speakerAttendeeId && !c.isFinal,
  );
  const partial: Caption = {
    id: `${msg.speakerAttendeeId}-partial`,
    speakerAttendeeId: msg.speakerAttendeeId,
    speakerName: msg.speakerName,
    originalText: msg.originalText,
    translatedText: msg.translatedText,
    detectedLanguage: msg.detectedLanguage,
    isFinal: false,
    timestamp: Date.now(),
  };
  if (idx >= 0) {
    const copy = [...prev];
    copy[idx] = partial;
    return copy;
  }
  return [...prev, partial];
}
