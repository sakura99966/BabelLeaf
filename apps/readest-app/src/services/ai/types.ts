import type { LanguageModel } from 'ai';

/** Providers that can be selected in the current product UI. */
export type ActiveAIProviderName = 'deepseek' | 'ollama';

/**
 * Includes the retired custom endpoint identifier so persisted settings from
 * earlier BabelLeaf builds can be read and normalized safely.
 */
export type AIProviderName = ActiveAIProviderName | 'openrouter';

export interface AIProvider {
  id: AIProviderName;
  name: string;
  requiresAuth: boolean;

  getModel(): LanguageModel;

  isAvailable(): Promise<boolean>;
  healthCheck(): Promise<boolean>;
}

export interface AISettings {
  provider: AIProviderName;

  ollamaBaseUrl: string;
  ollamaModel: string;

  // Runtime-only credential. It is never persisted in ordinary settings.
  deepseekApiKey?: string;

  /**
   * Legacy custom-endpoint fields. They are stripped on load and retained in
   * the type only to make upgrading older local settings non-breaking.
   */
  openrouterApiKey?: string;
  openrouterBaseUrl?: string;
  openrouterModel?: string;
}
