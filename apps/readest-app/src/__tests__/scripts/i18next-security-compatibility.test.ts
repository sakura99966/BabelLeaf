import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

// Run the real installed packages in disposable processes: a regression must
// never corrupt the test runner's own Object.prototype or localization state.
function isolated(code: string) {
  return execFileSync(process.execPath, ['-e', code], {
    cwd: appRoot,
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
}

test.each([
  'hasOwnProperty',
  'toString',
  'valueOf',
])('deep resource merges cannot corrupt inherited built-in %s (GHSA-6jcc-5g8w-32mx)', (name) => {
  expect(
    isolated(`
        const assert = require('node:assert/strict');
        const { createInstance } = require('i18next');
        (async () => {
          const instance = createInstance();
          await instance.init({ lng: 'en', fallbackLng: false,
            resources: { en: { translation: { ordinary: { before: 'safe' } } } } });
          const name = ${JSON.stringify(name)};
          const builtin = Object.prototype[name];
          const originalCall = builtin.call;
          instance.addResourceBundle('en', 'translation', {
            [name]: { call: 'corrupted' }, ordinary: { after: 'safe' }
          }, true, true);
          assert.equal(Object.prototype[name], builtin);
          assert.equal(builtin.call, originalCall);
          assert.equal(typeof builtin.call, 'function');
          assert.equal(instance.t('ordinary.before'), 'safe');
          assert.equal(instance.t('ordinary.after'), 'safe');
          console.log('PASS');
        })().catch(error => { console.error(error); process.exitCode = 1; });
      `),
  ).toContain('PASS');
});

test('preserves shipped Chinese/Japanese flat keys, interpolation and English fallback', () => {
  expect(
    isolated(`
      const assert = require('node:assert/strict');
      const { createInstance } = require('i18next');
      const fs = require('node:fs');
      (async () => {
        const resources = {};
        for (const lng of ['zh-CN', 'zh-TW', 'ja']) {
          resources[lng] = { translation: JSON.parse(fs.readFileSync(
            'public/locales/' + lng + '/translation.json', 'utf8')) };
        }
        const instance = createInstance();
        await instance.init({ lng: 'zh-CN', resources,
          supportedLngs: ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ja'],
          fallbackLng: { 'zh-HK': ['zh-TW', 'en'], default: ['en'] },
          keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
        for (const lng of ['zh-CN', 'ja']) {
          await instance.changeLanguage(lng);
          assert.equal(instance.t('Cancel'), resources[lng].translation.Cancel);
          assert.notEqual(instance.t('Cancel'), 'Cancel');
          assert.equal(instance.t('Loading...'), resources[lng].translation['Loading...']);
          assert.equal(instance.t('Version {{version}}', { version: '0.4.6' }),
            resources[lng].translation['Version {{version}}'].replace('{{version}}', '0.4.6'));
          assert.equal(instance.t('Missing English source', { defaultValue: 'Missing English source' }),
            'Missing English source');
        }
        await instance.changeLanguage('zh-HK');
        assert.equal(instance.t('Cancel'), resources['zh-TW'].translation.Cancel);
        await instance.changeLanguage('en');
        assert.equal(instance.t('Cancel', { defaultValue: 'Cancel' }), 'Cancel');
        console.log('PASS');
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `),
  ).toContain('PASS');
});

test('keeps the existing extraction parser compatible without rewriting locale files', () => {
  expect(
    isolated(`
      const assert = require('node:assert/strict');
      const { Parser } = require('i18next-scanner');
      const { options } = require('./i18next-scanner.config.cjs');
      const parser = new Parser({ ...options, lngs: ['en', 'zh-CN', 'ja'],
        resource: { ...options.resource, loadPath: () => '' } });
      parser.parseFuncFromString("_('Cancel'); _('Loading...'); _('Version {{version}}');");
      const result = parser.get();
      for (const lng of ['en', 'zh-CN', 'ja']) {
        assert.equal(result[lng].translation.Cancel, '__STRING_NOT_TRANSLATED__');
        assert.equal(result[lng].translation['Loading...'], '__STRING_NOT_TRANSLATED__');
        assert.equal(result[lng].translation['Version {{version}}'], '__STRING_NOT_TRANSLATED__');
      }
      console.log('PASS');
    `),
  ).toContain('PASS');
});
