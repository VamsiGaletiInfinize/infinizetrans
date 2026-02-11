/**
 * Real-time audio player for translated speech.
 *
 * When new audio arrives, any queued clips are dropped and the currently
 * playing clip is stopped — the latest translation is always the most
 * relevant. This prevents delay from growing over time.
 */
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private playing = false;
  private pending: string | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  /** Play a base64-encoded MP3 blob. Interrupts any currently playing audio. */
  async playMp3(base64: string): Promise<void> {
    // Stop whatever is playing — latest audio wins
    this.stopCurrent();
    this.pending = base64;

    if (!this.playing) {
      this.playing = true;
      await this.processNext();
    }
  }

  private async processNext(): Promise<void> {
    while (this.pending) {
      const base64 = this.pending;
      this.pending = null;
      try {
        const ctx = this.getCtx();
        if (ctx.state === 'suspended') await ctx.resume();

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
      source.onended = () => {
        if (this.currentSource === source) this.currentSource = null;
        resolve();
      };
      this.currentSource = source;
      source.start();
    });
  }

  private stopCurrent(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch { /* already stopped */ }
      this.currentSource = null;
    }
  }

  /** Clear any pending audio. */
  clearQueue(): void {
    this.pending = null;
    this.stopCurrent();
  }

  destroy(): void {
    this.pending = null;
    this.stopCurrent();
    this.playing = false;
    this.ctx?.close();
    this.ctx = null;
  }
}
