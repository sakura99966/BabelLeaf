import { describe, expect, test, vi } from 'vitest';
import type { FileSystem } from '@/types/system';
import {
  createTranslationArtifact,
  getTranslationArtifactPath,
  parseTranslationArtifact,
  serializeTranslationArtifact,
  TRANSLATION_ARTIFACT_BASE,
  TranslationArtifactStore,
  reviewTranslationSegment,
  revertTranslationSegment,
  upsertTranslationSegments,
} from '@/services/translators/artifacts';

const makeArtifact = () =>
  createTranslationArtifact({
    bookHash: 'book/one',
    provider: 'deepseek',
    promptVersion: 'translation-v1',
    sourceLang: 'en',
    targetLang: 'zh-CN',
  });

const makeFileSystem = () => {
  const files = new Map<string, string>();
  const key = (path: string, base: string) => `${base}/${path}`;
  const fs = {
    createDir: vi.fn(async () => undefined),
    writeFile: vi.fn(async (path: string, base: string, content: string) => {
      files.set(key(path, base), content);
    }),
    readFile: vi.fn(async (path: string, base: string) => {
      const value = files.get(key(path, base));
      if (value === undefined) throw new Error('not found');
      return value;
    }),
    exists: vi.fn(async (path: string, base: string) => files.has(key(path, base))),
    removeFile: vi.fn(async (path: string, base: string) => {
      files.delete(key(path, base));
    }),
  } as unknown as FileSystem;
  return { files, fs };
};

describe('translation artifacts', () => {
  test.each([
    'journal-backup',
    'journal-main',
    'primary-backup',
    'primary-main',
    'cleanup-backup',
    'cleanup-main',
  ])('preserves recoverable data after a %s failure', async (stage) => {
    const { fs, files } = makeFileSystem();
    const artifact = makeArtifact();
    const store = new TranslationArtifactStore(fs);
    await store.save(artifact);
    const filename = getTranslationArtifactPath(artifact);
    const targets: Record<string, string> = {
      'journal-backup': `${filename}.pending.bak`,
      'journal-main': `${filename}.pending`,
      'primary-backup': `${filename}.bak`,
      'primary-main': filename,
      'cleanup-backup': `${filename}.pending.bak`,
      'cleanup-main': `${filename}.pending`,
    };
    let fail = true;
    vi.mocked(fs.writeFile).mockImplementation(async (name, base, content) => {
      if (fail && !stage.startsWith('cleanup') && name === targets[stage])
        throw new Error('injected storage failure');
      files.set(`${base}/${name}`, String(content));
    });
    vi.mocked(fs.removeFile!).mockImplementation(async (name, base) => {
      if (fail && stage.startsWith('cleanup') && name === targets[stage])
        throw new Error('injected cleanup failure');
      files.delete(`${base}/${name}`);
    });
    const updated = upsertTranslationSegments(
      artifact,
      [
        {
          id: 'one',
          sourceText: 'Hello',
          translatedText: 'new result',
          sourceLang: 'en',
          targetLang: 'zh-CN',
          status: 'translated',
          updatedAt: 1,
        },
      ],
      1,
    );
    await expect(store.save(updated)).rejects.toThrow();
    fail = false;
    const recovered = await new TranslationArtifactStore(fs).load(artifact);
    expect(recovered?.segments).toHaveLength(stage === 'journal-backup' ? 0 : 1);
    expect([...files.keys()].filter((key) => key.includes('.pending'))).toEqual([]);
  });

  test('merges independent results into the journal while primary writes keep failing', async () => {
    const { fs, files } = makeFileSystem();
    const artifact = makeArtifact();
    const store = new TranslationArtifactStore(fs);
    await store.save(artifact);
    const filename = getTranslationArtifactPath(artifact);
    let fail = true;
    vi.mocked(fs.writeFile).mockImplementation(async (name, base, content) => {
      if (fail && name === filename) throw new Error('primary denied');
      files.set(`${base}/${name}`, String(content));
    });
    const results = await Promise.allSettled(
      ['one', 'two'].map((id) =>
        new TranslationArtifactStore(fs).save(
          upsertTranslationSegments(
            artifact,
            [
              {
                id,
                sourceText: id,
                translatedText: `result-${id}`,
                sourceLang: 'en',
                targetLang: 'zh-CN',
                status: 'translated',
                updatedAt: 1,
              },
            ],
            1,
          ),
        ),
      ),
    );
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    fail = false;
    expect(
      (await new TranslationArtifactStore(fs).load(artifact))?.segments
        .map((segment) => segment.id)
        .sort(),
    ).toEqual(['one', 'two']);
  });
  test('recovers a durable pending translation in a fresh store after the primary save failed', async () => {
    const { fs, files } = makeFileSystem();
    const store = new TranslationArtifactStore(fs);
    const artifact = makeArtifact();
    await store.save(artifact);
    const filename = getTranslationArtifactPath(artifact);
    let fail = true;
    vi.mocked(fs.writeFile).mockImplementation(async (name, base, content) => {
      if (fail && name === filename) throw new Error('primary replacement failed');
      files.set(`${base}/${name}`, String(content));
    });
    const updated = upsertTranslationSegments(
      artifact,
      [
        {
          id: 'recovered',
          sourceText: 'Hello',
          translatedText: 'paid result',
          sourceLang: 'en',
          targetLang: 'zh-CN',
          status: 'translated',
          updatedAt: 2,
        },
      ],
      2,
    );
    await expect(store.save(updated)).rejects.toThrow();
    fail = false;
    const recovered = await new TranslationArtifactStore(fs).load(artifact);
    expect(recovered?.segments[0]?.translatedText).toBe('paid result');
    expect([...files.keys()].filter((key) => key.includes('.pending'))).toEqual([]);
  });
  test('rejects a stale model or prompt generation instead of replacing the committed document', async () => {
    const { fs } = makeFileSystem();
    const store = new TranslationArtifactStore(fs);
    const artifact = { ...makeArtifact(), model: 'current-model' };
    await store.save(artifact);
    await expect(store.save({ ...artifact, model: 'old-model' })).rejects.toThrow(/context/i);
    await expect(store.save({ ...artifact, promptVersion: 'old-prompt' })).rejects.toThrow(
      /context/i,
    );
    expect((await store.load(artifact))?.model).toBe('current-model');
  });

  test('does not load an artifact belonging to a colliding sanitized book identifier', async () => {
    const { fs } = makeFileSystem();
    const store = new TranslationArtifactStore(fs);
    const artifact = makeArtifact();
    await store.save(artifact);
    await expect(store.load({ ...artifact, bookHash: 'book_one' })).rejects.toThrow(/identity/i);
  });
  test('orders removal after an already-running save without resurrecting deleted copies', async () => {
    const { fs, files } = makeFileSystem();
    const store = new TranslationArtifactStore(fs);
    const artifact = makeArtifact();
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(fs.writeFile).mockImplementation(async (filename, base, content) => {
      if (filename === getTranslationArtifactPath(artifact)) {
        entered();
        await blocked;
      }
      files.set(`${base}/${filename}`, String(content));
    });
    const saving = store.save(artifact);
    await started;
    const removing = store.remove(artifact);
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    await Promise.all([saving, removing]);
    expect([...files.keys()]).toEqual([]);
  });
  test('rejects divergent same-timestamp edits without overwriting the committed translation', async () => {
    const { fs } = makeFileSystem();
    const store = new TranslationArtifactStore(fs);
    const first = upsertTranslationSegments(
      makeArtifact(),
      [
        {
          id: 'one',
          sourceText: 'Hello',
          translatedText: 'first',
          sourceLang: 'en',
          targetLang: 'zh-CN',
          status: 'translated',
          updatedAt: 10,
        },
      ],
      10,
    );
    await store.save(first);
    await expect(
      store.save({ ...first, segments: [{ ...first.segments[0]!, translatedText: 'other' }] }),
    ).rejects.toThrow(/conflict/i);
    expect((await store.load(first))?.segments[0]?.translatedText).toBe('first');
  });

  test('uses a monotonic edit timestamp when the clock repeats or moves backward', () => {
    const first = upsertTranslationSegments(
      makeArtifact(),
      [
        {
          id: 'one',
          sourceText: 'Hello',
          translatedText: 'first',
          sourceLang: 'en',
          targetLang: 'zh-CN',
          status: 'translated',
          updatedAt: 10,
        },
      ],
      10,
    );
    const revised = reviewTranslationSegment(first, 'one', 'edited', 10);
    expect(revised.segments[0]!.updatedAt).toBeGreaterThan(first.segments[0]!.updatedAt);
    expect(revised.updatedAt).toBeGreaterThanOrEqual(revised.segments[0]!.updatedAt);
  });
  test('counts nested anchor text toward the cumulative resource budget', () => {
    const locator = 'x'.repeat(1_048_576);
    const segments = Array.from({ length: 32 }, (_, index) => ({
      id: `${index}`,
      sourceText: 'hello',
      sourceLang: 'en',
      targetLang: 'zh',
      status: 'translated',
      updatedAt: 1,
      sourceAnchor: {
        schemaVersion: 1,
        sectionIndex: 0,
        blockIndex: index,
        chunkIndex: 0,
        textHash: '12345678',
        textLength: 5,
        sourceLocator: locator,
      },
    }));
    expect(() => parseTranslationArtifact({ ...makeArtifact(), segments })).toThrow(/limit/);
  });

  test('rejects oversized segment collections before parsing entries', () => {
    expect(() =>
      parseTranslationArtifact({ ...makeArtifact(), segments: new Array(100_001) }),
    ).toThrow('limit');
  });

  test('rejects duplicate segment identifiers instead of silently dropping text during merge', () => {
    const segment = {
      id: 'same',
      sourceText: 'first',
      sourceLang: 'en',
      targetLang: 'zh',
      status: 'translated',
      updatedAt: 1,
    };
    expect(() =>
      parseTranslationArtifact({
        ...makeArtifact(),
        segments: [segment, { ...segment, sourceText: 'second' }],
      }),
    ).toThrow('Duplicate');
  });

  test('rejects oversized translation text', () => {
    const segment = {
      id: 'one',
      sourceText: 'first',
      translatedText: 'x'.repeat(1_048_577),
      sourceLang: 'en',
      targetLang: 'zh',
      status: 'translated',
      updatedAt: 1,
    };
    expect(() => parseTranslationArtifact({ ...makeArtifact(), segments: [segment] })).toThrow(
      'limit',
    );
  });
  test('merges independent snapshots without losing newer segment corrections', async () => {
    const { fs } = makeFileSystem();
    const store = new TranslationArtifactStore(fs);
    const artifact = makeArtifact();
    const segment = {
      id: 'one',
      sourceText: 'Hello',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      status: 'translated' as const,
      translatedText: '你好',
      updatedAt: 1,
    };
    await store.save(upsertTranslationSegments(artifact, [segment], 1));
    await Promise.all([
      store.save(
        upsertTranslationSegments(
          artifact,
          [{ ...segment, translatedText: '您好', updatedAt: 3 }],
          3,
        ),
      ),
      store.save(
        upsertTranslationSegments(
          artifact,
          [segment, { ...segment, id: 'two', sourceText: 'World' }],
          2,
        ),
      ),
    ]);
    const saved = await store.load(artifact);
    expect(saved?.segments).toHaveLength(2);
    expect(saved?.segments.find((entry) => entry.id === 'one')?.translatedText).toBe('您好');
  });
  test('serializes and validates a versioned artifact while ignoring unknown fields', () => {
    const artifact = makeArtifact();
    const parsed = parseTranslationArtifact({
      ...JSON.parse(serializeTranslationArtifact(artifact)),
      apiKey: 'must-not-be-stored',
    });

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.segments).toEqual([]);
    expect(parsed).not.toHaveProperty('apiKey');
    expect(
      getTranslationArtifactPath({
        bookHash: 'book/one',
        provider: 'deepseek',
        targetLang: 'zh-CN',
      }),
    ).toBe('translation-artifacts/book_one.deepseek.zh-CN.json');
  });

  test('upserts translated segments without replacing source text', () => {
    const artifact = makeArtifact();
    const first = {
      id: 'chapter-1:0',
      sourceText: 'Hello',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      status: 'translated' as const,
      translatedText: '你好',
      updatedAt: 1,
    };
    const updated = upsertTranslationSegments(artifact, [first], 2);
    expect(updated.segments[0]).toMatchObject({ sourceText: 'Hello', translatedText: '你好' });

    const reviewed = upsertTranslationSegments(
      updated,
      [{ ...first, translatedText: '您好', status: 'reviewed' }],
      3,
    );
    expect(reviewed.segments[0]).toMatchObject({
      sourceText: 'Hello',
      translatedText: '您好',
      status: 'reviewed',
    });

    expect(() =>
      upsertTranslationSegments(reviewed, [{ ...first, sourceText: 'Changed' }], 4),
    ).toThrow('source changed');
  });

  test('stores artifacts under durable Data and recovers through the safe JSON path', async () => {
    const { files, fs } = makeFileSystem();
    const store = new TranslationArtifactStore(fs);
    const artifact = makeArtifact();

    await store.save(artifact);
    const path = getTranslationArtifactPath(artifact);
    expect(fs.createDir).toHaveBeenCalledWith(
      'translation-artifacts',
      TRANSLATION_ARTIFACT_BASE,
      true,
    );
    expect(files.has(`${TRANSLATION_ARTIFACT_BASE}/${path}`)).toBe(true);
    expect(files.has(`${TRANSLATION_ARTIFACT_BASE}/${path}.bak`)).toBe(true);
    await expect(store.load(artifact)).resolves.toMatchObject({ bookHash: 'book/one' });

    files.set(`${TRANSLATION_ARTIFACT_BASE}/${path}`, '{broken');
    await expect(store.load(artifact)).resolves.toMatchObject({ bookHash: 'book/one' });
    await store.remove(artifact);
    expect(files.has(`${TRANSLATION_ARTIFACT_BASE}/${path}`)).toBe(false);
    expect(files.has(`${TRANSLATION_ARTIFACT_BASE}/${path}.bak`)).toBe(false);
  });

  test('migrates a 0.2.1 Cache artifact into durable Data storage', async () => {
    const { files, fs } = makeFileSystem();
    const store = new TranslationArtifactStore(fs);
    const artifact = makeArtifact();
    const path = getTranslationArtifactPath(artifact);
    files.set(`Cache/${path}`, serializeTranslationArtifact(artifact));

    await expect(store.load(artifact)).resolves.toMatchObject({ bookHash: 'book/one' });
    expect(files.has(`${TRANSLATION_ARTIFACT_BASE}/${path}`)).toBe(true);
    expect(files.has(`Cache/${path}`)).toBe(false);
  });

  test('rejects unsupported schema versions', () => {
    expect(() => parseTranslationArtifact({ schemaVersion: 99 })).toThrow('Unsupported');
  });

  test('retains machine output while saving and reverting a human review', () => {
    const artifact = upsertTranslationSegments(
      makeArtifact(),
      [
        {
          id: 'segment-1',
          sourceText: 'Hello',
          sourceLang: 'en',
          targetLang: 'zh-CN',
          status: 'translated',
          translatedText: '你好',
          updatedAt: 1,
        },
      ],
      1,
    );
    const reviewed = reviewTranslationSegment(artifact, 'segment-1', '您好', 2);
    expect(reviewed.segments[0]).toMatchObject({
      translatedText: '您好',
      machineTranslatedText: '你好',
      status: 'reviewed',
    });
    expect(revertTranslationSegment(reviewed, 'segment-1', 3).segments[0]).toMatchObject({
      translatedText: '你好',
      status: 'translated',
    });
  });
});
