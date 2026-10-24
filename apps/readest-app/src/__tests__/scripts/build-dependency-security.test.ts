// @vitest-environment node

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Resolve the actual installed transitive build dependencies, not test doubles.
const requireBuild = createRequire(
  resolve(__dirname, '../../../../../node_modules/.pnpm/node_modules/security-regression.cjs'),
);
const uri = requireBuild('fast-uri') as {
  normalize(input: string, options?: { reference: 'suffix'; scheme?: string }): string;
  parse(input: string): { scheme?: string; error?: string };
  resolve(base: string, reference: string): string;
  equal(left: string, right: string): boolean;
};
const serialize = requireBuild('serialize-javascript') as (
  value: unknown,
  options?: { space: number },
) => string;

describe('installed build-dependency security fixes', () => {
  it('does not decode an encoded scheme into an executable URL', () => {
    for (const input of ['%6Aavascript:alert(1)', '%u006Aavascript:alert(1)']) {
      expect(uri.parse(input).scheme).not.toBe('javascript');
      expect(uri.normalize(input)).not.toMatch(/^javascript:/i);
      expect(() => uri.resolve('https://example.test/', input)).toThrow(/scheme is malformed/i);
    }
    expect(uri.equal('%68ttp://a/', 'http://a/')).toBe(false);
  });

  it.each([
    '../x',
    'a/../b',
  ])('preserves resolution when normalizing relative reference %s', (input) => {
    const base = 'https://example.test/directory/book';
    expect(uri.resolve(base, uri.normalize(input))).toBe(uri.resolve(base, input));
  });

  it.each([
    'http://a@b@evil.example/',
    'http://exa\tmple.test/',
    'http://exa\rmple.test/',
    'http://exa\nmple.test/',
  ])('reports an invalid authority instead of silently rewriting %j', (input) => {
    expect(uri.parse(input).error).toBeTruthy();
  });

  it('does not turn a suffix reference into a scheme-bearing URL', () => {
    // A suffix reference supplies its scheme separately; without that option,
    // the colon can instead be an invalid authority and is not this fix's path.
    const output = uri.normalize('javascript:alert(1)', { reference: 'suffix', scheme: 'x' });
    expect(uri.parse(output).scheme).toBeUndefined();
  });

  it('escapes a function source ending in a bare script-close prefix', () => {
    function first() {}
    first.toString = () => 'function first(){ return 1 }//</script';
    function second() {}
    second.toString = () => 'function second(){ return 2 } > <img src=probe>';
    const output = serialize({ nested: { first }, second }, { space: 2 });
    expect(output).not.toMatch(/<\/script(?:[\t\n\f\r />]|$)/i);
  });

  it('retains ordinary URL and JSON-compatible serialization behavior', () => {
    expect(uri.resolve('https://example.test/directory/book', 'page')).toBe(
      'https://example.test/directory/page',
    );
    expect(JSON.parse(serialize({ title: 'BabelLeaf', count: 2 }))).toEqual({
      title: 'BabelLeaf',
      count: 2,
    });
  });
});
