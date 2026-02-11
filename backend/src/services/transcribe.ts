import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
} from '@aws-sdk/client-transcribe-streaming';
import { config } from '../config';

/** Create a fresh client per streaming session to ensure credentials are current */
function createClient() {
  return new TranscribeStreamingClient({ region: config.aws.region });
}

export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  detectedLanguage: string;
  startTimeMs?: number;
  endTimeMs?: number;
}

export type TranscriptCallback = (result: TranscriptResult) => void;

class AudioStreamQueue {
  private queue: Uint8Array[] = [];
  private resolve: ((value: IteratorResult<AudioStream>) => void) | null = null;
  private done = false;

  push(chunk: Uint8Array): void {
    if (this.done) return;
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r({ value: { AudioEvent: { AudioChunk: chunk } }, done: false });
    } else {
      this.queue.push(chunk);
    }
  }

  close(): void {
    this.done = true;
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r({ value: undefined as any, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<AudioStream> {
    return {
      next: (): Promise<IteratorResult<AudioStream>> => {
        if (this.queue.length > 0) {
          const chunk = this.queue.shift()!;
          return Promise.resolve({
            value: { AudioEvent: { AudioChunk: chunk } },
            done: false,
          });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined as any, done: true });
        }
        return new Promise((resolve) => {
          this.resolve = resolve;
        });
      },
    };
  }
}

/**
 * TranscriptionSession with fixed language code.
 * Uses a single LanguageCode for lower latency and higher accuracy.
 */
export class TranscriptionSession {
  private audioQueue = new AudioStreamQueue();
  private active = true;
  private onTranscript: TranscriptCallback;
  private languageCode: string;
  private restartCount = 0;
  private static readonly MAX_RESTARTS = 5;
  private static readonly RESTART_DELAY_MS = 1000;

  constructor(languageCode: string, onTranscript: TranscriptCallback) {
    this.languageCode = languageCode;
    this.onTranscript = onTranscript;
  }

  async start(): Promise<void> {
    while (this.active && this.restartCount <= TranscriptionSession.MAX_RESTARTS) {
      console.log(
        `[Transcribe] Fixed language session: ${this.languageCode}` +
        (this.restartCount > 0 ? ` (restart #${this.restartCount})` : ''),
      );

      // Fresh audio queue for each attempt
      if (this.restartCount > 0) {
        this.audioQueue = new AudioStreamQueue();
      }

      try {
        const client = createClient();
        const response = await client.send(
          new StartStreamTranscriptionCommand({
            LanguageCode: this.languageCode as any,
            MediaEncoding: 'pcm',
            MediaSampleRateHertz: 16000,
            AudioStream: this.audioQueue as any,
          }),
        );

        if (!response.TranscriptResultStream) return;

        // Reset restart count on successful connection
        this.restartCount = 0;

        for await (const event of response.TranscriptResultStream) {
          if (!this.active) break;

          const results = event.TranscriptEvent?.Transcript?.Results;
          if (!results) continue;

          for (const result of results) {
            const transcript = result.Alternatives?.[0]?.Transcript;
            if (!transcript) continue;

            this.onTranscript({
              text: transcript,
              isFinal: !result.IsPartial,
              detectedLanguage: this.languageCode,
              startTimeMs: result.StartTime != null
                ? Math.round(result.StartTime * 1000)
                : undefined,
              endTimeMs: result.EndTime != null
                ? Math.round(result.EndTime * 1000)
                : undefined,
            });
          }
        }
      } catch (err: any) {
        if (!this.active) return;

        const errMsg = err?.message || err?.name || JSON.stringify(err, Object.getOwnPropertyNames(err));
        this.restartCount++;
        console.error(
          `[Transcribe] Session error (attempt ${this.restartCount}/${TranscriptionSession.MAX_RESTARTS}): ${errMsg}`,
        );
        if (err?.$metadata) console.error('[Transcribe] metadata:', JSON.stringify(err.$metadata));

        if (this.restartCount > TranscriptionSession.MAX_RESTARTS) {
          console.error('[Transcribe] Max restarts reached, giving up.');
          return;
        }

        // Wait before restarting (exponential backoff)
        const delay = TranscriptionSession.RESTART_DELAY_MS * this.restartCount;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  pushAudio(chunk: Buffer | Uint8Array): void {
    if (!this.active) return;
    const data = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    this.audioQueue.push(data);
  }

  stop(): void {
    this.active = false;
    this.audioQueue.close();
  }
}
