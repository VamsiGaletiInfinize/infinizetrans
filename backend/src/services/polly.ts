import {
  PollyClient,
  SynthesizeSpeechCommand,
  Engine,
  OutputFormat,
} from '@aws-sdk/client-polly';
import { config } from '../config';
import { getPollyConfig } from '../utils/languages';

const client = new PollyClient({ region: config.aws.region });

/**
 * Synthesize translated text into MP3 audio via Amazon Polly.
 * Returns null if the target language has no Polly voice.
 *
 * Optimizations:
 * - Uses 16000 Hz sample rate (matches our audio pipeline) for faster encoding
 * - Uses neural engine for higher quality
 */
export async function synthesizeSpeech(
  text: string,
  targetLanguageCode: string,
): Promise<Buffer | null> {
  const polly = getPollyConfig(targetLanguageCode);
  if (!polly) {
    console.log(`[Polly] No voice for ${targetLanguageCode}, skipping synthesis`);
    return null;
  }

  const response = await client.send(
    new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: OutputFormat.MP3,
      VoiceId: polly.voiceId as any,
      Engine: polly.engine as Engine,
      SampleRate: '16000', // lower sample rate = faster encoding + smaller payload
    }),
  );

  if (!response.AudioStream) {
    throw new Error('No audio stream returned from Polly');
  }

  const stream = response.AudioStream as any;
  if (typeof stream.transformToByteArray === 'function') {
    const bytes = await stream.transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
