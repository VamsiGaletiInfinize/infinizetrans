/**
 * Language mapping for Deepgram (Transcribe), AWS Translate, and AWS Polly.
 *
 * Extended to support 30+ languages with Deepgram's superior accuracy (95-98%).
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
  // English variants
  { code: 'en-US', transcribeCode: 'en-US', translateCode: 'en',    pollyVoiceId: 'Matthew', pollyEngine: 'neural', label: 'English (US)' },
  { code: 'en-GB', transcribeCode: 'en-GB', translateCode: 'en',    pollyVoiceId: 'Brian',   pollyEngine: 'neural', label: 'English (UK)' },
  { code: 'en-AU', transcribeCode: 'en-AU', translateCode: 'en',    pollyVoiceId: 'Nicole',  pollyEngine: 'neural', label: 'English (Australia)' },
  { code: 'en-IN', transcribeCode: 'en-IN', translateCode: 'en',    pollyVoiceId: 'Aditi',   pollyEngine: 'neural', label: 'English (India)' },

  // Spanish variants
  { code: 'es-ES', transcribeCode: 'es',    translateCode: 'es',    pollyVoiceId: 'Lucia',   pollyEngine: 'neural', label: 'Spanish (Spain)' },
  { code: 'es-US', transcribeCode: 'es',    translateCode: 'es',    pollyVoiceId: 'Lupe',    pollyEngine: 'neural', label: 'Spanish (US)' },
  { code: 'es-MX', transcribeCode: 'es',    translateCode: 'es',    pollyVoiceId: 'Mia',     pollyEngine: 'neural', label: 'Spanish (Mexico)' },

  // French variants
  { code: 'fr-FR', transcribeCode: 'fr',    translateCode: 'fr',    pollyVoiceId: 'Lea',     pollyEngine: 'neural', label: 'French (France)' },
  { code: 'fr-CA', transcribeCode: 'fr-CA', translateCode: 'fr',    pollyVoiceId: 'Chantal', pollyEngine: 'neural', label: 'French (Canada)' },

  // German
  { code: 'de-DE', transcribeCode: 'de',    translateCode: 'de',    pollyVoiceId: 'Vicki',   pollyEngine: 'neural', label: 'German' },

  // Italian
  { code: 'it-IT', transcribeCode: 'it',    translateCode: 'it',    pollyVoiceId: 'Bianca',  pollyEngine: 'neural', label: 'Italian' },

  // Portuguese variants
  { code: 'pt-BR', transcribeCode: 'pt-BR', translateCode: 'pt',    pollyVoiceId: 'Camila',  pollyEngine: 'neural', label: 'Portuguese (Brazil)' },
  { code: 'pt-PT', transcribeCode: 'pt',    translateCode: 'pt',    pollyVoiceId: 'Ines',    pollyEngine: 'neural', label: 'Portuguese (Portugal)' },

  // Dutch
  { code: 'nl-NL', transcribeCode: 'nl',    translateCode: 'nl',    pollyVoiceId: 'Lotte',   pollyEngine: 'neural', label: 'Dutch' },

  // Polish
  { code: 'pl-PL', transcribeCode: 'pl',    translateCode: 'pl',    pollyVoiceId: 'Jacek',   pollyEngine: 'neural', label: 'Polish' },

  // Russian
  { code: 'ru-RU', transcribeCode: 'ru',    translateCode: 'ru',    pollyVoiceId: 'Tatyana', pollyEngine: 'neural', label: 'Russian' },

  // Turkish
  { code: 'tr-TR', transcribeCode: 'tr',    translateCode: 'tr',    pollyVoiceId: 'Filiz',   pollyEngine: 'standard', label: 'Turkish' },

  // Asian languages
  { code: 'zh-CN', transcribeCode: 'zh',    translateCode: 'zh',    pollyVoiceId: 'Zhiyu',   pollyEngine: 'neural', label: 'Chinese (Mandarin)' },
  { code: 'zh-TW', transcribeCode: 'zh-TW', translateCode: 'zh-TW', pollyVoiceId: 'Zhiyu',   pollyEngine: 'neural', label: 'Chinese (Traditional)' },
  { code: 'ja-JP', transcribeCode: 'ja',    translateCode: 'ja',    pollyVoiceId: 'Kazuha',  pollyEngine: 'neural', label: 'Japanese' },
  { code: 'ko-KR', transcribeCode: 'ko',    translateCode: 'ko',    pollyVoiceId: 'Seoyeon', pollyEngine: 'neural', label: 'Korean' },
  { code: 'hi-IN', transcribeCode: 'hi',    translateCode: 'hi',    pollyVoiceId: 'Kajal',   pollyEngine: 'neural', label: 'Hindi' },
  { code: 'th-TH', transcribeCode: 'th',    translateCode: 'th',    pollyVoiceId: 'Takumi',  pollyEngine: 'standard', label: 'Thai' },
  { code: 'id-ID', transcribeCode: 'id',    translateCode: 'id',    pollyVoiceId: 'Takumi',  pollyEngine: 'standard', label: 'Indonesian' },
  { code: 'vi-VN', transcribeCode: 'vi',    translateCode: 'vi',    pollyVoiceId: 'Takumi',  pollyEngine: 'standard', label: 'Vietnamese' },

  // Nordic languages
  { code: 'sv-SE', transcribeCode: 'sv',    translateCode: 'sv',    pollyVoiceId: 'Astrid',  pollyEngine: 'neural', label: 'Swedish' },
  { code: 'da-DK', transcribeCode: 'da',    translateCode: 'da',    pollyVoiceId: 'Naja',    pollyEngine: 'neural', label: 'Danish' },
  { code: 'no-NO', transcribeCode: 'no',    translateCode: 'no',    pollyVoiceId: 'Liv',     pollyEngine: 'neural', label: 'Norwegian' },
  { code: 'fi-FI', transcribeCode: 'fi',    translateCode: 'fi',    pollyVoiceId: 'Suvi',    pollyEngine: 'standard', label: 'Finnish' },

  // Other European languages
  { code: 'cs-CZ', transcribeCode: 'cs',    translateCode: 'cs',    pollyVoiceId: 'Takumi',  pollyEngine: 'standard', label: 'Czech' },
  { code: 'ro-RO', transcribeCode: 'ro',    translateCode: 'ro',    pollyVoiceId: 'Carmen',  pollyEngine: 'standard', label: 'Romanian' },
  { code: 'uk-UA', transcribeCode: 'uk',    translateCode: 'uk',    pollyVoiceId: 'Tatyana', pollyEngine: 'standard', label: 'Ukrainian' },

  // Middle Eastern languages
  { code: 'ar-SA', transcribeCode: 'ar',    translateCode: 'ar',    pollyVoiceId: 'Zeina',   pollyEngine: 'neural', label: 'Arabic' },
  { code: 'he-IL', transcribeCode: 'he',    translateCode: 'he',    pollyVoiceId: 'Takumi',  pollyEngine: 'standard', label: 'Hebrew' },
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
