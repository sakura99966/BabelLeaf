import { NativeAppService } from '@/services/nativeAppService';
import { safeLoadJSON, safeSaveJSON, updateJSON } from '@/services/persistence';

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
  if (phase === 'before-main') {
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
  } else throw new Error('Unknown crash probe phase');
};
void run().catch((error) => report({ error: String(error) }));
