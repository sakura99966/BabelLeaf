import { afterEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, promises as fs, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { zipSync } from 'fflate';

const appRequire = createRequire(resolve(__dirname, '../../../package.json'));
const tailwind = createRequire(appRequire.resolve('tailwindcss'));
const glob = createRequire(tailwind.resolve('fast-glob'));
const micromatch = createRequire(glob.resolve('micromatch'));
const braces = micromatch('braces') as {
  parse(pattern: string): unknown;
  compile(ast: unknown): string;
  expand(ast: unknown): string[];
  stringify(ast: unknown): string;
};
const cli = createRequire(appRequire.resolve('@wdio/cli'));
function manifestFrom(parent: NodeRequire, name: string) {
  for (const directory of parent.resolve.paths(name) ?? []) {
    const path = join(directory, name, 'package.json');
    if (existsSync(path)) return realpathSync(path);
  }
  throw new Error('Missing installed dependency: ' + name);
}
const utils = createRequire(manifestFrom(cli, '@wdio/utils'));
const puppeteer = createRequire(manifestFrom(utils, '@puppeteer/browsers'));
const extract = puppeteer('extract-zip') as (
  file: string,
  options: { dir: string },
) => Promise<void>;
const tempBase = resolve(__dirname, '../../../artifacts/remediation-0.4.6/package-tests');
const owned: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const path of owned.splice(0)) {
    const child = relative(tempBase, path);
    if (!child || child.startsWith('..') || isAbsolute(child))
      throw new Error('Unsafe test cleanup');
    const stat = await fs.lstat(path);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error('Unexpected fixture reparse target');
    await fs.rm(path, { recursive: true, force: true });
  }
});

it.each(['{', '('])('rejects excessive parsed nesting before recursive walkers (%s)', (open) => {
  const close = open === '{' ? '}' : ')';
  expect(() => braces.parse(open.repeat(512) + 'x' + close.repeat(512))).toThrow(/depth|nest/i);
});

it.each([
  'compile',
  'expand',
  'stringify',
] as const)('bounds caller-supplied ASTs in %s', (method) => {
  let ast: unknown = { type: 'text', value: 'x', nodes: [] };
  for (let i = 0; i < 512; i++) ast = { type: 'root', nodes: [ast] };
  expect(() => braces[method](ast)).toThrow(/depth|nest/i);
});

it('keeps ordinary brace expansion and glob compilation working', () => {
  expect(braces.expand(braces.parse('file.{ts,tsx}'))).toEqual(['file.ts', 'file.tsx']);
  expect(braces.compile(braces.parse('file.{ts,tsx}'))).toContain('ts|tsx');
});

async function archive(entries: Parameters<typeof zipSync>[0]) {
  await fs.mkdir(tempBase, { recursive: true });
  const root = await fs.mkdtemp(join(tempBase, 'extract-'));
  owned.push(root);
  const zip = join(root, 'fixture.zip');
  const dir = join(root, 'output');
  await fs.mkdir(dir);
  await fs.writeFile(zip, zipSync(entries));
  return { root, zip, dir };
}
const bytes = (value: string) => new TextEncoder().encode(value);
const symlinkEntry = (target: string): [Uint8Array, { os: number; attrs: number }] => [
  bytes(target),
  { os: 3, attrs: 0xa1ff << 16 },
];

it('rejects escaping symlink entries before calling the symlink API', async () => {
  // Mock only the symlink syscall: this red/green fixture never creates a real
  // link or writes outside its freshly generated, repository-owned directory.
  const symlink = vi.spyOn(fs, 'symlink').mockResolvedValue(undefined);
  const { zip, dir } = await archive({ link: symlinkEntry('../owned-outside') });
  await expect(extract(zip, { dir })).rejects.toThrow(/bound|outside|symlink/i);
  expect(symlink).not.toHaveBeenCalled();
});

it('preserves safe intra-archive symbolic links used by normal browser bundles', async () => {
  const symlink = vi.spyOn(fs, 'symlink').mockResolvedValue(undefined);
  const { zip, dir } = await archive({
    'payload.txt': bytes('owned fixture'),
    link: symlinkEntry('payload.txt'),
  });
  await extract(zip, { dir });
  expect(symlink).toHaveBeenCalledWith('payload.txt', join(dir, 'link'));
});

it('rejects an existing symbolic-link destination instead of truncating its target', async () => {
  const { zip, dir } = await archive({ 'payload.txt': bytes('new owned bytes') });
  const dest = join(dir, 'payload.txt');
  await fs.writeFile(dest, 'original owned bytes');
  const lstat = fs.lstat.bind(fs);
  vi.spyOn(fs, 'lstat').mockImplementation((async (path: Parameters<typeof fs.lstat>[0]) => {
    if (String(path) === dest) return { isSymbolicLink: () => true };
    return lstat(path);
  }) as typeof fs.lstat);
  await expect(extract(zip, { dir })).rejects.toThrow(/symlink/i);
  expect(await fs.readFile(dest, 'utf8')).toBe('original owned bytes');
});

it('validates existing parent aliases before creating any descendant directory', async () => {
  const { root, zip, dir } = await archive({ 'alias/new/payload.txt': bytes('owned') });
  const alias = join(dir, 'alias');
  await fs.mkdir(alias);
  const realpath = fs.realpath.bind(fs);
  vi.spyOn(fs, 'realpath').mockImplementation((async (path: Parameters<typeof fs.realpath>[0]) => {
    if (String(path).startsWith(alias)) return join(root, 'owned-outside');
    return realpath(path);
  }) as typeof fs.realpath);
  const mkdir = vi.spyOn(fs, 'mkdir');
  await expect(extract(zip, { dir })).rejects.toThrow(/bound|outside/i);
  expect(mkdir).not.toHaveBeenCalledWith(join(alias, 'new'), expect.anything());
});

it('extracts normal files and replaces only owned regular destinations', async () => {
  const { zip, dir } = await archive({ 'payload.txt': bytes('new owned bytes') });
  await fs.writeFile(join(dir, 'payload.txt'), 'old owned bytes');
  await extract(zip, { dir });
  expect(await fs.readFile(join(dir, 'payload.txt'), 'utf8')).toBe('new owned bytes');
});
