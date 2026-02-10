/**
 * Language mapping for Amazon Transcribe, Translate, and Polly.
 *
 * Product vision languages:
 *   English, Chinese (Traditional), French, Korean, Spanish, Vietnamese, Amharic, Hindi
 *
 * Architecture: English is the PIVOT language.
 *   Source → English → Target
 *
 * Limits:
 *   - Amharic:    no Transcribe, no Polly → chat-only translation
 *   - Vietnamese: no Transcribe streaming, no Polly → chat-only translation
 *   - Chinese Traditional: Transcribe outputs Simplified; Translate handles zh → zh-TW
 */

export interface LanguageConfig {
  code: string;
  transcribeCode: string | null;
  translateCode: string;
  pollyVoiceId: string | null;
  pollyEngine: 'neural' | 'standard' | null;
  label: string;
  speechSupported: boolean;
}

export const PIVOT_LANGUAGE = 'en';

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { code: 'en-US', transcribeCode: 'en-US', translateCode: 'en',    pollyVoiceId: 'Matthew', pollyEngine: 'neural', label: 'English',              speechSupported: true  },
  { code: 'zh-TW', transcribeCode: 'zh-CN', translateCode: 'zh-TW', pollyVoiceId: 'Zhiyu',   pollyEngine: 'neural', label: 'Chinese (Traditional)', speechSupported: true  },
  { code: 'fr-FR', transcribeCode: 'fr-FR', translateCode: 'fr',    pollyVoiceId: 'Lea',     pollyEngine: 'neural', label: 'French',                speechSupported: true  },
  { code: 'ko-KR', transcribeCode: 'ko-KR', translateCode: 'ko',    pollyVoiceId: 'Seoyeon', pollyEngine: 'neural', label: 'Korean',                speechSupported: true  },
  { code: 'es-US', transcribeCode: 'es-US', translateCode: 'es',    pollyVoiceId: 'Lupe',    pollyEngine: 'neural', label: 'Spanish',               speechSupported: true  },
  { code: 'vi-VN', transcribeCode: null,     translateCode: 'vi',    pollyVoiceId: null,      pollyEngine: null,     label: 'Vietnamese',            speechSupported: false },
  { code: 'am-ET', transcribeCode: null,     translateCode: 'am',    pollyVoiceId: null,      pollyEngine: null,     label: 'Amharic',               speechSupported: false },
  { code: 'hi-IN', transcribeCode: 'hi-IN', translateCode: 'hi',    pollyVoiceId: 'Kajal',   pollyEngine: 'neural', label: 'Hindi',                 speechSupported: true  },
];

/** Comma-separated Transcribe codes for IdentifyMultipleLanguages. */
export function getTranscribeLanguageOptions(): string {
  return SUPPORTED_LANGUAGES
    .filter((l) => l.transcribeCode !== null)
    .map((l) => l.transcribeCode)
    .join(',');
}

export function getLanguageConfig(code: string): LanguageConfig | undefined {
  return SUPPORTED_LANGUAGES.find(
    (l) => l.code === code || l.transcribeCode === code || l.translateCode === code,
  );
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

export function getLabelForTranslateCode(code: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.translateCode === code)?.label || code;
}
