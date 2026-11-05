// The languages the live translation beside the overlay (docs/TRANSLATION_EVALUATION.md) translates a meeting into: the
// ones Soniox's real-time translation writes (https://soniox.com/docs/translation/supported-languages, 2026-10-28),
// which desktop apps before 0.28.4 used, all of which Google Cloud Translation writes too (server/translation.ts).
export const TRANSLATION_LANGUAGES = [
  'af', 'sq', 'ar', 'az', 'eu', 'be', 'bn', 'bs', 'bg', 'ca', 'zh', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'gl',
  'de', 'el', 'gu', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'kn', 'kk', 'ko', 'lv', 'lt', 'mk', 'ms', 'ml', 'mr', 'no', 'fa',
  'pl', 'pt', 'pa', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'sw', 'sv', 'tl', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'vi', 'cy',
] as const;
export type TranslationLanguage = typeof TRANSLATION_LANGUAGES[number];

/** The translation language matching an interface language (src/i18n.ts INTERFACE_LANGUAGES). */
export const interfaceTranslationLanguage = (language: string): TranslationLanguage =>
  TRANSLATION_LANGUAGES.find(code => code === language.split('-')[0]) ?? 'en';

/** The translation languages named in `locale`, in its alphabetical order. */
export function translationLanguageOptions(locale: string): { id: TranslationLanguage; name: string }[] {
  const names = new Intl.DisplayNames([locale], { type: 'language' });
  return TRANSLATION_LANGUAGES.map(id => ({ id, name: names.of(id)! })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

// The translations of a turn's pieces are joined with a space; between characters of a script written without spaces,
// or their full-width punctuation, dashes and quotes, it is dropped.
const CLOSE = '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\u3000-\\u303f\\uff00-\\uffef\\u2014\\u2026\\u201c\\u201d\\u2018\\u2019]';
const SPACE_BETWEEN_CLOSE = new RegExp(`(?<=${CLOSE})\\s+(?=${CLOSE})`, 'gu');
/** Runs of translated text as one text. */
export const joinedTranslation = (texts: readonly string[]) => texts.join('').replace(/\s+/g, ' ').trim().replace(SPACE_BETWEEN_CLOSE, '');

/**
 * What the translation window shows (desktop/translation.cjs): the live meeting's pieces of speech with their
 * translations. `translation` null: speech already in the target language. `state`: translating while listening,
 * waiting before, unavailable when the meeting is not recognized online.
 */
export type TranslationEntry = { id: string; source: 'system' | 'microphone'; turnId: string | null; speakerId: string | null; speaker: string | null; text: string; translation: string | null };
export type TranslationView = { sessionId: string | null; target: string | null; state: 'translating' | 'waiting' | 'unavailable'; entries: TranslationEntry[] };
