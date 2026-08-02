import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';

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
  if (isTauriAppPlatform()) {
    return tauriFetch as unknown as typeof fetch;
  }
  return window.fetch.bind(window);
};
