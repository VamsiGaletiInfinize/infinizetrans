'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ConsoleLogger,
  DefaultDeviceController,
  DefaultMeetingSession,
  LogLevel,
  MeetingSessionConfiguration,
  AudioVideoObserver,
  VideoTileState,
} from 'amazon-chime-sdk-js';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface VideoTile {
  tileId: number;
  attendeeId: string;
  isLocal: boolean;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useMeetingSession(
  meetingData: any | null,
  attendeeData: any | null,
) {
  const [joined, setJoined] = useState(false);
  const [tiles, setTiles] = useState<VideoTile[]>([]);
  const [roster, setRoster] = useState<Record<string, string>>({});
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoOn, setVideoOn] = useState(true);

  const sessionRef = useRef<DefaultMeetingSession | null>(null);

  /* ---------- init + join ---------- */
  useEffect(() => {
    if (!meetingData || !attendeeData) return;

    let cancelled = false;

    const logger = new ConsoleLogger('ChimeSDK', LogLevel.WARN);
    const deviceController = new DefaultDeviceController(logger);
    const config = new MeetingSessionConfiguration(meetingData, attendeeData);
    const session = new DefaultMeetingSession(config, logger, deviceController);
    sessionRef.current = session;

    const av = session.audioVideo;

    /* --- observers --- */
    const observer: AudioVideoObserver = {
      videoTileDidUpdate: (state: VideoTileState) => {
        if (state.tileId == null) return;
        setTiles((prev) => {
          if (prev.some((t) => t.tileId === state.tileId)) return prev;
          return [
            ...prev,
            {
              tileId: state.tileId!,
              attendeeId: state.boundAttendeeId || '',
              isLocal: !!state.localTile,
            },
          ];
        });
      },
      videoTileWasRemoved: (tileId: number) => {
        setTiles((prev) => prev.filter((t) => t.tileId !== tileId));
      },
    };
    av.addObserver(observer);

    av.realtimeSubscribeToAttendeeIdPresence(
      (id: string, present: boolean, extId?: string) => {
        setRoster((r) => {
          const copy = { ...r };
          if (present) copy[id] = extId || id;
          else delete copy[id];
          return copy;
        });
      },
    );

    /* --- start --- */
    (async () => {
      try {
        // Acquire mic
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setMicStream(stream);

        // Audio I/O
        const audioIn = await av.listAudioInputDevices();
        if (audioIn.length) await av.startAudioInput(audioIn[0].deviceId);
        const audioOut = await av.listAudioOutputDevices();
        if (audioOut.length) await av.chooseAudioOutput(audioOut[0].deviceId);

        // Video
        const videoIn = await av.listVideoInputDevices();
        if (videoIn.length) await av.startVideoInput(videoIn[0].deviceId);

        av.start();
        av.startLocalVideoTile();
        if (!cancelled) setJoined(true);
      } catch (err) {
        console.error('[Chime] Start failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      av.removeObserver(observer);
      av.stop();
      sessionRef.current = null;
      setJoined(false);
      setTiles([]);
      setRoster({});
      setMicStream(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingData, attendeeData]);

  /* ---------- bind video element ---------- */
  const bindVideo = useCallback(
    (tileId: number, el: HTMLVideoElement) => {
      sessionRef.current?.audioVideo.bindVideoElement(tileId, el);
    },
    [],
  );

  /* ---------- toggle mute ---------- */
  const toggleMute = useCallback(() => {
    const av = sessionRef.current?.audioVideo;
    if (!av) return;
    if (av.realtimeIsLocalAudioMuted()) {
      av.realtimeUnmuteLocalAudio();
      setMuted(false);
    } else {
      av.realtimeMuteLocalAudio();
      setMuted(true);
    }
  }, []);

  /* ---------- toggle camera ---------- */
  const toggleVideo = useCallback(async () => {
    const av = sessionRef.current?.audioVideo;
    if (!av) return;
    if (videoOn) {
      av.stopLocalVideoTile();
      await av.stopVideoInput();
      setVideoOn(false);
    } else {
      const videoDevices = await av.listVideoInputDevices();
      if (videoDevices.length) {
        await av.startVideoInput(videoDevices[0].deviceId);
      }
      av.startLocalVideoTile();
      setVideoOn(true);
    }
  }, [videoOn]);

  /* ---------- leave ---------- */
  const leave = useCallback(() => {
    sessionRef.current?.audioVideo.stop();
    setJoined(false);
  }, []);

  return {
    joined,
    tiles,
    roster,
    micStream,
    muted,
    videoOn,
    bindVideo,
    toggleMute,
    toggleVideo,
    leave,
  };
}
