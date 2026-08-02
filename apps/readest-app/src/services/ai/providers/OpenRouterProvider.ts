import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { AIProvider, AISettings, AIProviderName } from '../types';
import { AI_TIMEOUTS } from '../utils/retry';
import { getAIFetch } from '../utils/httpFetch';

/**
 * Provider for any OpenAI-compatible /v1/chat/completions endpoint, with
 * all connection values supplied explicitly by the user.
 *
 * Transport: every outbound HTTP call from this provider is routed through
 * {@link getAIFetch} so that in the Tauri app it goes via the Rust
 * `@tauri-apps/plugin-http` transport (no CORS preflight, no Android
 * cleartext block, behaves like `curl`). In a pure web build it falls
 * back to `window.fetch` and the upstream must serve correct CORS headers.
 */
export class OpenRouterProvider implements AIProvider {
  id: AIProviderName = 'openrouter';
  name = 'OpenAI-compatible API';
  requiresAuth = true;

  private settings: AISettings;
  private client: ReturnType<typeof createOpenAICompatible>;
  private baseUrl: string;
  private apiKey: string;
  private httpFetch: typeof fetch;

  constructor(settings: AISettings) {
    this.settings = settings;
    if (!settings.openrouterApiKey) {
      throw new Error('API key required');
    }
    this.apiKey = settings.openrouterApiKey;
    if (!settings.openrouterBaseUrl?.trim()) {
      throw new Error('Base URL required');
    }
    if (!settings.openrouterModel?.trim()) {
      throw new Error('Model required');
    }
    this.baseUrl = settings.openrouterBaseUrl.trim().replace(/\/+$/, '');
    this.httpFetch = getAIFetch();
    this.client = createOpenAICompatible({
      name: 'custom-openai-compatible',
      baseURL: this.baseUrl,
      apiKey: this.apiKey,
      // Route chat completions through our environment-aware
      // fetch so streaming responses bypass the renderer's CORS sandbox
      // when running inside Tauri.
      fetch: this.httpFetch,
    });
  }

  getModel(): LanguageModel {
    return this.client.chatModel(this.settings.openrouterModel!);
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      // OpenAI-compatible servers all expose /models for listing; using it
      // as a lightweight check (no token spend, fast).
      const response = await this.httpFetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(AI_TIMEOUTS.HEALTH_CHECK),
      });
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Lightweight model entry returned by an OpenAI-compatible `/models`
 * endpoint. Only the fields we actually consume are typed; the upstream
 * response is allowed to carry arbitrary extras.
 */
export interface OpenRouterModelInfo {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
}

/**
 * Fetch the list of models exposed by an OpenAI-compatible endpoint.
 * Used by the settings UI to populate a model picker.
 *
 * Goes through {@link getAIFetch} so that in Tauri the request hits the
 * Rust HTTP transport rather than the renderer, avoiding CORS preflight
 * and Android cleartext restrictions.
 */
export async function fetchOpenRouterModels(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<OpenRouterModelInfo[]> {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Base URL required');
  const url = `${trimmed}/models`;
  const httpFetch = getAIFetch();
  const response = await httpFetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }
  const json = (await response.json()) as { data?: OpenRouterModelInfo[] };
  return Array.isArray(json.data) ? json.data : [];
}
