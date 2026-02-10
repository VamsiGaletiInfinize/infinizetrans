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

export function useTranslationSocket(
  options: TranslationSocketOptions | null,
) {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const sendAudioFrame = useCallback((pcm: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(pcm);
  }, []);

  // Connect / disconnect
  useEffect(() => {
    if (!options) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    if (!playerRef.current) playerRef.current = new AudioPlayer();

    ws.onopen = () => {
      setConnected(true);
      const join: WsJoinMessage = {
        action: 'join',
        meetingId: options.meetingId,
        attendeeId: options.attendeeId,
        attendeeName: options.attendeeName,
        spokenLanguage: options.spokenLanguage,
        targetLanguage: options.targetLanguage,
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

    ws.onclose = () => setConnected(false);
    ws.onerror = () => {};

    return () => {
      ws.close();
      wsRef.current = null;
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
