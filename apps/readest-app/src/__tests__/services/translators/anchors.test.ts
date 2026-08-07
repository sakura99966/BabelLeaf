import { describe, expect, test } from 'vitest';
import {
  createTranslationSourceAnchor,
  hashAnchorText,
  parseTranslationSourceAnchor,
  resolveTranslationSourceAnchor,
} from '@/services/translators';

describe('translation source anchors', () => {
  test('resolves independently of whitespace and layout changes', () => {
    const anchor = createTranslationSourceAnchor({
      sectionIndex: 3,
      blockIndex: 5,
      chunkIndex: 1,
      sourceText: '  A quiet  chapter\nwith Japanese 日本語. ',
      contextText: 'A quiet chapter with Japanese 日本語.',
      sourceLocator: 'epubcfi(/6/8)',
    });

    expect(anchor).toMatchObject({
      schemaVersion: 1,
      sectionIndex: 3,
      blockIndex: 5,
      chunkIndex: 1,
      sourceLocator: 'epubcfi(/6/8)',
      textLength: 'A quiet chapter with Japanese 日本語.'.length,
    });
    expect(
      resolveTranslationSourceAnchor(anchor, 'A quiet chapter with Japanese 日本語.'),
    ).toMatchObject({
      confidence: 'exact',
      sectionIndex: 3,
      blockIndex: 5,
    });
    expect(
      resolveTranslationSourceAnchor(anchor, 'A quiet  chapter\nwith Japanese 日本語.'),
    ).toMatchObject({
      confidence: 'normalized',
    });
    expect(resolveTranslationSourceAnchor(anchor, 'A different paragraph')).toBeNull();
    expect(parseTranslationSourceAnchor(anchor)).toEqual(anchor);
    expect(hashAnchorText('A quiet chapter with Japanese 日本語.')).toBe(anchor.textHash);
  });

  test('rejects malformed anchors at the trust boundary', () => {
    expect(() => parseTranslationSourceAnchor({ schemaVersion: 1 })).toThrow(
      'Invalid translation anchor',
    );
    expect(() =>
      parseTranslationSourceAnchor({
        schemaVersion: 1,
        sectionIndex: 0,
        blockIndex: 0,
        chunkIndex: 0,
        textHash: 'x',
        textLength: -1,
      }),
    ).toThrow('textLength');
  });
});
