/**
 * Language mapping for Amazon Transcribe, Translate, and Polly.
 *
 * Hackathon demo: 6 speech-supported languages only.
 *   English, Chinese (Traditional), French, Korean, Spanish, Hindi
 *
 * Architecture: English is the PIVOT language.
 *   Source → English → Target (or direct if English is one end)
 */

export interface LanguageConfig {
  code: string;
  transcribeCode: string;
  translateCode: string;
  pollyVoiceId: string;
  pollyEngine: 'neural' | 'standard';
  label: string;
}

export const PIVOT_LANGUAGE = 'en';

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { code: 'en-US', transcribeCode: 'en-US', translateCode: 'en',    pollyVoiceId: 'Matthew', pollyEngine: 'neural', label: 'English'              },
  { code: 'zh-TW', transcribeCode: 'zh-CN', translateCode: 'zh-TW', pollyVoiceId: 'Zhiyu',   pollyEngine: 'neural', label: 'Chinese (Traditional)' },
  { code: 'fr-FR', transcribeCode: 'fr-FR', translateCode: 'fr',    pollyVoiceId: 'Lea',     pollyEngine: 'neural', label: 'French'                },
  { code: 'ko-KR', transcribeCode: 'ko-KR', translateCode: 'ko',    pollyVoiceId: 'Seoyeon', pollyEngine: 'neural', label: 'Korean'                },
  { code: 'es-US', transcribeCode: 'es-US', translateCode: 'es',    pollyVoiceId: 'Lupe',    pollyEngine: 'neural', label: 'Spanish'               },
  { code: 'hi-IN', transcribeCode: 'hi-IN', translateCode: 'hi',    pollyVoiceId: 'Kajal',   pollyEngine: 'neural', label: 'Hindi'                 },
];

export function getLanguageConfig(code: string): LanguageConfig | undefined {
  return SUPPORTED_LANGUAGES.find(
    (l) => l.code === code || l.transcribeCode === code || l.translateCode === code,
  );
}

/** Get the Transcribe language code for a given language code (e.g. 'zh-TW' → 'zh-CN'). */
export function getTranscribeCode(languageCode: string): string | null {
  const cfg = getLanguageConfig(languageCode);
  return cfg?.transcribeCode || null;
}

export function transcribeToTranslateCode(transcribeCode: string): string {
  const cfg = SUPPORTED_LANGUAGES.find((l) => l.transcribeCode === transcribeCode);
  return cfg?.translateCode || 'en';
}

export function getTranslateCode(languageCode: string): string {
  return getLanguageConfig(languageCode)?.translateCode || 'en';
}

export function getPollyConfig(
  languageCode: string,
): { voiceId: string; engine: 'neural' | 'standard' } | null {
  const cfg = getLanguageConfig(languageCode);
  if (!cfg?.pollyVoiceId || !cfg.pollyEngine) return null;
  return { voiceId: cfg.pollyVoiceId, engine: cfg.pollyEngine };
}
