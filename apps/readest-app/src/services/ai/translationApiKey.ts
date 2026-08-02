import { isTauriAppPlatform } from '@/services/environment';
import { clearSecureItem, getSecureItem, setSecureItem } from '@/utils/bridge';

const TRANSLATION_API_KEY_ID = 'babelleaf.translation.openai-compatible.api-key';

let sessionApiKey = '';

const normalize = (value?: string): string => value?.trim() ?? '';

export function getTranslationApiKey(): string {
  return sessionApiKey;
}

/**
 * Load the OpenAI-compatible translation credential into process memory.
 *
 * A plaintext value is accepted only for one-time migration from old settings.
 * Native builds move it into the operating system's secure store. Browser
 * development keeps it only for the current page lifetime.
 */
export async function loadTranslationApiKey(legacyPlaintextKey?: string): Promise<string> {
  const legacyKey = normalize(legacyPlaintextKey);

  if (!isTauriAppPlatform()) {
    if (legacyKey) sessionApiKey = legacyKey;
    return sessionApiKey;
  }

  try {
    const stored = await getSecureItem({ key: TRANSLATION_API_KEY_ID });
    const storedKey = normalize(stored.value);
    if (storedKey) {
      sessionApiKey = storedKey;
      return sessionApiKey;
    }

    if (legacyKey) {
      const migrated = await setSecureItem({
        key: TRANSLATION_API_KEY_ID,
        value: legacyKey,
      });
      if (!migrated.success) {
        throw new Error(migrated.error || 'Secure credential storage is unavailable');
      }
      sessionApiKey = legacyKey;
    } else {
      sessionApiKey = '';
    }
  } catch {
    // Keep a legacy value usable for this process, but never write it back to
    // settings. A subsequent explicit save can retry the native secure store.
    sessionApiKey = legacyKey;
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
