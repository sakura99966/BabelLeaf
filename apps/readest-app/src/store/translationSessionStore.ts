import { create } from 'zustand';
import { getLocale } from '@/utils/misc';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { useSettingsStore } from './settingsStore';

interface TranslationGrant {
  context: string;
  controller: AbortController;
}

interface TranslationSessionState {
  grants: Record<string, TranslationGrant>;
  grant(bookKey: string, context: string): void;
  revoke(bookKey: string): void;
}

/** No persist middleware, settings serialization, IPC broadcast or credentials. */
export const useTranslationSessionStore = create<TranslationSessionState>((set, get) => ({
  grants: {},
  grant: (bookKey, context) => {
    get().grants[bookKey]?.controller.abort();
    set((state) => ({
      grants: { ...state.grants, [bookKey]: { context, controller: new AbortController() } },
    }));
  },
  revoke: (bookKey) => {
    const old = get().grants[bookKey];
    if (!old) return;
    old.controller.abort();
    set((state) => {
      const grants = { ...state.grants };
      delete grants[bookKey];
      return { grants };
    });
  },
}));

export function getTranslationConsentContext(
  provider: string = 'deepseek',
  targetLang: string = getLocale(),
): string {
  // Cloud model/prompt are application-owned constants: a new build/restart
  // drops all grants. Only the approved local adapter has mutable model/URL.
  // Do not import provider SDKs into the basic readerStore dependency graph.
  const ai = { ...DEFAULT_AI_SETTINGS, ...useSettingsStore.getState().settings.aiSettings };
  return JSON.stringify([
    provider,
    targetLang,
    provider === 'ollama' ? ai.ollamaModel : null,
    provider === 'ollama' ? ai.ollamaBaseUrl : null,
  ]);
}
