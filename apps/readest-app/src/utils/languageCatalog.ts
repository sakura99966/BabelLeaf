import { iso6392 } from 'iso-639-2';
import { normalizedLangCode } from './lang';

/**
 * Convert an ISO 639-2/B code to ISO 639-1.
 *
 * Kept outside `lang.ts` because the complete ISO catalogue is only needed by
 * language-facing UI, not by the library launch path.
 */
export const code6392to6391 = (code: string): string => {
  const lang = iso6392.find((entry) => entry.iso6392B === code);
  return lang?.iso6391 || '';
};

export const getLanguageName = (code: string): string => {
  const lang = normalizedLangCode(code);
  const language = iso6392.find((entry) => entry.iso6391 === lang || entry.iso6392B === lang);
  return language ? language.name : lang;
};
