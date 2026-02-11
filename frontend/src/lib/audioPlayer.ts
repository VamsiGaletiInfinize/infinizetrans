/**
 * Queued audio player that decodes base64 MP3 blobs and plays them
 * sequentially through the Web Audio API.
 *
 * Prevents overlapping audio when multiple translated segments arrive
 * in quick succession. Each clip plays after the previous one finishes.
 */
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private queue: string[] = [];
  private playing = false;
  private static readonly MAX_QUEUE = 20;
  private static readonly DECODE_TIMEOUT_MS = 5000;

  private getCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  /** Enqueue a base64-encoded MP3 blob for playback. */
  async playMp3(base64: string): Promise<void> {
    // Drop oldest items if queue is growing too large (prevents memory bloat)
    if (this.queue.length >= AudioPlayer.MAX_QUEUE) {
      const dropped = this.queue.length - AudioPlayer.MAX_QUEUE + 1;
      this.queue.splice(0, dropped);
      console.warn(`[AudioPlayer] Queue overflow, dropped ${dropped} items`);
    }
    this.queue.push(base64);
    if (!this.playing) {
      this.playing = true;
      await this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const base64 = this.queue.shift()!;
      try {
        const ctx = this.getCtx();

        // Resume if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') await ctx.resume();

        // Decode base64 -> ArrayBuffer
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        // Decode with timeout to prevent hanging
        const audioBuffer = await Promise.race([
          ctx.decodeAudioData(bytes.buffer.slice(0)),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Decode timeout')), AudioPlayer.DECODE_TIMEOUT_MS),
          ),
        ]);
        await this.playBuffer(ctx, audioBuffer);
      } catch (err) {
        console.error('[AudioPlayer] Playback error (skipping):', err);
        // Continue to next item instead of stalling
      }
    }
    this.playing = false;
  }

  private playBuffer(ctx: AudioContext, buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => resolve();
      source.start();

      // Safety timeout: if onended never fires, resolve after buffer duration + 500ms
      const safetyMs = (buffer.duration * 1000) + 500;
      setTimeout(resolve, safetyMs);
    });
  }

  /** Clear any queued audio (e.g. when switching languages). */
  clearQueue(): void {
    this.queue.length = 0;
  }

  destroy(): void {
    this.queue.length = 0;
    this.playing = false;
    this.ctx?.close();
    this.ctx = null;
  }
}
