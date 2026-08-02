import { AppService } from '@/types/system';
import { genSSMLRaw } from '@/utils/ssml';
import { TTSClient } from './TTSClient';
import { NativeTTSClient } from './NativeTTSClient';
import { WebSpeechClient } from './WebSpeechClient';

export type PronounceStatus = 'playing' | 'ended' | 'error';

export interface PronounceWordOptions {
  appService?: AppService | null;
}

let requestToken = 0;
let activeAbort: AbortController | null = null;
let activeClient: TTSClient | null = null;

const stopActiveClient = (): void => {
  activeAbort?.abort();
  activeAbort = null;
  const client = activeClient;
  activeClient = null;
  if (client) void client.shutdown().catch(() => {});
};

// Retained for the dictionary button's gesture-path API. Native TTS and the
// browser Speech Synthesis API do not require a Web Audio context warm-up.
export const warmWordAudio = (): void => {};

export const cancelWordPronounce = (): void => {
  requestToken += 1;
  stopActiveClient();
};

export const pronounceWord = async (
  word: string,
  lang: string | undefined,
  options: PronounceWordOptions,
  onStatus?: (status: PronounceStatus) => void,
): Promise<void> => {
  const token = ++requestToken;
  const emit = (status: PronounceStatus) => {
    if (token === requestToken) onStatus?.(status);
  };

  const text = word.trim();
  if (!text) {
    emit('ended');
    return;
  }

  stopActiveClient();
  const client: TTSClient = options.appService?.isMobile
    ? new NativeTTSClient()
    : new WebSpeechClient();
  const abort = new AbortController();
  activeClient = client;
  activeAbort = abort;

  try {
    if (!(await client.init()) || token !== requestToken) {
      emit('error');
      return;
    }

    client.setPrimaryLang(lang || 'en');
    emit('playing');
    let failed = false;
    for await (const event of client.speak(genSSMLRaw(text), abort.signal)) {
      if (token !== requestToken || abort.signal.aborted) return;
      if (event.code === 'error') {
        failed = true;
        break;
      }
    }
    emit(failed ? 'error' : 'ended');
  } catch {
    emit('error');
  } finally {
    if (activeAbort === abort) activeAbort = null;
    if (activeClient === client) activeClient = null;
    void client.shutdown().catch(() => {});
  }
};
