import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

type HttpPermission = {
  identifier: string;
  allow?: Array<{ url?: string }>;
};

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T;

describe('DeepSeek translation network contract', () => {
  test('limits renderer connections to DeepSeek and loopback Ollama', () => {
    const config = readJson<{ app: { security: { csp: Record<string, string> } } }>(
      'src-tauri/tauri.conf.json',
    );
    const connectSource = config.app.security.csp['connect-src'];

    expect(connectSource).toContain('https://api.deepseek.com');
    expect(connectSource).toContain('http://127.0.0.1:*');
    expect(connectSource).toContain('http://localhost:*');
    expect(connectSource).not.toContain('https://*:*');
    expect(connectSource).not.toContain('http://*:*');
  });

  test('limits native HTTP permission to the same fixed remote and loopback targets', () => {
    const capability = readJson<{ permissions: HttpPermission[] }>(
      'src-tauri/capabilities/default.json',
    );
    const httpPermission = capability.permissions.find(
      (entry): entry is HttpPermission =>
        typeof entry === 'object' && entry.identifier === 'http:default',
    );

    expect(httpPermission?.allow?.map(({ url }) => url)).toEqual([
      'https://api.deepseek.com/*',
      'http://127.0.0.1:*/*',
      'http://localhost:*/*',
    ]);
  });
});
