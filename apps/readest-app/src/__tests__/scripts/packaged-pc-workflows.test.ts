import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  makePackagedPcSettings,
  startPackagedOllamaFixture,
} from '../../../scripts/packaged-pc-workflows.mjs';

test('candidate publication requires the same installed binary to finish PC workflows', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '../../.github/workflows/pull-request.yml'),
    'utf8',
  );
  expect(workflow).toContain('verified-app/babelleaf.exe --pc-core-workflows');
  expect(workflow).toContain('-not $probe.pcWorkflows.passed');
  expect(workflow).toContain('-not $probe.pcResources.passed');
  expect(workflow).toContain(
    'measure-windows-performance.ps1 -ExecutablePath artifacts/windows-installer-smoke/verified-app/babelleaf.exe -IsolatedProfile -Enforce',
  );
  expect(workflow).toContain('$idle.executableSha256 -ne $binaryHash');
  const driver = readFileSync(resolve(process.cwd(), 'scripts/packaged-pc-workflows.mjs'), 'utf8');
  expect(driver).not.toContain('__TAURI_INTERNALS__.invoke =');
  expect(driver).toContain('manualComicPending: !full');
  expect(driver).toContain("'full-native-dialogs'");
});

test('uses only an owned loopback fixture without enabling automatic translation or new windows', () => {
  const settings = makePackagedPcSettings('http://127.0.0.1:12345');
  expect(settings).toMatchObject({
    openBookInNewWindow: false,
    openLastBooks: false,
    aiSettings: { provider: 'ollama', ollamaBaseUrl: 'http://127.0.0.1:12345' },
    globalViewSettings: { translationEnabled: false, translationProvider: 'ollama' },
  });
  expect(JSON.stringify(settings)).not.toMatch(/ApiKey|https:|secret/i);
  expect(() => makePackagedPcSettings('https://example.invalid')).toThrow();
});

test('the acceptance fixture listens only on loopback and records no credentials or content', async () => {
  const fixture = await startPackagedOllamaFixture();
  try {
    expect(fixture.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(fixture.requests).toEqual([]);
    const response = await fetch(fixture.baseUrl + '/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: 'babelleaf-acceptance',
        messages: [{ role: 'user', content: 'Synthetic acceptance paragraph.' }],
        stream: false,
      }),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.message.content).toContain('本地验收译文');
    expect(result.done_reason).toBe('stop');
    expect(fixture.requests).toEqual([
      expect.objectContaining({ path: '/api/chat', method: 'POST', model: 'babelleaf-acceptance' }),
    ]);
    expect(JSON.stringify(fixture.requests)).not.toContain('Synthetic acceptance paragraph.');
    const rejected = await fetch(fixture.baseUrl + '/unexpected');
    expect(rejected.status).toBe(404);
  } finally {
    await fixture.close();
  }
});
