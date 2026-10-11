import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { mkdir, remove, writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { NativeAppService } from '@/services/nativeAppService';
import { safeLoadJSON, updateJSON } from '@/services/persistence';
import { gzipSync, strToU8 } from 'fflate';
import { loadDictBody } from '@/services/dictionaries/dictZip';
import { NativeFile } from '@/utils/file';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { readSidecarInput } from '@/services/translators/sidecarInput';
import { fsTests } from './suites/fs-tests';
import { libraryTests } from './suites/library-tests';
import { bookTests } from './suites/book-tests';

async function getBookFile(name: string): Promise<string> {
  return await join(process.env['CWD']!, 'src/__tests__/fixtures/data', name);
}

const SANDBOX_DIR = process.env['BABELLEAF_NATIVE_TEST_ROOT'];
if (!SANDBOX_DIR) throw new Error('Native tests require an isolated test root');
let tmpCounter = 0;

describe('NativeAppService', () => {
  let tmpDir: string;
  let service: NativeAppService;

  beforeAll(async () => {
    await mkdir(SANDBOX_DIR, { recursive: true });
  });

  afterAll(async () => {
    await remove(SANDBOX_DIR, { recursive: true });
  });

  beforeEach(async () => {
    tmpCounter++;
    tmpDir = await join(SANDBOX_DIR, `tauri-${Date.now()}-${tmpCounter}`);
    await mkdir(tmpDir, { recursive: true });
    service = new NativeAppService(tmpDir);
    await service.init();
    // init() doesn't create base dirs; ensure Data and Books dirs exist
    await service.createDir('', 'Data', true);
    await service.createDir('', 'Books', true);
  });

  afterEach(async () => {
    await remove(tmpDir, { recursive: true });
  });

  it('should have localBooksDir set after init', () => {
    expect(service.localBooksDir).toBeTruthy();
    expect(service.localBooksDir.toLowerCase()).toContain('books');
  });

  it('should resolve file paths to absolute paths', async () => {
    const resolved = await service.resolveFilePath('test.json', 'Books');
    expect(resolved).toBeTruthy();
    expect(resolved).toContain('test.json');
    expect(resolved.toLowerCase()).toContain('books');
  });

  it('should have appPlatform set to tauri', () => {
    expect(service.appPlatform).toBe('tauri');
  });

  it('should write and read text via plugin wrapper', async () => {
    const filePath = await join(tmpDir, 'wrapper-test.txt');
    await writeTextFile(filePath, 'wrapper-write');
    const content = await readTextFile(filePath);
    expect(content).toBe('wrapper-write');
  });

  it('rejects an ungranted directory even when its name contains Readest', async () => {
    await expect(
      invoke('read_dir', {
        path: await join(process.env['CWD']!, 'Readest-not-granted'),
        recursive: true,
        extensions: ['*'],
      }),
    ).rejects.toContain('Permission denied');
  });

  it('atomically replaces native JSON without leaving temporary files', async () => {
    await service.writeFileAtomic('atomic.json', 'Data', '{"revision":1}');
    await service.writeFileAtomic('atomic.json', 'Data', '{"revision":2}');
    expect(await service.readFile('atomic.json', 'Data', 'text')).toBe('{"revision":2}');
    expect(
      (await service.readDirectory('', 'Data')).some((file) => file.path.endsWith('.tmp')),
    ).toBe(false);
  });

  it('preserves truncated native recovery copies instead of initializing over them', async () => {
    await service.writeFile('truncated.json', 'Data', '');
    await service.writeFile('truncated.json.bak', 'Data', '   ');
    await expect(
      safeLoadJSON(service, 'truncated.json', 'Data', null, (value) => value),
    ).rejects.toThrow('readable JSON');
    await expect(
      updateJSON(
        service,
        'truncated.json',
        'Data',
        () => ({ revision: 1 }),
        (value) => value,
      ),
    ).rejects.toThrow('readable JSON');
    expect(await service.readFile('truncated.json', 'Data', 'text')).toBe('');
    expect(await service.readFile('truncated.json.bak', 'Data', 'text')).toBe('   ');
  });

  it('reads bounded sidecar text through both native file adapters', async () => {
    await service.writeFile('sidecar.json', 'Data', '{"text":"日本語"}');
    const path = await service.resolveFilePath('sidecar.json', 'Data');
    const native = await new NativeFile(path).open();
    expect(await readSidecarInput(native, true)).toBe('{"text":"日本語"}');
    const routed = await service.openFile('sidecar.json', 'Data');
    expect(await readSidecarInput(routed, true)).toBe('{"text":"日本語"}');
    await service.deleteFile('sidecar.json', 'Data');
    expect(await service.exists('sidecar.json', 'Data')).toBe(false);
  });

  it('streams a real lazy native gzip file through the dictionary worker', async () => {
    const bytes = gzipSync(strToU8('native dictionary bytes'));
    await service.writeFile('worker.dict.gz', 'Data', bytes.buffer as ArrayBuffer);
    const file = await new NativeFile(
      await service.resolveFilePath('worker.dict.gz', 'Data'),
    ).open();
    try {
      const body = await loadDictBody(file);
      expect(new TextDecoder().decode(await body.read(0, 6))).toBe('native');
    } finally {
      await file.close();
    }
    // Windows would reject deletion if a worker-owned file handle leaked.
    await service.deleteFile('worker.dict.gz', 'Data');
    expect(await service.exists('worker.dict.gz', 'Data')).toBe(false);
  });

  it('serializes two native service instances and recovers the previous committed snapshot', async () => {
    const other = new NativeAppService(tmpDir);
    await other.init();
    const validate = (value: unknown): { count: number } => {
      if (
        !value ||
        typeof value !== 'object' ||
        !('count' in value) ||
        !Number.isSafeInteger(value.count)
      )
        throw new Error('Invalid counter');
      return value as { count: number };
    };
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        updateJSON(
          index % 2 ? service : other,
          'concurrent.json',
          'Data',
          (previous) => ({
            count: previous === null ? 1 : validate(previous).count + 1,
          }),
          validate,
        ),
      ),
    );
    expect(await safeLoadJSON(service, 'concurrent.json', 'Data', null, validate)).toEqual({
      count: 20,
    });
    await service.writeFileAtomic('concurrent.json', 'Data', 'corrupt');
    expect(await safeLoadJSON(other, 'concurrent.json', 'Data', null, validate)).toEqual({
      count: 19,
    });
  });

  it('coordinates distinct native WebViews and releases a lock after writer termination', async () => {
    const channelId = `persistence-${crypto.randomUUID()}`;
    const channel = new BroadcastChannel(channelId);
    const stages = new Set<string>();
    let failure: string | undefined;
    channel.onmessage = (event: MessageEvent<{ stage?: string; error?: string }>) => {
      if (event.data.stage) stages.add(event.data.stage);
      if (event.data.error) failure = event.data.error;
    };
    const waitFor = async (stage: string) => {
      const deadline = Date.now() + 15000;
      while (!stages.has(stage)) {
        if (failure) throw new Error(failure);
        if (Date.now() > deadline) throw new Error(`Native probe timed out: ${stage}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    const url = new URL('/src/__tests__/fixtures/native-persistence.html', location.href);
    url.searchParams.set('root', tmpDir);
    url.searchParams.set('channel', channelId);
    const child = new WebviewWindow(`reader-audit-${Date.now()}`, {
      url: url.href,
      visible: false,
      ...(await invoke<ConstructorParameters<typeof WebviewWindow>[1]>('get_webview_environment')),
    });
    await child.once('tauri://error', (event) => {
      failure = JSON.stringify(event.payload);
    });
    let destroyed = false;
    try {
      await waitFor('ready');
      channel.postMessage({ mode: 'increment' });
      for (let index = 0; index < 20; index++) {
        await updateJSON(service, 'multiwindow.json', 'Data', (value) => ({
          count: value === null ? 1 : (value as { count: number }).count + 1,
        }));
      }
      await waitFor('done');
      expect(await safeLoadJSON(service, 'multiwindow.json', 'Data', null)).toEqual({ count: 40 });
      channel.postMessage({ mode: 'interrupt' });
      await waitFor('before-main');
      await child.destroy();
      destroyed = true;
      expect(await safeLoadJSON(service, 'multiwindow.json', 'Data', null)).toEqual({ count: 40 });
      await service.writeFileAtomic('multiwindow.json', 'Data', 'corrupt');
      expect(await safeLoadJSON(service, 'multiwindow.json', 'Data', null)).toEqual({ count: 40 });
    } finally {
      channel.close();
      if (!destroyed) await child.destroy().catch(() => {});
    }
  });

  fsTests(() => service);
  libraryTests(() => service);
  bookTests(() => service, getBookFile);
});
