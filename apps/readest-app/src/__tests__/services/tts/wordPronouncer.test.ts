import { beforeEach, describe, expect, it, vi } from 'vitest';

const clients = vi.hoisted(() => {
  const web = {
    init: vi.fn(),
    setPrimaryLang: vi.fn(),
    speak: vi.fn(),
    shutdown: vi.fn(),
  };
  const native = {
    init: vi.fn(),
    setPrimaryLang: vi.fn(),
    speak: vi.fn(),
    shutdown: vi.fn(),
  };
  return { web, native };
});

vi.mock('@/services/tts/WebSpeechClient', () => ({
  WebSpeechClient: class {
    constructor() {
      Object.assign(this, clients.web);
    }
  },
}));

vi.mock('@/services/tts/NativeTTSClient', () => ({
  NativeTTSClient: class {
    constructor() {
      Object.assign(this, clients.native);
    }
  },
}));

import {
  cancelWordPronounce,
  pronounceWord,
  warmWordAudio,
} from '@/services/tts/wordPronouncer';

const ended = async function* () {
  yield { code: 'end' as const };
};

beforeEach(() => {
  vi.clearAllMocks();
  clients.web.init.mockResolvedValue(true);
  clients.native.init.mockResolvedValue(true);
  clients.web.shutdown.mockResolvedValue(undefined);
  clients.native.shutdown.mockResolvedValue(undefined);
  clients.web.speak.mockImplementation(ended);
  clients.native.speak.mockImplementation(ended);
});

describe('pronounceWord local engines', () => {
  it('uses Web Speech on desktop and reports the complete lifecycle', async () => {
    const onStatus = vi.fn();

    await pronounceWord(' hello ', 'en-US', {}, onStatus);

    expect(clients.web.init).toHaveBeenCalledOnce();
    expect(clients.web.setPrimaryLang).toHaveBeenCalledWith('en-US');
    expect(clients.web.speak).toHaveBeenCalledOnce();
    expect(clients.web.speak.mock.calls[0]![0]).toContain('hello');
    expect(clients.native.init).not.toHaveBeenCalled();
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['playing', 'ended']);
    expect(clients.web.shutdown).toHaveBeenCalled();
  });

  it('uses native TTS on mobile', async () => {
    await pronounceWord(
      'こんにちは',
      'ja',
      { appService: { isMobile: true } as never },
      vi.fn(),
    );

    expect(clients.native.init).toHaveBeenCalledOnce();
    expect(clients.native.setPrimaryLang).toHaveBeenCalledWith('ja');
    expect(clients.native.speak).toHaveBeenCalledOnce();
    expect(clients.web.init).not.toHaveBeenCalled();
  });

  it('reports ended without creating a client for blank text', async () => {
    const onStatus = vi.fn();

    await pronounceWord('   ', 'en', {}, onStatus);

    expect(onStatus).toHaveBeenCalledWith('ended');
    expect(clients.web.init).not.toHaveBeenCalled();
    expect(clients.native.init).not.toHaveBeenCalled();
  });

  it('reports an initialization failure', async () => {
    clients.web.init.mockResolvedValueOnce(false);
    const onStatus = vi.fn();

    await pronounceWord('hello', 'en', {}, onStatus);

    expect(onStatus).toHaveBeenLastCalledWith('error');
    expect(clients.web.speak).not.toHaveBeenCalled();
  });

  it('reports an engine error event', async () => {
    clients.web.speak.mockImplementationOnce(async function* () {
      yield { code: 'error' as const, message: 'failed' };
    });
    const onStatus = vi.fn();

    await pronounceWord('hello', 'en', {}, onStatus);

    expect(onStatus).toHaveBeenLastCalledWith('error');
  });

  it('aborts and shuts down an active pronunciation', async () => {
    clients.web.speak.mockImplementationOnce(async function* (
      _ssml: string,
      signal: AbortSignal,
    ) {
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    const onStatus = vi.fn();
    const pronunciation = pronounceWord('hello', 'en', {}, onStatus);
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith('playing'));

    cancelWordPronounce();
    await pronunciation;

    expect(clients.web.shutdown).toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalledWith('ended');
  });

  it('keeps the gesture warm-up API as a harmless no-op', () => {
    expect(() => warmWordAudio()).not.toThrow();
  });
});
