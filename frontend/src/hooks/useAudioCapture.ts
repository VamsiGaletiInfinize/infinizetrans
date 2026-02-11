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
 * Uses a small 512-sample buffer (~32ms at 16 kHz) for low latency.
 */
export function useAudioCapture({
  enabled,
  stream,
  onAudioFrame,
}: UseAudioCaptureOptions): void {
  // Keep a stable reference to avoid re-wiring on every render
  const cbRef = useRef(onAudioFrame);
  cbRef.current = onAudioFrame;

  useEffect(() => {
    if (!enabled || !stream) return;

    // Create context at 16 kHz – the browser resamples from the mic rate
    const ctx = new AudioContext({ sampleRate: 16000 });

    // Resume AudioContext if browser suspends it (e.g. tab in background)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && ctx.state === 'suspended') {
        ctx.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Also resume immediately in case it starts suspended
    if (ctx.state === 'suspended') ctx.resume();

    const source = ctx.createMediaStreamSource(stream);

    // 512 samples @ 16 kHz ≈ 32 ms per frame (was 2048 = 128ms)
    const processor = ctx.createScriptProcessor(512, 1, 1);

    // Track last frame timestamp to prevent echo/feedback loops
    let lastFrameTime = 0;
    const MIN_FRAME_INTERVAL_MS = 25; // Minimum 25ms between frames

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      // Prevent audio feedback loop by debouncing rapid frames
      const now = Date.now();
      if (now - lastFrameTime < MIN_FRAME_INTERVAL_MS) {
        return; // Skip this frame to prevent echo
      }
      lastFrameTime = now;

      const float32 = e.inputBuffer.getChannelData(0);

      // Detect and filter out silent or very quiet audio (possible echo/noise)
      let sumSquares = 0;
      for (let i = 0; i < float32.length; i++) {
        sumSquares += float32[i] * float32[i];
      }
      const rms = Math.sqrt(sumSquares / float32.length);

      // Skip frames below noise threshold (prevents transcribing silence/echo)
      if (rms < 0.01) {
        return;
      }

      // float32 [-1, 1] → int16 [-32768, 32767]
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      cbRef.current(int16.buffer);
    };

    source.connect(processor);

    // Must connect to destination to keep the processor alive;
    // route through a zero-gain node to prevent feedback.
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
  }, [enabled, stream]);
}
