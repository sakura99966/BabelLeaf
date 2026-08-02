import { OllamaProvider } from './OllamaProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import type { AIProvider, AISettings } from '../types';

export { OllamaProvider, OpenRouterProvider };

export function getAIProvider(settings: AISettings): AIProvider {
  switch (settings.provider) {
    case 'ollama':
      return new OllamaProvider(settings);
    case 'openrouter':
      if (
        !settings.openrouterApiKey?.trim() ||
        !settings.openrouterBaseUrl?.trim() ||
        !settings.openrouterModel?.trim()
      ) {
        throw new Error('API key, base URL, and model are required');
      }
      return new OpenRouterProvider(settings);
    default:
      throw new Error(`Unknown provider: ${settings.provider}`);
  }
}
