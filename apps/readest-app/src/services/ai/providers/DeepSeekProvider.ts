import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { AIProvider, AIProviderName, AISettings } from '../types';
import { AI_TIMEOUTS } from '../utils/retry';
import { getAIFetch } from '../utils/httpFetch';

/** Official DeepSeek API endpoint. This value is deliberately not user-editable. */
export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com';

/** Default V4 model for reader translation requests. */
export const DEEPSEEK_TRANSLATION_MODEL = 'deepseek-v4-flash';

/**
 * Built-in DeepSeek V4 translation provider.
 *
 * DeepSeek exposes an OpenAI-compatible Chat Completions interface, while the
 * endpoint and translation model remain application-controlled. This gives the
 * user a one-field setup (API key) and prevents accidental requests to an
 * arbitrary endpoint.
 */
export class DeepSeekProvider implements AIProvider {
  id: AIProviderName = 'deepseek';
  name = 'DeepSeek V4';
  requiresAuth = true;

  private client: ReturnType<typeof createOpenAICompatible>;
  private apiKey: string;
  private httpFetch: typeof fetch;

  constructor(settings: AISettings) {
    if (!settings.deepseekApiKey?.trim()) {
      throw new Error('API key required');
    }

    this.apiKey = settings.deepseekApiKey.trim();
    this.httpFetch = getAIFetch();
    this.client = createOpenAICompatible({
      name: 'deepseek',
      baseURL: DEEPSEEK_API_BASE_URL,
      apiKey: this.apiKey,
      fetch: this.httpFetch,
    });
  }

  getModel(): LanguageModel {
    return this.client.chatModel(DEEPSEEK_TRANSLATION_MODEL);
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const response = await this.httpFetch(`${DEEPSEEK_API_BASE_URL}/models`, {
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
