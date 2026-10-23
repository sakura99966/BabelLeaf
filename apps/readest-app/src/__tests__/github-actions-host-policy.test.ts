import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('keeps PR browser/native tooling on the qualified Ubuntu LTS instead of a moving OS alias', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '../../.github/workflows/pull-request.yml'),
    'utf8',
  );
  expect(workflow).not.toContain('runs-on: ubuntu-latest');
  expect(workflow).toContain('runs-on: ubuntu-24.04');
  expect(workflow).toContain('install Playwright Chromium');
  expect(workflow).toContain('run browser-backed application tests');
});
