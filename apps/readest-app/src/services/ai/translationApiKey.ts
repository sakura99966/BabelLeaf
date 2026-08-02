import { isTauriAppPlatform } from '@/services/environment';
import { clearSecureItem, getSecureItem, setSecureItem } from '@/utils/bridge';

const TRANSLATION_API_KEY_ID = 'babelleaf.translation.deepseek.api-key';

let sessionApiKey = '';

const normalize = (value?: string): string => value?.trim() ?? '';

export function getTranslationApiKey(): string {
  return sessionApiKey;
}

/**
 * Makes an edited key available to the active renderer immediately. The
 * settings panel persists it to secure storage on blur, avoiding a native
 * secure-store write for every keystroke while preserving click-to-translate.
 */
export function setTranslationApiKeyForSession(value: string): void {
  sessionApiKey = normalize(value);
}

/**
 * Load the DeepSeek credential into process memory. Native builds read it from
 * the operating system secure store; browser development keeps it only for the
 * current page lifetime. Legacy custom-endpoint keys are intentionally not
 * migrated because they must never be sent to DeepSeek automatically.
 */
export async function loadTranslationApiKey(): Promise<string> {
  if (!isTauriAppPlatform()) {
    return sessionApiKey;
  }

  try {
    const stored = await getSecureItem({ key: TRANSLATION_API_KEY_ID });
    const storedKey = normalize(stored.value);
    if (storedKey) {
      sessionApiKey = storedKey;
      return sessionApiKey;
    }
    sessionApiKey = '';
  } catch {
    sessionApiKey = '';
  }

  return sessionApiKey;
}

export async function saveTranslationApiKey(value: string): Promise<void> {
  const normalized = normalize(value);

  if (!isTauriAppPlatform()) {
    sessionApiKey = normalized;
    return;
  }

  const result = normalized
    ? await setSecureItem({ key: TRANSLATION_API_KEY_ID, value: normalized })
    : await clearSecureItem({ key: TRANSLATION_API_KEY_ID });

  if (!result.success) {
    throw new Error(result.error || 'Secure credential storage is unavailable');
  }
  sessionApiKey = normalized;
}
