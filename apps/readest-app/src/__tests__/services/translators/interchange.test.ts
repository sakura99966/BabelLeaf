import { describe, expect, test } from 'vitest';
import {
  createTranslationArtifact,
  createTranslationGlossary,
  createTranslationSourceAnchor,
  getTranslationInterchangeFormat,
  parseGlossaryInterchange,
  parseMemoryInterchange,
  parseReviewInterchange,
  serializeGlossaryInterchange,
  serializeMemoryInterchange,
  serializeReviewInterchange,
  TranslationMemory,
} from '@/services/translators';

const glossary = createTranslationGlossary([
  {
    id: 'term-1',
    source: 'New\tYork',
    target: '纽约',
    sourceLang: 'en',
    targetLang: 'zh-CN',
    caseSensitive: true,
    enabled: true,
    notes: 'Keep as a proper noun.',
    updatedAt: 100,
  },
]);

const artifact = createTranslationArtifact({
  bookHash: 'book-1',
  provider: 'deepseek',
  model: 'deepseek-chat',
  promptVersion: 'translation-v1',
  sourceLang: 'en',
  targetLang: 'zh-CN',
  glossaryVersion: 100,
  sourceFingerprint: 'sha256:test',
  updatedAt: 200,
  segments: [
    {
      id: 'chapter-1:0',
      sourceText: 'Hello world.',
      translatedText: '你好，世界。',
      machineTranslatedText: '您好，世界。',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      status: 'reviewed',
      chapterId: 'chapter-1',
      sourceLocator: 'epubcfi(/6/2)',
      sourceAnchor: createTranslationSourceAnchor({
        sectionIndex: 0,
        blockIndex: 1,
        chunkIndex: 0,
        sourceText: 'Hello world.',
        sourceLocator: 'epubcfi(/6/2)',
      }),
      updatedAt: 200,
    },
  ],
});

describe('translation interchange', () => {
  test.each(['json', 'tsv', 'tbx'] as const)('round-trips glossary %s', (format) => {
    const parsed = parseGlossaryInterchange(serializeGlossaryInterchange(glossary, format), format);
    expect(parsed.entries).toEqual(glossary.entries);
  });

  test.each([
    'json',
    'tsv',
    'tmx',
  ] as const)('round-trips translation memory %s', async (format) => {
    const memory = new TranslationMemory();
    await memory.remember(
      {
        sourceText: 'Hello world.',
        sourceLang: 'en',
        targetLang: 'zh-CN',
        provider: 'deepseek',
        model: 'deepseek-chat',
        glossaryVersion: 100,
      },
      '你好，世界。',
    );
    const data = memory.snapshot();
    const parsed = parseMemoryInterchange(serializeMemoryInterchange(data, format), format);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({
      sourceText: 'Hello world.',
      translatedText: '你好，世界。',
      provider: 'deepseek',
      model: 'deepseek-chat',
      glossaryVersion: 100,
    });
  });

  test.each(['json', 'tsv', 'xliff'] as const)('round-trips review data %s', (format) => {
    const parsed = parseReviewInterchange(serializeReviewInterchange(artifact, format), format);
    expect(parsed).toMatchObject({
      bookHash: artifact.bookHash,
      provider: artifact.provider,
      sourceLang: artifact.sourceLang,
      targetLang: artifact.targetLang,
      glossaryVersion: artifact.glossaryVersion,
    });
    expect(parsed.segments[0]).toMatchObject({
      id: 'chapter-1:0',
      status: 'reviewed',
      sourceAnchor: artifact.segments[0]!.sourceAnchor,
    });
  });

  test('rejects hostile and unsupported interchange payloads', () => {
    expect(() => parseGlossaryInterchange('<!DOCTYPE foo>', 'tbx')).toThrow('doctype');
    expect(() =>
      parseMemoryInterchange('# BabelLeaf translation memory TSV v1\nkey\tsourceText', 'tsv'),
    ).toThrow('header');
    expect(getTranslationInterchangeFormat('file.tmx')).toBe('tmx');
    expect(getTranslationInterchangeFormat('file.TBX')).toBe('tbx');
    expect(getTranslationInterchangeFormat('file.xlf')).toBe('xliff');
  });
});
