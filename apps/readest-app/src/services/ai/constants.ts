import type { AISettings } from './types';

export const INDEX_TRANSLATE_LABEL = 'Bilibili Index-Translate';
export const INDEX_TRANSLATE_ORIGIN = 'https://index-translate.bilibili.com';
export const INDEX_TRANSLATE_ENDPOINT = `${INDEX_TRANSLATE_ORIGIN}/v1/chat/completions`;
export const INDEX_TRANSLATE_MODEL = 'Index-Translate-35B-A3B';

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'deepseek',

  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.2',
};
