import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
} from '@aws-sdk/client-transcribe-streaming';
import { config } from '../config';
import { getTranscribeLanguageOptions } from '../utils/languages';

const client = new TranscribeStreamingClient({ region: config.aws.region });

export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  /** Transcribe language code detected for this segment (e.g. "en-US") */
  detectedLanguage?: string;
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
 * TranscriptionSession with auto language detection.
 * Uses IdentifyMultipleLanguages so speakers can switch languages mid-sentence.
 * No manual language selection needed.
 */
export class TranscriptionSession {
  private audioQueue = new AudioStreamQueue();
  private active = true;
  private onTranscript: TranscriptCallback;

  constructor(onTranscript: TranscriptCallback) {
    this.onTranscript = onTranscript;
  }

  async start(): Promise<void> {
    const languageOptions = getTranscribeLanguageOptions();
    console.log(`[Transcribe] Auto-detect languages: ${languageOptions}`);

    try {
      const response = await client.send(
        new StartStreamTranscriptionCommand({
          IdentifyMultipleLanguages: true,
          LanguageOptions: languageOptions,
          MediaEncoding: 'pcm',
          MediaSampleRateHertz: 16000,
          AudioStream: this.audioQueue as any,
        }),
      );

      if (!response.TranscriptResultStream) return;

      for await (const event of response.TranscriptResultStream) {
        if (!this.active) break;

        const results = event.TranscriptEvent?.Transcript?.Results;
        if (!results) continue;

        for (const result of results) {
          const transcript = result.Alternatives?.[0]?.Transcript;
          if (!transcript) continue;

          const detectedLang = (result as any).LanguageCode as string | undefined;

          this.onTranscript({
            text: transcript,
            isFinal: !result.IsPartial,
            detectedLanguage: detectedLang || undefined,
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
      if (this.active) {
        console.error('[Transcribe] Session error:', err.message);
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
