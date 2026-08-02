import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { AIProvider, AIProviderName, AISettings } from '../types';
import { AI_TIMEOUTS } from '../utils/retry';
import { getAIFetch } from '../utils/httpFetch';

/** Official OpenAI API endpoint. This value is deliberately not user-editable. */
export const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

/** Pinned translation model; changing it requires an explicit release update. */
export const OPENAI_TRANSLATION_MODEL = 'gpt-5-mini-2025-08-07';

/** Named OpenAI adapter with an API-key-only configuration surface. */
export class OpenAIProvider implements AIProvider {
  id: AIProviderName = 'openai';
  name = 'OpenAI';
  requiresAuth = true;

  private client: ReturnType<typeof createOpenAICompatible>;
  private apiKey: string;
  private httpFetch: typeof fetch;

  constructor(settings: AISettings) {
    if (!settings.openaiApiKey?.trim()) {
      throw new Error('API key required');
    }

    this.apiKey = settings.openaiApiKey.trim();
    this.httpFetch = getAIFetch();
    this.client = createOpenAICompatible({
      name: 'openai',
      baseURL: OPENAI_API_BASE_URL,
      apiKey: this.apiKey,
      fetch: this.httpFetch,
    });
  }

  getModel(): LanguageModel {
    return this.client.chatModel(OPENAI_TRANSLATION_MODEL);
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpFetch(`${OPENAI_API_BASE_URL}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(AI_TIMEOUTS.HEALTH_CHECK),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
