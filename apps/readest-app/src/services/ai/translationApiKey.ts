import { isTauriAppPlatform } from '@/services/environment';
import { clearSecureItem, getSecureItem, setSecureItem } from '@/utils/bridge';

export type TranslationApiKeyProvider = 'deepseek' | 'openai' | 'anthropic';

const TRANSLATION_API_KEY_IDS: Record<TranslationApiKeyProvider, string> = {
  deepseek: 'babelleaf.translation.deepseek.api-key',
  openai: 'babelleaf.translation.openai.api-key',
  anthropic: 'babelleaf.translation.anthropic.api-key',
};

const sessionApiKeys: Record<TranslationApiKeyProvider, string> = {
  deepseek: '',
  openai: '',
  anthropic: '',
};

const normalize = (value?: string): string => value?.trim() ?? '';

export function getTranslationApiKey(provider: TranslationApiKeyProvider = 'deepseek'): string {
  return sessionApiKeys[provider];
}

/**
 * Makes an edited key available to the active renderer immediately. The
 * settings panel persists it to secure storage on blur, avoiding a native
 * secure-store write for every keystroke while preserving click-to-translate.
 */
export function setTranslationApiKeyForSession(
  value: string,
  provider: TranslationApiKeyProvider = 'deepseek',
): void {
  sessionApiKeys[provider] = normalize(value);
}

/**
 * Load one provider credential into process memory. Native builds read it from
 * the operating system secure store; browser development keeps it only for the
 * current page lifetime. Legacy custom-endpoint keys are intentionally not
 * migrated because they must never be sent to a different provider
 * automatically.
 */
export async function loadTranslationApiKey(
  provider: TranslationApiKeyProvider = 'deepseek',
): Promise<string> {
  if (!isTauriAppPlatform()) {
    return sessionApiKeys[provider];
  }

  try {
    const stored = await getSecureItem({ key: TRANSLATION_API_KEY_IDS[provider] });
    const storedKey = normalize(stored.value);
    if (storedKey) {
      sessionApiKeys[provider] = storedKey;
      return storedKey;
    }
    sessionApiKeys[provider] = '';
  } catch {
    sessionApiKeys[provider] = '';
  }

  return sessionApiKeys[provider];
}

export async function loadTranslationApiKeys(): Promise<Record<TranslationApiKeyProvider, string>> {
  await Promise.all(
    (Object.keys(TRANSLATION_API_KEY_IDS) as TranslationApiKeyProvider[]).map((provider) =>
      loadTranslationApiKey(provider),
    ),
  );
  return { ...sessionApiKeys };
}

export async function saveTranslationApiKey(
  value: string,
  provider: TranslationApiKeyProvider = 'deepseek',
): Promise<void> {
  const normalized = normalize(value);

  if (!isTauriAppPlatform()) {
    sessionApiKeys[provider] = normalized;
    return;
  }

  const result = normalized
    ? await setSecureItem({ key: TRANSLATION_API_KEY_IDS[provider], value: normalized })
    : await clearSecureItem({ key: TRANSLATION_API_KEY_IDS[provider] });

  if (!result.success) {
    throw new Error(result.error || 'Secure credential storage is unavailable');
  }
  sessionApiKeys[provider] = normalized;
}
