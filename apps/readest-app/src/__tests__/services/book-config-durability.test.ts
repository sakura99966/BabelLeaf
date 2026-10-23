import { expect, it, vi } from 'vitest';
import { loadBookConfig, saveBookConfig } from '@/services/bookService';
import { getConfigFilename } from '@/utils/book';
import type { Book, BookConfig, BookNote } from '@/types/book';
import type { SystemSettings } from '@/types/settings';
import type { FileSystem } from '@/types/system';
import { File as NodeFile } from 'node:buffer';
import { useBookConfigRecoveryStore } from '@/store/bookConfigRecoveryStore';

const book = { hash: 'configfixture', format: 'EPUB' } as Book;
const settings = { globalViewSettings: {} } as SystemSettings;
const path = getConfigFilename(book);
const config = (overrides: Partial<BookConfig> = {}): BookConfig => ({
  updatedAt: 1,
  viewSettings: {},
  searchConfig: {},
  booknotes: [],
  ...overrides,
});
const note = (id: string, updatedAt = 1): BookNote =>
  ({
    id,
    type: 'annotation',
    cfi: 'epubcfi(/6/2!/4/2)',
    text: 'Generated note',
    createdAt: 1,
    updatedAt,
  }) as BookNote;

function fixture(initial: Record<string, string | Uint8Array> = {}) {
  const files = new Map(Object.entries(initial));
  const read = (name: string) => {
    const data = files.get(name);
    if (data === undefined) throw new Error('File not found: ' + name);
    return data;
  };
  const write = async (name: string, _base: string, value: string | ArrayBuffer | File) => {
    files.set(
      name,
      typeof value === 'string' ? value : new Uint8Array(await new Response(value).arrayBuffer()),
    );
  };
  const fs = {
    exists: vi.fn(async (name: string) => files.has(name)),
    readFile: vi.fn(async (name: string) => {
      const data = read(name);
      return typeof data === 'string' ? data : data.slice().buffer;
    }),
    openFile: vi.fn(async (name: string) => new NodeFile([read(name)], name) as unknown as File),
    writeFile: vi.fn(write),
    writeFileAtomic: vi.fn(write),
  };
  return { files, fs: fs as unknown as FileSystem, rawFs: fs };
}

it('initializes only genuinely absent main and backup files', async () => {
  const { fs } = fixture();
  expect((await loadBookConfig(fs, book, settings)).booknotes ?? []).toEqual([]);
});

it('does not turn denied reads into an empty configuration', async () => {
  const { fs, rawFs } = fixture({ [path]: JSON.stringify(config({ booknotes: [note('one')] })) });
  rawFs.openFile.mockRejectedValue(new Error('access denied'));
  rawFs.readFile.mockRejectedValue(new Error('access denied'));
  await expect(loadBookConfig(fs, book, settings)).rejects.toThrow();
});

it.each([
  '',
  '{truncated',
  '{"booknotes":"not-an-array"}',
  '{"schemaVersion":999}',
])('does not reset invalid configurations (%s)', async (content) => {
  const { fs, rawFs, files } = fixture({ [path]: content });
  await expect(loadBookConfig(fs, book, settings)).rejects.toThrow();
  expect(files.get(path)).toBe(content);
  expect(rawFs.writeFile).not.toHaveBeenCalled();
  expect(rawFs.writeFileAtomic).not.toHaveBeenCalled();
});

it('uses atomic writes and retains the previous committed configuration', async () => {
  const old = JSON.stringify(config({ booknotes: [note('one')] }));
  const { fs, files, rawFs } = fixture({ [path]: old });
  await saveBookConfig(
    fs,
    book,
    config({ updatedAt: 2, location: 'next', booknotes: [note('one')] }),
  );
  expect(rawFs.writeFileAtomic).toHaveBeenCalled();
  expect(rawFs.writeFile).not.toHaveBeenCalled();
  expect(JSON.parse(String(files.get(path + '.bak'))).booknotes[0].id).toBe('one');
});

it.each([
  new TextEncoder().encode('{invalid'),
  new Uint8Array([0xff, 0xfe, 0x00]),
])('archives invalid original bytes before restoring a valid backup (%j)', async (bad) => {
  const old = JSON.stringify(config({ booknotes: [note('kept')] }));
  const { fs, files } = fixture({ [path]: bad, [path + '.bak']: old });
  expect((await loadBookConfig(fs, book, settings)).booknotes?.[0]?.id).toBe('kept');
  const invalid = files.get(path + '.invalid');
  expect(invalid).toBeInstanceOf(Uint8Array);
  expect(Array.from(invalid as Uint8Array)).toEqual(Array.from(bad));
  expect(JSON.parse(String(files.get(path))).booknotes[0].id).toBe('kept');
});

it('does not replace an occupied recovery slot or erase a second invalid original', async () => {
  const { fs, files } = fixture({
    [path]: '{second-invalid',
    [path + '.invalid']: '{first-invalid',
    [path + '.bak']: JSON.stringify(config({ booknotes: [note('kept')] })),
  });
  await expect(loadBookConfig(fs, book, settings)).rejects.toThrow(/recovery|invalid/i);
  expect(files.get(path)).toBe('{second-invalid');
  expect(files.get(path + '.invalid')).toBe('{first-invalid');
});

it('retains a visible recovery notice after safely restoring the backup', async () => {
  useBookConfigRecoveryStore.setState({ recovered: [] });
  const { fs } = fixture({
    [path]: '{invalid',
    [path + '.bak']: JSON.stringify(config({ booknotes: [note('recovered')] })),
  });
  await loadBookConfig(fs, book, settings);
  expect(useBookConfigRecoveryStore.getState().recovered).toContain(book.hash);
});

it('merges concurrent annotation snapshots instead of dropping the other window notes', async () => {
  const { fs } = fixture({ [path]: JSON.stringify(config()) });
  await Promise.all([
    saveBookConfig(fs, book, config({ updatedAt: 2, booknotes: [note('a')] })),
    saveBookConfig(fs, book, config({ updatedAt: 3, booknotes: [note('b')] })),
  ]);
  const loaded = await loadBookConfig(fs, book, settings);
  expect(loaded.booknotes?.map((item) => item.id).sort()).toEqual(['a', 'b']);
});

it('preserves deletion tombstones against stale windows', async () => {
  const deleted = { ...note('a'), deletedAt: 5 };
  const { fs } = fixture({
    [path]: JSON.stringify(config({ updatedAt: 5, booknotes: [deleted] })),
  });
  await saveBookConfig(fs, book, config({ updatedAt: 3, booknotes: [note('a'), note('b')] }));
  const loaded = await loadBookConfig(fs, book, settings);
  expect(loaded.booknotes?.find((item) => item.id === 'a')?.deletedAt).toBe(5);
  expect(loaded.booknotes?.find((item) => item.id === 'b')).toBeDefined();
});

it('retains legacy annotations with the same id but distinct types or locations', async () => {
  const notes = [
    note('shared'),
    { ...note('shared'), type: 'bookmark' as const },
    { ...note('shared'), cfi: 'epubcfi(/6/4!/4/2)' },
  ];
  const { fs } = fixture();
  await saveBookConfig(fs, book, config({ booknotes: notes }));
  expect((await loadBookConfig(fs, book, settings)).booknotes).toHaveLength(3);
});

it('moves a uniquely identified edited annotation without retaining a ghost range', async () => {
  const old = note('edited');
  const changed = { ...old, cfi: 'epubcfi(/6/4!/4/2)', updatedAt: 3 };
  const { fs } = fixture({ [path]: JSON.stringify(config({ booknotes: [old] })) });
  await saveBookConfig(fs, book, config({ updatedAt: 3, booknotes: [changed] }));
  const loaded = await loadBookConfig(fs, book, settings);
  expect(loaded.booknotes).toHaveLength(1);
  expect(loaded.booknotes?.[0]?.cfi).toBe(changed.cfi);
});

it('does not revive an existing deletion when an older open view later moves its range', async () => {
  const deleted = { ...note('edited'), deletedAt: 5, updatedAt: 5 };
  const moved = { ...note('edited', 7), cfi: 'epubcfi(/6/4!/4/2)' };
  const { fs } = fixture({
    [path]: JSON.stringify(config({ updatedAt: 5, booknotes: [deleted] })),
  });
  await saveBookConfig(fs, book, config({ updatedAt: 7, booknotes: [moved] }));
  const loaded = await loadBookConfig(fs, book, settings);
  expect(loaded.booknotes).toHaveLength(1);
  expect(loaded.booknotes?.[0]?.deletedAt).toBe(5);
});
