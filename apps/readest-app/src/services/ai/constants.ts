import type { AISettings } from './types';

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'ollama',

  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.2',
  openrouterBaseUrl: '',
  openrouterModel: '',
};
