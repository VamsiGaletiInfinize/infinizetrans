import { LanguageOption } from '@/types';

/**
 * All 30+ languages supported by Deepgram Nova-2
 * with 95-98% accuracy and sub-second latency
 */
export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  // English variants
  { code: 'en-US', translateCode: 'en', label: 'English (US)' },
  { code: 'en-GB', translateCode: 'en', label: 'English (UK)' },
  { code: 'en-AU', translateCode: 'en', label: 'English (Australia)' },
  { code: 'en-IN', translateCode: 'en', label: 'English (India)' },

  // Spanish variants
  { code: 'es-ES', translateCode: 'es', label: 'Spanish (Spain)' },
  { code: 'es-US', translateCode: 'es', label: 'Spanish (US)' },
  { code: 'es-MX', translateCode: 'es', label: 'Spanish (Mexico)' },

  // French variants
  { code: 'fr-FR', translateCode: 'fr', label: 'French (France)' },
  { code: 'fr-CA', translateCode: 'fr', label: 'French (Canada)' },

  // German
  { code: 'de-DE', translateCode: 'de', label: 'German' },

  // Italian
  { code: 'it-IT', translateCode: 'it', label: 'Italian' },

  // Portuguese variants
  { code: 'pt-BR', translateCode: 'pt', label: 'Portuguese (Brazil)' },
  { code: 'pt-PT', translateCode: 'pt', label: 'Portuguese (Portugal)' },

  // Dutch
  { code: 'nl-NL', translateCode: 'nl', label: 'Dutch' },

  // Polish
  { code: 'pl-PL', translateCode: 'pl', label: 'Polish' },

  // Russian
  { code: 'ru-RU', translateCode: 'ru', label: 'Russian' },

  // Turkish
  { code: 'tr-TR', translateCode: 'tr', label: 'Turkish' },

  // Asian languages
  { code: 'zh-CN', translateCode: 'zh', label: 'Chinese (Mandarin)' },
  { code: 'zh-TW', translateCode: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'ja-JP', translateCode: 'ja', label: 'Japanese' },
  { code: 'ko-KR', translateCode: 'ko', label: 'Korean' },
  { code: 'hi-IN', translateCode: 'hi', label: 'Hindi' },
  { code: 'th-TH', translateCode: 'th', label: 'Thai' },
  { code: 'id-ID', translateCode: 'id', label: 'Indonesian' },
  { code: 'vi-VN', translateCode: 'vi', label: 'Vietnamese' },

  // Nordic languages
  { code: 'sv-SE', translateCode: 'sv', label: 'Swedish' },
  { code: 'da-DK', translateCode: 'da', label: 'Danish' },
  { code: 'no-NO', translateCode: 'no', label: 'Norwegian' },
  { code: 'fi-FI', translateCode: 'fi', label: 'Finnish' },

  // Other European languages
  { code: 'cs-CZ', translateCode: 'cs', label: 'Czech' },
  { code: 'ro-RO', translateCode: 'ro', label: 'Romanian' },
  { code: 'uk-UA', translateCode: 'uk', label: 'Ukrainian' },

  // Middle Eastern languages
  { code: 'ar-SA', translateCode: 'ar', label: 'Arabic' },
  { code: 'he-IL', translateCode: 'he', label: 'Hebrew' },
];
