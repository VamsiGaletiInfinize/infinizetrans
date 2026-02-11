'use client';

import { useEffect, useRef } from 'react';

interface UseAudioCaptureOptions {
  /** Whether to capture and send audio frames. */
  enabled: boolean;
  /** Raw mic MediaStream (shared with Chime SDK). */
  stream: MediaStream | null;
  /** Called with a PCM-16 kHz mono Int16 buffer for each frame. */
  onAudioFrame: (pcmData: ArrayBuffer) => void;
}

/**
 * Captures mic audio via the Web Audio API, down-samples to 16 kHz mono PCM,
 * and delivers frames to the caller for WebSocket transmission.
 *
 * The AudioContext is created once when the stream is available and kept alive
 * across mute/unmute cycles. Only frame delivery is gated by `enabled`, so
 * unmuting is instant (no AudioContext startup delay) and Polly playback on the
 * partner's side is never disrupted by context teardown.
 */
export function useAudioCapture({
  enabled,
  stream,
  onAudioFrame,
}: UseAudioCaptureOptions): void {
  const cbRef = useRef(onAudioFrame);
  cbRef.current = onAudioFrame;

  // Track enabled state in a ref so the audio processor callback
  // can read it without causing effect re-runs.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Create AudioContext once when stream is available; tear down only
  // when the stream itself changes (e.g. leaving the meeting).
  useEffect(() => {
    if (!stream) return;

    const ctx = new AudioContext({ sampleRate: 16000 });

    // Resume AudioContext if browser suspends it (e.g. tab in background)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && ctx.state === 'suspended') {
        ctx.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    if (ctx.state === 'suspended') ctx.resume();

    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(512, 1, 1);

    let lastFrameTime = 0;
    const MIN_FRAME_INTERVAL_MS = 25;

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      // Gate on enabled — when muted we simply skip sending frames.
      // The AudioContext stays alive so unmuting is instant.
      if (!enabledRef.current) return;

      const now = Date.now();
      if (now - lastFrameTime < MIN_FRAME_INTERVAL_MS) return;
      lastFrameTime = now;

      const float32 = e.inputBuffer.getChannelData(0);

      let sumSquares = 0;
      for (let i = 0; i < float32.length; i++) {
        sumSquares += float32[i] * float32[i];
      }
      const rms = Math.sqrt(sumSquares / float32.length);
      if (rms < 0.01) return;

      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      cbRef.current(int16.buffer);
    };

    source.connect(processor);

    const mute = ctx.createGain();
    mute.gain.value = 0;
    processor.connect(mute);
    mute.connect(ctx.destination);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      processor.disconnect();
      source.disconnect();
      mute.disconnect();
      ctx.close();
    };
  }, [stream]); // Only depends on stream, NOT on enabled
}
