// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// GHSA-mrhx-c7xc-m3w5: use small inputs to exercise the upstream resource guard
// without deliberately exhausting the test host's memory.
describe('installed Zod collection resource bounds', () => {
  it('rejects an oversized array before running element transforms', () => {
    let parsed = 0;
    const item = z.string().transform((value) => {
      parsed += 1;
      return value;
    });
    const result = z
      .array(item)
      .max(2)
      .safeParse(Array.from({ length: 16 }, () => 'text'));
    expect(result.success).toBe(false);
    expect(parsed).toBe(0);
    expect(result.error?.issues.map((issue) => issue.code)).toEqual(['too_big']);
  });

  it('does not accumulate one issue per invalid element in a nested oversized array', () => {
    const schema = z.object({ items: z.array(z.string()).max(2) });
    const result = schema.safeParse({ items: Array.from({ length: 16 }, (_, index) => index) });
    expect(result.error?.issues.map((issue) => ({ code: issue.code, path: issue.path }))).toEqual([
      { code: 'too_big', path: ['items'] },
    ]);
  });

  it('rejects oversized sets without accumulating element errors', () => {
    const input = new Set(Array.from({ length: 16 }, (_, index) => index));
    const result = z.set(z.string()).max(2).safeParse(input);
    expect(result.error?.issues.map((issue) => issue.code)).toEqual(['too_big']);
  });

  it('rejects oversized maps without accumulating key and value errors', () => {
    const input = new Map(Array.from({ length: 16 }, (_, index) => [index, index]));
    const result = z.map(z.string(), z.string()).max(2).safeParse(input);
    expect(result.error?.issues.map((issue) => issue.code)).toEqual(['too_big']);
  });

  it('retains valid collections and explicitly ordered normalization', () => {
    expect(z.array(z.string()).max(2).parse(['first', 'second'])).toEqual(['first', 'second']);
    expect(
      z
        .array(z.number())
        .overwrite((values) => values.slice(0, 2))
        .max(2)
        .parse([1, 2, 3]),
    ).toEqual([1, 2]);
  });
});
