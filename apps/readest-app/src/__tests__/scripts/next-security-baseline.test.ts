// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('locks the installed Next.js build to the reviewed security patch', () => {
  const appManifest = resolve(__dirname, '../../../package.json');
  const fromApp = createRequire(appManifest);
  const { version } = JSON.parse(readFileSync(fromApp.resolve('next/package.json'), 'utf8')) as {
    version: string;
  };
  const { dependencies } = JSON.parse(readFileSync(appManifest, 'utf8')) as {
    dependencies: Record<string, string>;
  };
  expect([version, dependencies['next']]).toEqual(['16.4.5', '16.4.5']);
});
