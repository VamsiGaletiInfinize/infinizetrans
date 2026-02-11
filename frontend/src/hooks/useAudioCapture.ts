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

    let disposed = false;

    // Create context at 16 kHz – the browser resamples from the mic rate
    const ctx = new AudioContext({ sampleRate: 16000 });
    const source = ctx.createMediaStreamSource(stream);

    // 512 samples @ 16 kHz ≈ 32 ms per frame
    const processor = ctx.createScriptProcessor(512, 1, 1);

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (disposed) return;
      const float32 = e.inputBuffer.getChannelData(0);

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

    // Resume AudioContext if browser suspends it (autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Periodically check AudioContext state and resume if needed
    const resumeInterval = setInterval(() => {
      if (!disposed && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    }, 2000);

    return () => {
      disposed = true;
      clearInterval(resumeInterval);
      processor.disconnect();
      source.disconnect();
      mute.disconnect();
      ctx.close().catch(() => {});
    };
  }, [enabled, stream]);
}
