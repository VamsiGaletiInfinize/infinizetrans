import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import type { TranscriptCallback, TranscriptResult } from './transcribe';
import { logger, logTranscription } from '../utils/logger';

interface DeepgramConfig {
  apiKey: string;
  languageCode: string;
  onTranscript: TranscriptCallback;
  attendeeName?: string;
}

/**
 * Deepgram transcription service for real-time audio transcription.
 * Uses Nova-3 model for best accuracy and sub-300ms latency.
 */
export class DeepgramTranscriptionSession {
  private deepgram: any;
  private connection: any = null;
  private active = true;
  private connectionState: 'idle' | 'connecting' | 'open' | 'closed' = 'idle';
  private onTranscript: TranscriptCallback;
  private languageCode: string;
  private attendeeName: string;
  private startTime: number = 0;
  private chunkCount: number = 0;
  private apiKey: string;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: DeepgramConfig) {
    this.apiKey = config.apiKey;
    this.deepgram = createClient(config.apiKey);
    this.languageCode = this.convertLanguageCode(config.languageCode);
    this.onTranscript = config.onTranscript;
    this.attendeeName = config.attendeeName || 'Unknown';

    logTranscription.modelInfo('Deepgram', 'Nova-3', '3.0');
    logger.info('🔧 DeepgramTranscriptionSession initialized', {
      language: this.languageCode,
      attendee: this.attendeeName,
    });
  }

  /**
   * Convert AWS-style language code to Deepgram format.
   * AWS: en-US, es-ES → Deepgram: en, es
   */
  private convertLanguageCode(awsCode: string): string {
    // Keep full locale for better accuracy
    return awsCode;
  }

  async start(): Promise<void> {
    this.startTime = Date.now();
    this.connectionState = 'connecting';
    logTranscription.start('Deepgram', 'Nova-3', this.languageCode, this.attendeeName);

    try {
      // Create live transcription connection with optimized parameters
      this.connection = this.deepgram.listen.live({
        model: 'nova-3',
        language: this.languageCode,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
        punctuate: true,
        smart_format: true,
        interim_results: true,
        utterance_end: 500,     // Milliseconds for utterance endpoint detection
        endpointing: 150,       // Milliseconds for silence detection
        vad_events: true,
      });

      logger.info('🎤 Deepgram connection configured', {
        model: 'nova-3',
        language: this.languageCode,
        target_latency: '<500ms',
      });

      // Event: Connection opened
      this.connection.on(LiveTranscriptionEvents.Open, () => {
        this.connectionState = 'open';
        const connectionLatency = Date.now() - this.startTime;
        logTranscription.latency('connection_open', connectionLatency);
        logger.info('✅ Deepgram WebSocket OPEN', {
          latencyMs: connectionLatency,
          attendee: this.attendeeName,
        });

        // Send KeepAlive every 8s to prevent Deepgram from closing
        // the connection during audio gaps (e.g. tab in background)
        this.keepAliveInterval = setInterval(() => {
          if (this.connection && this.connectionState === 'open') {
            try {
              this.connection.keepAlive();
            } catch {
              // Connection may have closed between check and send
            }
          }
        }, 8000);
      });

      // Event: Transcript received
      this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        if (!this.active) return;

        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (!transcript || transcript.trim() === '') return;

        const isFinal = data.is_final;
        const confidence = data.channel?.alternatives?.[0]?.confidence || 0;
        const duration = data.duration;

        if (isFinal) {
          logTranscription.final(transcript, confidence, duration * 1000);
          logger.info('✅ FINAL TRANSCRIPT', {
            text: transcript,
            confidence: confidence.toFixed(3),
            durationSec: duration?.toFixed(2),
            attendee: this.attendeeName,
            language: this.languageCode,
          });

          this.onTranscript({
            text: transcript,
            isFinal: true,
            detectedLanguage: this.languageCode,
          });
        } else {
          logTranscription.partial(transcript, confidence);
          logger.debug('📝 PARTIAL TRANSCRIPT', {
            text: transcript.substring(0, 50) + (transcript.length > 50 ? '...' : ''),
            confidence: confidence.toFixed(3),
            attendee: this.attendeeName,
          });

          this.onTranscript({
            text: transcript,
            isFinal: false,
            detectedLanguage: this.languageCode,
          });
        }
      });

      // Event: Metadata received
      this.connection.on(LiveTranscriptionEvents.Metadata, (data: any) => {
        logger.debug('📊 Deepgram Metadata', {
          requestId: data.request_id,
          modelInfo: data.model_info,
          attendee: this.attendeeName,
        });
      });

      // Event: Error
      this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        if (this.active) {
          logTranscription.error(error.message || 'Unknown error', error);
          logger.error('❌ Deepgram ERROR', {
            error: error.message || error.toString(),
            attendee: this.attendeeName,
          });
        }
      });

      // Event: Connection closed
      this.connection.on(LiveTranscriptionEvents.Close, () => {
        this.connectionState = 'closed';
        if (this.keepAliveInterval) {
          clearInterval(this.keepAliveInterval);
          this.keepAliveInterval = null;
        }
        const totalDuration = Date.now() - this.startTime;
        logger.info('🔌 Deepgram connection CLOSED', {
          totalDurationMs: totalDuration,
          chunksProcessed: this.chunkCount,
          attendee: this.attendeeName,
        });
      });

      logger.info('🎧 Deepgram ready to receive audio', {
        attendee: this.attendeeName,
        language: this.languageCode,
      });
    } catch (err: any) {
      if (this.active) {
        logTranscription.error('Session startup failed', err);
        logger.error('❌ Deepgram session error', {
          error: err.message,
          stack: err.stack,
          attendee: this.attendeeName,
        });
        throw err;
      }
    }
  }

  pushAudio(chunk: Buffer | Uint8Array): void {
    if (!this.active || !this.connection) return;

    try {
      this.chunkCount++;
      this.connection.send(chunk);

      // Log every 100 chunks (~10 seconds of audio)
      if (this.chunkCount % 100 === 0) {
        logger.debug('📤 Audio chunks sent', {
          count: this.chunkCount,
          chunkSize: chunk.length,
          attendee: this.attendeeName,
        });
      }
    } catch (err: any) {
      logTranscription.error('Failed to send audio chunk', err);
      logger.error('❌ Error sending audio to Deepgram', {
        error: err.message,
        chunkSize: chunk.length,
        attendee: this.attendeeName,
      });
    }
  }

  isAlive(): boolean {
    return this.active && (this.connectionState === 'connecting' || this.connectionState === 'open');
  }

  /**
   * Gracefully finish: tell Deepgram to finalize buffered audio,
   * but keep processing transcripts until the connection closes.
   * Use this for mic_off so the last sentence isn't lost.
   */
  finishGracefully(): void {
    logger.info('🔇 Finishing Deepgram session gracefully (waiting for final transcripts)', {
      attendee: this.attendeeName,
    });

    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    if (this.connection) {
      try {
        this.connection.finish();
      } catch (err: any) {
        logger.warn('⚠️ Error finishing Deepgram connection', {
          error: err.message,
          attendee: this.attendeeName,
        });
      }
    }

    // Force cleanup after 3s in case Deepgram doesn't close the connection
    setTimeout(() => {
      if (this.active) {
        this.stop();
      }
    }, 3000);
  }

  stop(): void {
    const totalDuration = Date.now() - this.startTime;
    logger.info('🛑 Stopping Deepgram transcription session', {
      attendee: this.attendeeName,
      totalDurationMs: totalDuration,
      totalChunks: this.chunkCount,
    });

    this.active = false;

    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    if (this.connection) {
      try {
        this.connection.finish();
      } catch (err: any) {
        logger.warn('⚠️ Error closing Deepgram connection', {
          error: err.message,
          attendee: this.attendeeName,
        });
      }
      this.connection = null;
    }
  }
}
