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

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  /** Enqueue a base64-encoded MP3 blob for playback. */
  async playMp3(base64: string): Promise<void> {
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

        // Decode base64 → ArrayBuffer
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
        await this.playBuffer(ctx, audioBuffer);
      } catch (err) {
        console.error('[AudioPlayer] Playback error:', err);
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
