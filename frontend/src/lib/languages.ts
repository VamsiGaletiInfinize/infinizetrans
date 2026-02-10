import { LanguageOption } from '@/types';

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en-US', translateCode: 'en',    label: 'English',              speechSupported: true  },
  { code: 'zh-TW', translateCode: 'zh-TW', label: 'Chinese (Traditional)', speechSupported: true  },
  { code: 'fr-FR', translateCode: 'fr',    label: 'French',               speechSupported: true  },
  { code: 'ko-KR', translateCode: 'ko',    label: 'Korean',               speechSupported: true  },
  { code: 'es-US', translateCode: 'es',    label: 'Spanish',              speechSupported: true  },
  { code: 'vi-VN', translateCode: 'vi',    label: 'Vietnamese',           speechSupported: false },
  { code: 'am-ET', translateCode: 'am',    label: 'Amharic',             speechSupported: false },
  { code: 'hi-IN', translateCode: 'hi',    label: 'Hindi',                speechSupported: true  },
];
