import { createOllama } from 'ai-sdk-ollama';
import type { LanguageModel } from 'ai';
import type { AIProvider, AIProviderName, AISettings } from '../types';
import { AI_TIMEOUTS } from '../utils/retry';
import { getAIFetch } from '../utils/httpFetch';

export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

/**
 * The native network capability permits only HTTP loopback connections for
 * Ollama. Keep the runtime check aligned with that capability for web builds
 * and for future capability changes.
 */
export const isLoopbackOllamaUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      !url.username &&
      !url.password &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    );
  } catch {
    return false;
  }
};

export const normalizeOllamaBaseUrl = (value?: string): string => {
  const baseUrl = value?.trim() || DEFAULT_OLLAMA_BASE_URL;
  if (!isLoopbackOllamaUrl(baseUrl)) {
    throw new Error('Ollama URL must use an HTTP loopback address');
  }
  return baseUrl.replace(/\/+$/, '');
};

/** Provider for a local loopback Ollama instance. */
export class OllamaProvider implements AIProvider {
  id: AIProviderName = 'ollama';
  name = 'Ollama (Local)';
  requiresAuth = false;

  private ollama;
  private settings: AISettings;
  private baseUrl: string;
  private httpFetch: typeof fetch;

  constructor(settings: AISettings) {
    this.settings = settings;
    this.baseUrl = normalizeOllamaBaseUrl(settings.ollamaBaseUrl);
    this.httpFetch = getAIFetch();
    this.ollama = createOllama({
      baseURL: this.baseUrl,
      fetch: this.httpFetch,
    });
  }

  getModel(): LanguageModel {
    return this.ollama(this.settings.ollamaModel || 'llama3.2');
  }

  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUTS.OLLAMA_CONNECT);
    try {
      const response = await this.httpFetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUTS.HEALTH_CHECK);
    try {
      const response = await this.httpFetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      if (!response.ok) return false;
      const data = await response.json();
      const modelName = this.settings.ollamaModel?.split(':')[0] ?? '';
      return (
        data.models?.some((model: { name: string }) => model.name.includes(modelName)) ?? false
      );
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
