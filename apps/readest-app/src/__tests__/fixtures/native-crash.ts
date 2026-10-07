import { NativeAppService } from '@/services/nativeAppService';
import { safeLoadJSON, safeSaveJSON, updateJSON } from '@/services/persistence';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { tauriQuitApp } from '@/utils/window';
import {
  createTranslationArtifact,
  getTranslationArtifactPath,
  TranslationArtifactStore,
  upsertTranslationSegments,
} from '@/services/translators/artifacts';

const params = new URLSearchParams(location.search);
const root = params.get('root');
if (!root || !root.endsWith('.readest-test-sandbox-tauri'))
  throw new Error('An isolated native test root is required');
const report = (value: unknown) => {
  document.body.textContent = JSON.stringify(value);
};
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
const run = async () => {
  const service = new NativeAppService(root);
  await service.init();
  await service.createDir('', 'Data', true);
  const load = () =>
    safeLoadJSON<{ count: number } | null>(service, 'crash.json', 'Data', null, validate);
  const phase = params.get('phase');
  const artifact = createTranslationArtifact({
    bookHash: 'crash-probe',
    provider: 'deepseek',
    promptVersion: 'translation-v1',
    sourceLang: 'en',
    targetLang: 'zh-CN',
  });
  const store = new TranslationArtifactStore(service);
  if (phase === 'veto-close') {
    await getCurrentWindow().onCloseRequested((event) => event.preventDefault());
    const channel = new BroadcastChannel(params.get('channel')!);
    channel.postMessage('ready');
  } else if (phase === 'quit-guard') {
    const channelId = `quit-${crypto.randomUUID()}`;
    const channel = new BroadcastChannel(channelId);
    let ready = false;
    channel.onmessage = () => {
      ready = true;
    };
    const url = new URL(location.href);
    url.searchParams.set('phase', 'veto-close');
    url.searchParams.set('channel', channelId);
    const child = new WebviewWindow('reader-quit-probe', {
      url: url.href,
      visible: false,
      ...(await invoke<ConstructorParameters<typeof WebviewWindow>[1]>('get_webview_environment')),
    });
    try {
      const deadline = Date.now() + 15000;
      while (!ready) {
        if (Date.now() > deadline) throw new Error('Quit guard child failed to initialize');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      let vetoed = false;
      let quitError = 'No error returned';
      try {
        await tauriQuitApp();
      } catch (error) {
        quitError = String(error);
        vetoed = quitError.includes('reader window');
      }
      if (!vetoed)
        throw new Error(`Application exit did not honor another reader veto: ${quitError}`);
      report({ stage: 'quit-guard', protectedOtherWindow: true });
    } finally {
      channel.close();
      await child.destroy();
    }
  } else if (phase === 'directory-scope') {
    const files = await invoke<Array<{ path: string; size: number }>>('read_dir', {
      path: root,
      recursive: true,
      extensions: ['txt'],
    });
    if (
      !files.some((file) => file.path.endsWith('allowed.txt')) ||
      files.some((file) => file.path.includes('must-not-enumerate'))
    )
      throw new Error('Recursive scan crossed the junction scope boundary');
    for (const recursive of [false, true]) {
      let denied = false;
      try {
        await invoke('read_dir', { path: `${root}/junction`, recursive, extensions: ['txt'] });
      } catch (error) {
        denied = String(error).includes('Permission denied');
      }
      if (!denied) throw new Error('Out-of-scope junction root was not rejected');
    }
    report({ stage: 'directory-scope', recursiveJunctionExcluded: true, junctionRootDenied: true });
  } else if (phase === 'before-main') {
    await safeSaveJSON(service, 'crash.json', 'Data', { count: 42 });
    const fs = {
      readFile: service.readFile.bind(service),
      writeFile: service.writeFile.bind(service),
      writeFileAtomic: async (...args: Parameters<typeof service.writeFileAtomic>) => {
        if (args[0] === 'crash.json') {
          report({ stage: 'before-main', committed: 42 });
          await new Promise<void>(() => {});
        }
        return service.writeFileAtomic(...args);
      },
    };
    await updateJSON(fs, 'crash.json', 'Data', () => ({ count: 43 }), validate);
  } else if (phase === 'after-main') {
    const recovered = await load();
    if (recovered?.count !== 42) throw new Error('Interrupted replacement lost committed data');
    await updateJSON(service, 'crash.json', 'Data', () => ({ count: 43 }), validate);
    report({ stage: 'after-main', recovered: 42, committed: 43 });
    await new Promise<void>(() => {});
  } else if (phase === 'recover') {
    const main = await load();
    if (main?.count !== 43) throw new Error('Completed replacement did not survive process kill');
    await service.writeFile('crash.json', 'Data', '{truncated');
    const backup = await load();
    if (backup?.count !== 42) throw new Error('Backup recovery failed after process restart');
    await updateJSON(service, 'crash.json', 'Data', () => ({ count: 44 }), validate);
    const resumed = await load();
    if (resumed?.count !== 44) throw new Error('Process death left persistence locked');
    report({ stage: 'recovered', main: main.count, backup: backup.count, resumed: resumed.count });
  } else if (phase === 'artifact-journal') {
    await store.save(artifact);
    const writeAtomic = service.writeFileAtomic.bind(service);
    service.writeFileAtomic = async (...args) => {
      if (args[0] === getTranslationArtifactPath(artifact)) {
        report({ stage: 'artifact-journal', journalCommitted: true });
        await new Promise<void>(() => {});
      }
      return writeAtomic(...args);
    };
    await store.save(
      upsertTranslationSegments(
        artifact,
        [
          {
            id: 'one',
            sourceText: 'Hello',
            translatedText: 'Recovered paid result',
            sourceLang: 'en',
            targetLang: 'zh-CN',
            status: 'translated',
            updatedAt: 1,
          },
        ],
        1,
      ),
    );
  } else if (phase === 'recover-artifact') {
    const recovered = await store.load(artifact);
    if (recovered?.segments[0]?.translatedText !== 'Recovered paid result')
      throw new Error('Durable pending translation was lost');
    const filename = getTranslationArtifactPath(artifact);
    if (
      (await service.exists(`${filename}.pending`, 'Data')) ||
      (await service.exists(`${filename}.pending.bak`, 'Data'))
    )
      throw new Error('Recovered journal was not acknowledged');
    report({
      stage: 'recovered-artifact',
      translatedText: recovered.segments[0].translatedText,
      journalRemoved: true,
    });
  } else throw new Error('Unknown crash probe phase');
};
void run().catch((error) => report({ error: String(error) }));
