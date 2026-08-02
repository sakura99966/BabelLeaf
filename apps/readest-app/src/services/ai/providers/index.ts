import { DeepSeekProvider } from './DeepSeekProvider';
import { OllamaProvider } from './OllamaProvider';
import type { AIProvider, AISettings } from '../types';

export { DeepSeekProvider, OllamaProvider };

export function getAIProvider(settings: AISettings): AIProvider {
  switch (settings.provider) {
    case 'deepseek':
      return new DeepSeekProvider(settings);
    case 'ollama':
      return new OllamaProvider(settings);
    case 'openrouter':
      throw new Error('The custom OpenAI-compatible provider is no longer supported');
    default:
      throw new Error(`Unknown provider: ${settings.provider}`);
  }
}
