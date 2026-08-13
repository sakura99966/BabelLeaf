import type { AIProvider, AIProviderName, AISettings, AITextGenerationRequest } from '../types';
import { AI_TIMEOUTS } from '../utils/retry';
import { getAIFetch } from '../utils/httpFetch';
import { responseContainsModel } from '../utils/modelAvailability';

/** Official Anthropic Messages API endpoint. This value is not user-editable. */
export const ANTHROPIC_API_BASE_URL = 'https://api.anthropic.com';

/**
 * Pinned supported translation model. Changing it requires an explicit
 * release update because the model name is application-controlled.
 */
export const ANTHROPIC_TRANSLATION_MODEL = 'claude-sonnet-4-6';

export const ANTHROPIC_API_VERSION = '2023-06-01';

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
};

/** Named Anthropic Messages adapter with an API-key-only configuration surface. */
export class AnthropicProvider implements AIProvider {
  id: AIProviderName = 'anthropic';
  name = 'Anthropic Claude';
  requiresAuth = true;

  private apiKey: string;
  private httpFetch: typeof fetch;

  constructor(settings: AISettings) {
    if (!settings.anthropicApiKey?.trim()) {
      throw new Error('API key required');
    }

    this.apiKey = settings.anthropicApiKey.trim();
    this.httpFetch = getAIFetch();
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generateText({ system, prompt, signal }: AITextGenerationRequest): Promise<string> {
    const response = await this.httpFetch(`${ANTHROPIC_API_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_TRANSLATION_MODEL,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    });

    const payload = (await response.json().catch(() => ({}))) as AnthropicResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message || `Anthropic request failed (${response.status})`);
    }

    const text = payload.content
      ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) {
      throw new Error('Translation provider returned an empty response');
    }
    return text;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpFetch(`${ANTHROPIC_API_BASE_URL}/v1/models?limit=100`, {
        method: 'GET',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
        },
        signal: AbortSignal.timeout(AI_TIMEOUTS.HEALTH_CHECK),
      });
      return await responseContainsModel(response, ANTHROPIC_TRANSLATION_MODEL);
    } catch {
      return false;
    }
  }
}
