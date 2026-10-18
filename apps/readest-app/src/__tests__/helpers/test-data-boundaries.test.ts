import { expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { ssmlText } from './ssmlText';
import { javascriptLiteral } from '../android/helpers/javascriptLiteral';

it('extracts SSML text with a real XML parser, including greater-than attributes and entities', () => {
  expect(ssmlText('<speak><s data-label="a>b">A &amp; B &lt; C</s></speak>')).toBe('A & B < C');
  expect(() => ssmlText('<speak><s>broken</speak>')).toThrow(/SSML/);
});

it('round-trips test data without leaving HTML-sensitive code delimiters in literals', () => {
  const value = { text: '</script><script>throw "executed"</script>&\u2028\u2029', quote: '"\\\n' };
  const source = javascriptLiteral(value);
  expect(source).not.toMatch(/[<>&/\u2028\u2029]/);
  expect(runInNewContext('(' + source + ')', {}, { timeout: 100 })).toEqual(value);
  expect(() => javascriptLiteral(undefined)).toThrow();
});
