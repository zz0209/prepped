export const LANGUAGE_CODES = [
  'auto', 'en', 'zh', 'yue', 'af', 'ar', 'hy', 'az', 'be', 'bs', 'bg', 'ca', 'hr', 'cs', 'da', 'nl', 'et', 'fi', 'fr',
  'gl', 'de', 'el', 'he', 'hi', 'hu', 'is', 'id', 'it', 'ja', 'kn', 'kk', 'ko', 'lv', 'lt', 'mk', 'ms', 'mr', 'mi',
  'ne', 'no', 'fa', 'pl', 'pt', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'sw', 'sv', 'tl', 'ta', 'th', 'tr', 'uk', 'ur', 'vi', 'cy',
] as const;

export function languageOptions(locale: string): { id: string; name: string }[] {
  const names = new Intl.DisplayNames([locale], { type: 'language' });
  return LANGUAGE_CODES.filter(code => code !== 'auto').map(id => ({ id, name: names.of(id)! })).sort((a, b) => a.name.localeCompare(b.name, locale));
}
