export const ANSWER_MODES = ['every', 'judged', 'manual'] as const;
export const ANSWER_WAITS = ['quick', 'balanced', 'patient'] as const;
// How long a meeting's model thinks before each answer (server/harness.ts), chosen per meeting; without a choice the
// model's own default, the quickest it answers well at. A model without one of them uses the nearest higher one it has
// (server/models.ts effortFor). More thinking writes the first words later and costs more.
export const ANSWER_EFFORTS = ['none', 'low', 'medium', 'high'] as const;
export type AnswerEffort = typeof ANSWER_EFFORTS[number];
export const AUTO_TRANSLATION = 'auto';
export const NO_TRANSLATION = 'none';
export const TRANSLATION_LANGUAGES = [
  'af', 'sq', 'ar', 'az', 'eu', 'be', 'bn', 'bs', 'bg', 'ca', 'zh', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'gl',
  'de', 'el', 'gu', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'kn', 'kk', 'ko', 'lv', 'lt', 'mk', 'ms', 'ml', 'mr', 'no', 'fa',
  'pl', 'pt', 'pa', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'sw', 'sv', 'tl', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'vi', 'cy',
] as const;
export type TranslationLanguage = typeof TRANSLATION_LANGUAGES[number];
