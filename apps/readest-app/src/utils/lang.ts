import type { LocaleWithTextInfo } from '@/types/misc';

export const isCJKStr = (str: string) => {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(str ?? '');
};

export const isCJKLang = (lang: string | null | undefined): boolean => {
  if (!lang) return false;
  const normalizedLang = normalizedLangCode(lang);
  return ['zh', 'ja', 'ko', 'zho', 'jpn', 'kor'].includes(normalizedLang);
};

/**
 * Languages whose primary script has no uppercase/lowercase distinction.
 * Matters for UI rules that lean on the `uppercase` CSS property for visual
 * emphasis — those rules are no-ops here, so callers usually pair this with
 * an alternate weight/size treatment (e.g. bigger font-size in section
 * headers). Covers CJK, Arabic-script (Arabic, Persian), Hebrew, the major
 * Indic scripts (Devanagari, Bengali, Tamil, Sinhala), Thai, and Tibetan.
 */
export const isCaselessLang = (lang: string | null | undefined): boolean => {
  if (!lang) return false;
  const normalizedLang = normalizedLangCode(lang);
  return [
    'zh',
    'ja',
    'ko', // CJK
    'ar',
    'fa', // Arabic script
    'he', // Hebrew
    'hi',
    'bn',
    'ta',
    'si', // Indic scripts
    'th', // Thai
    'bo', // Tibetan
    'zho',
    'jpn',
    'kor',
    'ara',
    'fas', // ISO-639-3 aliases
    'heb',
    'hin',
    'ben',
    'tam',
    'sin',
    'tha',
    'bod',
  ].includes(normalizedLang);
};

const ZH_SCRIPTS_MAPPING: Record<string, string> = {
  zh: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-hk': 'zh-Hant',
  'zh-tw': 'zh-Hant',
  'zh-mo': 'zh-Hant',
  'zh-hans': 'zh-Hans',
  'zh-hant': 'zh-Hant',
};

export const normalizeToFullLang = (langCode: string): string => {
  try {
    const locale = new Intl.Locale(langCode.toLowerCase());
    const maximized = locale.maximize();

    if (maximized.language === 'zh') {
      return maximized.script === 'Hant' ? 'zh-Hant' : 'zh-Hans';
    }

    return maximized.region ? `${maximized.language}-${maximized.region}` : langCode;
  } catch {
    return ZH_SCRIPTS_MAPPING[langCode.toLowerCase()] || langCode;
  }
};

export const normalizeToShortLang = (langCode: string): string => {
  const lang = langCode.toLowerCase();
  if (lang.startsWith('zh')) {
    return ZH_SCRIPTS_MAPPING[lang] || 'zh-Hans';
  }
  return lang.split('-')[0]!;
};

export const normalizedLangCode = (lang: string | null | undefined): string => {
  if (!lang) return '';
  return lang.split('-')[0]!.toLowerCase();
};

export const isSameLang = (lang1?: string | null, lang2?: string | null): boolean => {
  if (!lang1 || !lang2) return false;
  const normalizedLang1 = normalizedLangCode(lang1);
  const normalizedLang2 = normalizedLangCode(lang2);
  return normalizedLang1 === normalizedLang2;
};

let englishLanguageNames: Intl.DisplayNames | null | undefined;

const getEnglishLanguageNames = (): Intl.DisplayNames | null => {
  if (englishLanguageNames !== undefined) return englishLanguageNames;
  try {
    englishLanguageNames = new Intl.DisplayNames(['en'], {
      type: 'language',
      fallback: 'none',
    });
  } catch {
    englishLanguageNames = null;
  }
  return englishLanguageNames;
};

export const isValidLang = (lang?: string) => {
  if (!lang) return false;
  if (typeof lang !== 'string') return false;
  const code = normalizedLangCode(lang);
  if (['und', 'mul', 'mis', 'zxx'].includes(code)) return false;
  if (!/^[a-z]{2,3}$/.test(code)) return false;

  try {
    const names = getEnglishLanguageNames();
    if (names) return names.of(code) !== undefined;
  } catch {
    return false;
  }

  // DisplayNames is present on every supported WebView, but keep a bounded
  // compatibility fallback for older embedded engines. Canonical three-letter
  // aliases collapse to two letters; structurally valid two-letter tags are
  // accepted for OS-provided voices even when the engine lacks name data.
  try {
    const canonical = new Intl.Locale(code).language;
    return code.length === 2 || canonical.length === 2;
  } catch {
    return false;
  }
};

/** Convert a known ISO 639-2/B alias without loading the full language table. */
export const code6392to6391 = (code: string): string => {
  const normalized = code.toLowerCase();
  if (normalized.length !== 3 || !isValidLang(normalized)) return '';
  try {
    const canonical = new Intl.Locale(normalized).language;
    return canonical.length === 2 ? canonical : '';
  } catch {
    return '';
  }
};

export const inferLangFromScript = (text: string, lang: string): string => {
  if (!lang || lang === 'en') {
    if (/[\p{Script=Hangul}]/u.test(text)) {
      return 'ko';
    } else if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) {
      return 'ja';
    } else if (/[\p{Script=Han}]/u.test(text)) {
      return 'zh';
    }
  }
  return lang;
};

export const getLanguageInfo = (lang: string) => {
  if (!lang) return {};
  try {
    const canonical = Intl.getCanonicalLocales(lang)[0]!;
    const locale = new Intl.Locale(canonical) as LocaleWithTextInfo;
    const isCJK = ['zh', 'ja', 'kr'].includes(locale.language);
    const direction = (locale.getTextInfo?.() ?? locale.textInfo)?.direction;
    return { canonical, locale, isCJK, direction };
  } catch (e) {
    console.warn(e);
    return {};
  }
};
