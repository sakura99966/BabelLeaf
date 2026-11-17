import type { LanguageModel } from 'ai';

/** Providers that can be selected in the current product UI. */
const ACTIVE_AI_PROVIDER_NAMES = [
  'deepseek',
  'ollama',
  'openai',
  'anthropic',
  'index-translate',
] as const;
export type ActiveAIProviderName = (typeof ACTIVE_AI_PROVIDER_NAMES)[number];

export const isActiveAIProviderName = (name: string): name is ActiveAIProviderName =>
  ACTIVE_AI_PROVIDER_NAMES.some((provider) => provider === name);

export type TranslationApiKeyProvider = 'deepseek' | 'openai' | 'anthropic';

export const requiresTranslationApiKey = (
  provider: string,
): provider is TranslationApiKeyProvider =>
  provider === 'deepseek' || provider === 'openai' || provider === 'anthropic';

/**
 * Includes the retired custom endpoint identifier so persisted settings from
 * earlier BabelLeaf builds can be read and normalized safely.
 */
export type AIProviderName = ActiveAIProviderName | 'openrouter';

export interface AIProvider {
  id: AIProviderName;
  name: string;
  requiresAuth: boolean;

  /**
   * SDK-backed providers expose a model. Providers with different protocol
   * or transport requirements can implement `generateText` directly.
   */
  getModel?: () => LanguageModel;

  /** Generate one bounded text response using the provider-native protocol. */
  generateText?: (request: AITextGenerationRequest) => Promise<string>;

  isAvailable(): Promise<boolean>;
  healthCheck(): Promise<boolean>;
}

export interface AITextGenerationRequest {
  system: string;
  prompt: string;
  signal?: AbortSignal;
}

export interface AISettings {
  provider: AIProviderName;

  ollamaBaseUrl: string;
  ollamaModel: string;

  // Runtime-only credential. It is never persisted in ordinary settings.
  deepseekApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;

  /**
   * Legacy custom-endpoint fields. They are stripped on load and retained in
   * the type only to make upgrading older local settings non-breaking.
   */
  openrouterApiKey?: string;
  openrouterBaseUrl?: string;
  openrouterModel?: string;
}
