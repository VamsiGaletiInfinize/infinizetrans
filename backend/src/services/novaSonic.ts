import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { logger } from '../utils/logger';

/* ------------------------------------------------------------------ */
/*  Config & types                                                     */
/* ------------------------------------------------------------------ */

export interface NovaSonicConfig {
  region: string;
  modelId: string;
  sourceLanguage: string;   // e.g. 'hi-IN', 'en-US'
  targetLanguage: string;   // e.g. 'en-US', 'hi-IN'
  voiceId: string;           // e.g. 'matthew', 'arjun'
  attendeeName: string;
  onCaption: (original: string, translated: string, isFinal: boolean) => void;
  onAudioComplete: (wavBuffer: Buffer) => void;
  onError: (error: Error) => void;
}

const LANGUAGE_LABELS: Record<string, string> = {
  'en-US': 'English', 'en-GB': 'English', 'en-AU': 'English', 'en-IN': 'English',
  'hi-IN': 'Hindi', 'fr-FR': 'French', 'fr-CA': 'French',
  'de-DE': 'German', 'it-IT': 'Italian',
  'es-ES': 'Spanish', 'es-US': 'Spanish', 'es-MX': 'Spanish',
  'pt-BR': 'Portuguese', 'pt-PT': 'Portuguese',
};

/* ------------------------------------------------------------------ */
/*  AsyncIterableQueue — push-based async iterable for streaming       */
/* ------------------------------------------------------------------ */

class AsyncIterableQueue<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private resolve: ((value: IteratorResult<T>) => void) | null = null;
  private done = false;

  push(item: T): void {
    if (this.done) return;
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r({ value: item, done: false });
    } else {
      this.queue.push(item);
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

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
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

/* ------------------------------------------------------------------ */
/*  WAV header helper                                                  */
/* ------------------------------------------------------------------ */

function wrapInWavHeader(pcmData: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcmData.length;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);           // PCM format chunk size
  header.writeUInt16LE(1, 20);            // PCM format (1 = uncompressed)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

/* ------------------------------------------------------------------ */
/*  NovaSonicSession                                                   */
/* ------------------------------------------------------------------ */

export class NovaSonicSession {
  private config: NovaSonicConfig;
  private client: BedrockRuntimeClient;
  private inputQueue: AsyncIterableQueue<any>;
  private active = false;
  private promptId: string;
  private contentCounter = 0;
  private chunkCount = 0;
  private startTime = 0;

  // Accumulate output per response turn
  private audioChunks: Buffer[] = [];
  private currentUserTranscript = '';
  private currentTranslation = '';
  private isReceivingAudio = false;

  // Session refresh
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private static SESSION_REFRESH_MS = 7 * 60 * 1000; // Refresh at 7 min (hard limit 8 min)

  constructor(config: NovaSonicConfig) {
    this.config = config;
    this.promptId = `prompt-${Date.now()}`;
    this.inputQueue = new AsyncIterableQueue();

    this.client = new BedrockRuntimeClient({
      region: config.region,
      requestHandler: new NodeHttp2Handler({
        requestTimeout: 600_000, // 10 minutes
        sessionTimeout: 600_000,
      }),
    });
  }

  async start(): Promise<void> {
    this.active = true;
    this.startTime = Date.now();
    this.chunkCount = 0;

    logger.info('[NovaSonic] Starting session', {
      attendee: this.config.attendeeName,
      source: this.config.sourceLanguage,
      target: this.config.targetLanguage,
      voice: this.config.voiceId,
      model: this.config.modelId,
    });

    try {
      // Send setup events into the input queue
      this.sendSetupEvents();

      // Create the bidirectional stream command
      const command = new InvokeModelWithBidirectionalStreamCommand({
        modelId: this.config.modelId,
        body: this.inputQueue as any,
      });

      const response = await this.client.send(command);

      // Schedule session refresh before 8-min timeout
      this.refreshTimer = setTimeout(() => {
        this.handleSessionRefresh();
      }, NovaSonicSession.SESSION_REFRESH_MS);

      // Process the output stream in background
      this.processOutputStream(response).catch((err) => {
        if (this.active) {
          logger.error('[NovaSonic] Output stream error', {
            error: err.message,
            attendee: this.config.attendeeName,
          });
          this.config.onError(err);
        }
      });

      logger.info('[NovaSonic] Session started successfully', {
        attendee: this.config.attendeeName,
        latencyMs: Date.now() - this.startTime,
      });
    } catch (err: any) {
      logger.error('[NovaSonic] Failed to start session', {
        error: err.message,
        attendee: this.config.attendeeName,
      });
      this.active = false;
      this.config.onError(err);
    }
  }

  private sendSetupEvents(): void {
    const srcLabel = LANGUAGE_LABELS[this.config.sourceLanguage] || this.config.sourceLanguage;
    const tgtLabel = LANGUAGE_LABELS[this.config.targetLanguage] || this.config.targetLanguage;

    // 1. Session start
    this.inputQueue.push({
      event: {
        sessionStart: {
          inferenceConfiguration: {
            maxTokens: 1024,
            topP: 0.9,
            temperature: 0.1, // Low temperature for precise translation
          },
        },
      },
    });

    // 2. Prompt start — configure audio output
    this.inputQueue.push({
      event: {
        promptStart: {
          promptName: this.promptId,
          textOutputConfiguration: {
            mediaType: 'text/plain',
          },
          audioOutputConfiguration: {
            mediaType: 'audio/lpcm',
            sampleRateHertz: 24000,
            sampleSizeBits: 16,
            channelCount: 1,
            voiceId: this.config.voiceId,
            encoding: 'base64',
            audioType: 'SPEECH',
          },
        },
      },
    });

    // 3. System prompt — strict translation only
    const systemContentId = this.nextContentId();
    this.inputQueue.push({
      event: {
        contentStart: {
          promptName: this.promptId,
          contentName: systemContentId,
          type: 'TEXT',
          interactive: false,
          role: 'SYSTEM',
          textInputConfiguration: {
            mediaType: 'text/plain',
          },
        },
      },
    });

    this.inputQueue.push({
      event: {
        textInput: {
          promptName: this.promptId,
          contentName: systemContentId,
          content: [
            `You are a real-time speech translator. Your ONLY function is to translate spoken speech from ${srcLabel} to ${tgtLabel}.`,
            `Rules:`,
            `- Translate exactly as spoken. Do NOT add, remove, or rephrase anything.`,
            `- Do NOT respond conversationally. Do NOT answer questions. Do NOT add commentary.`,
            `- If the user says "Hello, how are you?", translate it literally — do NOT answer the question.`,
            `- Preserve the speaker's tone, intent, and meaning precisely.`,
            `- Output ONLY the translation in ${tgtLabel}, nothing else.`,
          ].join('\n'),
        },
      },
    });

    this.inputQueue.push({
      event: {
        contentEnd: {
          promptName: this.promptId,
          contentName: systemContentId,
        },
      },
    });

    // 4. Start audio input content block (interactive = user audio stream)
    const audioContentId = this.nextContentId();
    this.inputQueue.push({
      event: {
        contentStart: {
          promptName: this.promptId,
          contentName: audioContentId,
          type: 'AUDIO',
          interactive: true,
          role: 'USER',
          audioInputConfiguration: {
            mediaType: 'audio/lpcm',
            sampleRateHertz: 16000,
            sampleSizeBits: 16,
            channelCount: 1,
            encoding: 'base64',
          },
        },
      },
    });

    logger.info('[NovaSonic] Setup events sent', {
      promptId: this.promptId,
      systemPrompt: `Translate ${srcLabel} → ${tgtLabel}`,
      voice: this.config.voiceId,
    });
  }

  pushAudio(chunk: Buffer | Uint8Array): void {
    if (!this.active) return;

    this.chunkCount++;
    const data = chunk instanceof Buffer ? chunk : Buffer.from(chunk);

    this.inputQueue.push({
      event: {
        audioInput: {
          promptName: this.promptId,
          contentName: `audio-content`,
          content: data.toString('base64'),
        },
      },
    });

    if (this.chunkCount % 100 === 0) {
      logger.debug('[NovaSonic] Audio chunks sent', {
        count: this.chunkCount,
        attendee: this.config.attendeeName,
      });
    }
  }

  private async processOutputStream(response: any): Promise<void> {
    const stream = response.body;
    if (!stream) {
      logger.error('[NovaSonic] No response stream received');
      return;
    }

    for await (const event of stream) {
      if (!this.active) break;

      try {
        if (event.chunk?.bytes) {
          const payload = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          this.handleOutputEvent(payload);
        } else if (event.internalServerException) {
          logger.error('[NovaSonic] Internal server error', {
            message: event.internalServerException.message,
          });
          this.config.onError(new Error(event.internalServerException.message));
        } else if (event.modelStreamErrorException) {
          logger.error('[NovaSonic] Model stream error', {
            message: event.modelStreamErrorException.message,
          });
          this.config.onError(new Error(event.modelStreamErrorException.message));
        }
      } catch (err: any) {
        logger.warn('[NovaSonic] Error parsing output event', { error: err.message });
      }
    }

    logger.info('[NovaSonic] Output stream ended', {
      attendee: this.config.attendeeName,
      totalChunks: this.chunkCount,
    });
  }

  private handleOutputEvent(payload: any): void {
    const evt = payload.event;
    if (!evt) return;

    // Text output — transcription or translation
    if (evt.textOutput) {
      const { role, content } = evt.textOutput;
      const isFinal = evt.textOutput.additionalModelFields
        ? JSON.parse(evt.textOutput.additionalModelFields).generationStage === 'FINAL'
        : false;

      if (role === 'USER') {
        this.currentUserTranscript = content || '';
        logger.debug('[NovaSonic] User transcript', {
          text: this.currentUserTranscript.substring(0, 60),
          isFinal,
          attendee: this.config.attendeeName,
        });
      } else if (role === 'ASSISTANT') {
        this.currentTranslation = content || '';
        logger.debug('[NovaSonic] Translation', {
          text: this.currentTranslation.substring(0, 60),
          isFinal,
          attendee: this.config.attendeeName,
        });
      }

      // Send caption when we have both transcript and translation
      if (this.currentUserTranscript && this.currentTranslation) {
        this.config.onCaption(
          this.currentUserTranscript,
          this.currentTranslation,
          isFinal,
        );
      }
    }

    // Audio content block start
    if (evt.contentStart && evt.contentStart.type === 'AUDIO' && evt.contentStart.role === 'ASSISTANT') {
      this.isReceivingAudio = true;
      this.audioChunks = [];
    }

    // Audio output chunk
    if (evt.audioOutput) {
      if (evt.audioOutput.content) {
        this.audioChunks.push(Buffer.from(evt.audioOutput.content, 'base64'));
      }
    }

    // Content end — if this closes an ASSISTANT audio block, send the accumulated audio
    if (evt.contentEnd) {
      if (this.isReceivingAudio && this.audioChunks.length > 0) {
        const pcmData = Buffer.concat(this.audioChunks);
        const wavBuffer = wrapInWavHeader(pcmData);

        logger.info('[NovaSonic] Audio response complete', {
          pcmBytes: pcmData.length,
          durationMs: Math.round((pcmData.length / (24000 * 2)) * 1000),
          attendee: this.config.attendeeName,
        });

        this.config.onAudioComplete(wavBuffer);

        // Reset for next turn
        this.audioChunks = [];
        this.isReceivingAudio = false;
        this.currentUserTranscript = '';
        this.currentTranslation = '';
      }
    }
  }

  private handleSessionRefresh(): void {
    if (!this.active) return;

    logger.info('[NovaSonic] Refreshing session (approaching 8-min limit)', {
      attendee: this.config.attendeeName,
      durationMs: Date.now() - this.startTime,
    });

    // Close current stream cleanly
    this.inputQueue.push({
      event: {
        contentEnd: {
          promptName: this.promptId,
          contentName: 'audio-content',
        },
      },
    });
    this.inputQueue.push({ event: { promptEnd: { promptName: this.promptId } } });
    this.inputQueue.push({ event: { sessionEnd: {} } });
    this.inputQueue.close();

    // Create fresh queue and reconnect
    this.inputQueue = new AsyncIterableQueue();
    this.promptId = `prompt-${Date.now()}`;
    this.contentCounter = 0;

    this.start().catch((err) => {
      logger.error('[NovaSonic] Session refresh failed', { error: err.message });
      this.config.onError(err);
    });
  }

  isAlive(): boolean {
    return this.active;
  }

  finishGracefully(): void {
    logger.info('[NovaSonic] Finishing gracefully', {
      attendee: this.config.attendeeName,
      totalChunks: this.chunkCount,
    });

    // Send content/prompt/session end to let the model finalize
    this.inputQueue.push({
      event: {
        contentEnd: {
          promptName: this.promptId,
          contentName: 'audio-content',
        },
      },
    });
    this.inputQueue.push({ event: { promptEnd: { promptName: this.promptId } } });
    this.inputQueue.push({ event: { sessionEnd: {} } });
    this.inputQueue.close();

    // Force cleanup after 5s
    setTimeout(() => {
      if (this.active) this.stop();
    }, 5000);
  }

  stop(): void {
    logger.info('[NovaSonic] Stopping session', {
      attendee: this.config.attendeeName,
      totalChunks: this.chunkCount,
      durationMs: Date.now() - this.startTime,
    });

    this.active = false;

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.inputQueue.close();
  }

  private nextContentId(): string {
    return `content-${++this.contentCounter}`;
  }
}
