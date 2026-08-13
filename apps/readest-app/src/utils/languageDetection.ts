import { franc } from 'franc-min';
import { iso6393To1 } from 'iso-639-3';

const commonIndivToMacro: Record<string, string> = {
  cmn: 'zho',
  arb: 'ara',
  arz: 'ara',
  ind: 'msa',
  zsm: 'msa',
  nob: 'nor',
  nno: 'nor',
  pes: 'fas',
  quy: 'que',
};

export const code6393to6391 = (code: string): string => {
  const macro = commonIndivToMacro[code] || code;
  return iso6393To1[macro] || '';
};

/** Heavy statistical detection, loaded only by content paths that need it. */
export const detectLanguage = (content: string): string => {
  try {
    const iso6393Lang = franc(content.substring(0, 1000));
    return code6393to6391(iso6393Lang) || 'en';
  } catch {
    console.warn('Language detection failed, defaulting to en.');
    return 'en';
  }
};
