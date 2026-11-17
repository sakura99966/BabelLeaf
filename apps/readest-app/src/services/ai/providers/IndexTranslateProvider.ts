import {
  INDEX_TRANSLATE_ENDPOINT,
  INDEX_TRANSLATE_LABEL,
  INDEX_TRANSLATE_MODEL,
} from '../constants';
import type { AIProvider, AITextGenerationRequest } from '../types';
import { getAIFetch } from '../utils/httpFetch';
import { AI_TIMEOUTS } from '../utils/retry';

const MAX_INPUT_CHARS = 16_384;
const MAX_RESPONSE_BYTES = 256 * 1024;

type ChatCompletion = {
  choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } | null } | null>;
};

async function readCompletion(response: Response): Promise<ChatCompletion | null> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Index-Translate returned an invalid response');
  let finished = false;
  try {
    const decoder = new TextDecoder();
    let size = 0;
    let json = '';
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('Index-Translate response is too large');
      json += decoder.decode(value, { stream: true });
    }
    try {
      return JSON.parse(json + decoder.decode()) as ChatCompletion | null;
    } catch {
      throw new Error('Index-Translate returned an invalid response');
    }
  } finally {
    if (!finished) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Bilibili's public text API: no accounts, tokens, proxy, or local model. */
export class IndexTranslateProvider implements AIProvider {
  readonly id = 'index-translate';
  readonly name = INDEX_TRANSLATE_LABEL;
  readonly requiresAuth = false;

  async isAvailable(): Promise<boolean> {
    return true; // Configuration only; never poll or probe the service implicitly.
  }

  private async complete(
    { system, prompt, signal }: AITextGenerationRequest,
    maxTokens: number,
  ): Promise<string> {
    signal?.throwIfAborted();
    if (system.length + prompt.length + 2 > MAX_INPUT_CHARS) {
      throw new Error('Text is too large for Index-Translate; translate a shorter section');
    }

    const response = await getAIFetch()(INDEX_TRANSLATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Index-Translate-Client/1.0',
      },
      body: JSON.stringify({
        model: INDEX_TRANSLATE_MODEL,
        // The official example uses a single user message for instructions and source text.
        messages: [{ role: 'user', content: `${system}\n\n${prompt}` }],
        stream: false,
        temperature: 0,
        max_tokens: maxTokens,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal,
    });
    if (!response.ok || signal?.aborted) {
      void response.body?.cancel().catch(() => undefined);
      signal?.throwIfAborted();
      throw Object.assign(new Error(`Index-Translate request failed (${response.status})`), {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
      });
    }

    const data = await readCompletion(response);
    signal?.throwIfAborted();
    const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
    if (!choice || typeof choice.message?.content !== 'string') {
      throw new Error('Index-Translate returned an invalid response');
    }
    if (choice.finish_reason !== 'stop') {
      throw new Error('Translation provider returned an incomplete response');
    }

    // Ignore a leading reasoning block even if the server ignores the thinking flag.
    let text = choice.message.content.trim();
    if (text.startsWith('<think>')) {
      const end = text.indexOf('</think>');
      if (end < 0) throw new Error('Translation provider returned an incomplete response');
      text = text.slice(end + '</think>'.length).trim();
    }
    if (!text) throw new Error('Translation provider returned an empty response');
    return text;
  }

  async generateText(request: AITextGenerationRequest): Promise<string> {
    return this.complete(request, 4096);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.complete(
        {
          system:
            'Translate the English sentence into Simplified Chinese. Output only the translation.',
          prompt: 'Hello.',
          signal: AbortSignal.timeout(AI_TIMEOUTS.HEALTH_CHECK),
        },
        32,
      );
      return true;
    } catch {
      return false;
    }
  }
}
