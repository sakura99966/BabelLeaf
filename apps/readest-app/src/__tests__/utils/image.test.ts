import { afterEach, describe, expect, it, vi } from 'vitest';

import { dataUrlToBytes, fetchImageAsBase64, isLocalImageResource } from '@/utils/image';

describe('local image utilities', () => {
  afterEach(() => vi.restoreAllMocks());

  it('decodes data URLs without network access', () => {
    const image = dataUrlToBytes('data:text/plain;base64,aGVsbG8=');
    expect(new TextDecoder().decode(image.bytes)).toBe('hello');
    expect(image.mimeType).toBe('text/plain');
  });

  it('accepts local image transports and rejects external HTTP URLs', () => {
    expect(isLocalImageResource('/icon.png')).toBe(true);
    expect(isLocalImageResource('blob:http://localhost/image')).toBe(true);
    expect(isLocalImageResource('asset://localhost/cover.png')).toBe(true);
    expect(isLocalImageResource('https://example.com/cover.png')).toBe(false);
  });

  it('refuses an external URL before calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(fetchImageAsBase64('https://example.com/cover.png')).rejects.toThrow(
      'Only local image resources are supported',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
