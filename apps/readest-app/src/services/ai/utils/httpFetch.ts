import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';
import { INDEX_TRANSLATE_ENDPOINT, INDEX_TRANSLATE_ORIGIN } from '../constants';

export const AI_CLOUD_ORIGINS = Object.freeze([
  'https://api.deepseek.com',
  'https://api.openai.com',
  'https://api.anthropic.com',
  INDEX_TRANSLATE_ORIGIN,
]);

const isLoopbackOllamaOrigin = (url: URL): boolean =>
  url.protocol === 'http:' &&
  !url.username &&
  !url.password &&
  (url.hostname === '127.0.0.1' || url.hostname === 'localhost');

const toRequestUrl = (input: RequestInfo | URL): URL | null => {
  try {
    const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(value);
  } catch {
    return null;
  }
};

const isAllowedUrl = (url: URL | null): url is URL => {
  if (!url || url.username || url.password) return false;
  if (url.origin === INDEX_TRANSLATE_ORIGIN) return url.href === INDEX_TRANSLATE_ENDPOINT;
  return AI_CLOUD_ORIGINS.includes(url.origin) || isLoopbackOllamaOrigin(url);
};

/** Return true only for the fixed cloud providers or loopback Ollama. */
export const isAllowedAIEndpoint = (input: RequestInfo | URL): boolean =>
  isAllowedUrl(toRequestUrl(input));

/**
 * AI requests must not follow redirects. A redirect could otherwise send an
 * API key or book text to a host outside the fixed provider allow-list. Cookies
 * are also disabled because provider authentication is carried explicitly in
 * the request headers.
 */
export const createSafeAIFetch = (baseFetch: typeof fetch): typeof fetch => {
  return (input, init) => {
    const url = toRequestUrl(input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (
      !isAllowedUrl(url) ||
      (url.origin === INDEX_TRANSLATE_ORIGIN && method.toUpperCase() !== 'POST')
    ) {
      return Promise.reject(new Error('AI request target is outside the BabelLeaf allowlist'));
    }
    return baseFetch(input, {
      ...(init ?? {}),
      credentials: 'omit',
      redirect: 'error',
    });
  };
};

/**
 * AI providers use one of the fixed official cloud endpoints or a loopback
 * Ollama server. In a browser/webview context, `window.fetch` is subject to
 * CORS preflight rules; native Tauri builds instead use the Rust HTTP
 * transport permitted by the application capability. This removes platform
 * transport differences without opening access to arbitrary third-party URLs.
 *
 * Browser builds fall back to `window.fetch` and rely on the permitted upstream
 * endpoint to provide the required CORS headers.
 */
export const getAIFetch = (): typeof fetch => {
  const baseFetch: typeof fetch = isTauriAppPlatform()
    ? // The Tauri plugin forwards its native redirect setting to Rust;
      // the standard RequestInit.redirect field is not forwarded by the plugin.
      (input, init) => tauriFetch(input, { ...init, maxRedirections: 0 })
    : window.fetch.bind(window);
  return createSafeAIFetch(baseFetch);
};
