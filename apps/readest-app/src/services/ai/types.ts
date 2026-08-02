import type { LanguageModel } from 'ai';

/** Providers that can be selected in the current product UI. */
export type ActiveAIProviderName = 'deepseek' | 'ollama' | 'openai' | 'anthropic';

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
   * OpenAI-compatible providers expose a model for the AI SDK. Providers
   * with a different wire protocol may implement `generateText` instead.
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
