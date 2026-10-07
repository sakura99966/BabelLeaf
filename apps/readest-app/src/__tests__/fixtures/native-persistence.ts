import { NativeAppService } from '@/services/nativeAppService';
import { updateJSON } from '@/services/persistence';

const params = new URLSearchParams(location.search);
const root = params.get('root');
const channelId = params.get('channel');
if (!root || !channelId) throw new Error('Missing isolated probe parameters');
const channel = new BroadcastChannel(channelId);
const service = new NativeAppService(root);
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
void service
  .init()
  .then(() => {
    channel.onmessage = async (event: MessageEvent<{ mode: string }>) => {
      try {
        if (event.data.mode === 'interrupt') {
          const fs = {
            readFile: service.readFile.bind(service),
            writeFile: service.writeFile.bind(service),
            writeFileAtomic: async (...args: Parameters<typeof service.writeFileAtomic>) => {
              if (args[0] === 'multiwindow.json') {
                channel.postMessage({ stage: 'before-main' });
                await new Promise<void>(() => {});
              }
              return service.writeFileAtomic(...args);
            },
          };
          await updateJSON(fs, 'multiwindow.json', 'Data', () => ({ count: 999 }), validate);
        } else {
          for (let index = 0; index < 20; index++) {
            await updateJSON(
              service,
              'multiwindow.json',
              'Data',
              (previous) => ({
                count: previous === null ? 1 : validate(previous).count + 1,
              }),
              validate,
            );
          }
          channel.postMessage({ stage: 'done' });
        }
      } catch (error) {
        channel.postMessage({ error: String(error) });
      }
    };
    channel.postMessage({ stage: 'ready' });
  })
  .catch((error) => channel.postMessage({ error: String(error) }));
