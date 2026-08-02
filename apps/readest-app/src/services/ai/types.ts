import type { LanguageModel } from 'ai';

export type AIProviderName = 'ollama' | 'openrouter';

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
  openrouterApiKey?: string;
  openrouterBaseUrl?: string;
  openrouterModel?: string;
}
