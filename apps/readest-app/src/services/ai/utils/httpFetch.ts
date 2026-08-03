import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';

/**
 * AI requests must not follow redirects. A redirect could otherwise send an
 * API key or book text to a host outside the fixed provider allow-list. Cookies
 * are also disabled because provider authentication is carried explicitly in
 * the request headers.
 */
export const createSafeAIFetch = (baseFetch: typeof fetch): typeof fetch => {
  return (input, init) =>
    baseFetch(input, {
      ...(init ?? {}),
      credentials: 'omit',
      redirect: 'error',
    });
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
  const baseFetch = isTauriAppPlatform()
    ? (tauriFetch as unknown as typeof fetch)
    : window.fetch.bind(window);
  return createSafeAIFetch(baseFetch);
};
