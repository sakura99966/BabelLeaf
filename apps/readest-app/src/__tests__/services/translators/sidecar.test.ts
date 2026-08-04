import { describe, expect, test } from 'vitest';
import {
  createTranslationArtifact,
  upsertTranslationSegments,
} from '@/services/translators/artifacts';
import {
  createTranslationSidecar,
  parseTranslationSidecar,
  serializeTranslationSidecar,
  translationSidecarToArtifact,
} from '@/services/translators/sidecar';
import {
  toBilingualTranslationResult,
  toTranslationReviewPairs,
} from '@/services/translators/bilingual';

const makeArtifact = () =>
  createTranslationArtifact({
    bookHash: 'book-hash',
    sourceFingerprint: 'source-v1',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    promptVersion: 'translation-v1',
    sourceLang: 'en',
    targetLang: 'zh-CN',
    glossaryVersion: 12,
    segments: [
      {
        id: 'chapter-1:0',
        sourceText: 'Hello',
        translatedText: '你好',
        sourceLang: 'en',
        targetLang: 'zh-CN',
        status: 'translated',
        chapterId: 'chapter-1',
        updatedAt: 10,
      },
      {
        id: 'chapter-1:1',
        sourceText: 'Pending',
        sourceLang: 'en',
        targetLang: 'zh-CN',
        status: 'pending',
        updatedAt: 10,
      },
    ],
  });

describe('translation sidecar and bilingual models', () => {
  test('round-trips a portable sidecar and drops unknown credential fields', () => {
    const artifact = makeArtifact();
    expect(createTranslationSidecar(artifact).format).toBe('babelleaf.translation-sidecar');
    const parsed = parseTranslationSidecar({
      ...JSON.parse(serializeTranslationSidecar(artifact)),
      apiKey: 'must-not-be-imported',
    });

    expect(parsed.format).toBe('babelleaf.translation-sidecar');
    expect(parsed.bookHash).toBe('book-hash');
    expect(parsed.segments).toHaveLength(2);
    expect(parsed).not.toHaveProperty('apiKey');
    expect(translationSidecarToArtifact(parsed)).toMatchObject({
      provider: 'deepseek',
      sourceFingerprint: 'source-v1',
      glossaryVersion: 12,
    });
  });

  test('rejects files from another format or unsupported version', () => {
    expect(() => parseTranslationSidecar({ format: 'other', schemaVersion: 1 })).toThrow(
      'Unsupported',
    );
    expect(() =>
      parseTranslationSidecar({
        format: 'babelleaf.translation-sidecar',
        schemaVersion: 99,
      }),
    ).toThrow('Unsupported');
  });

  test('creates ordered bilingual pairs from completed segments only', () => {
    const artifact = upsertTranslationSegments(
      makeArtifact(),
      [
        {
          id: 'chapter-1:2',
          sourceText: 'Reviewed',
          translatedText: '已校订',
          sourceLang: 'en',
          targetLang: 'zh-CN',
          status: 'reviewed',
          updatedAt: 11,
        },
      ],
      12,
    );
    const result = toBilingualTranslationResult(artifact);

    expect(result.pairs.map((pair) => pair.id)).toEqual(['chapter-1:0', 'chapter-1:2']);
    expect(result.pairs[0]).toMatchObject({ sourceText: 'Hello', translatedText: '你好' });
    expect(result.pairs[1]).toMatchObject({ status: 'reviewed' });
  });

  test('exposes pending, failed, and reviewed segments to the review workspace', () => {
    const pairs = toTranslationReviewPairs(makeArtifact());
    expect(pairs).toHaveLength(2);
    expect(pairs[1]).toMatchObject({ status: 'pending', translatedText: '', glossaryVersion: 12 });
    expect(pairs[0]).toMatchObject({ provider: 'deepseek', model: 'deepseek-v4-flash' });
  });
});
