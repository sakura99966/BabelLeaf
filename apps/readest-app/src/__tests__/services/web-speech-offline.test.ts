import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WebSpeechClient } from '@/services/tts/WebSpeechClient';
import type { TTSMessageEvent } from '@/services/tts/TTSClient';
import type { TTSController } from '@/services/tts/TTSController';

const selection = vi.hoisted(() => ({ preferred: '' }));
vi.mock('@/services/tts/TTSUtils', () => ({
  TTSUtils: {
    getPreferredVoice: () => selection.preferred,
    sortVoicesPreferLocaleFunc: () => () => 0,
  },
}));

const voice = (name: string, lang: string, localService?: boolean): SpeechSynthesisVoice =>
  ({ name, lang, localService, voiceURI: name, default: false }) as SpeechSynthesisVoice;
const sample =
  '<speak xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><mark name="0"/>Local sample.</speak>';
const setup = async (voices: SpeechSynthesisVoice[]) => {
  const dispatch = vi.fn((utterance: SpeechSynthesisUtterance) => {
    utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
  });
  vi.stubGlobal('speechSynthesis', { getVoices: () => voices, speak: dispatch });
  vi.stubGlobal('SpeechSynthesisUtterance', class {});
  const client = new WebSpeechClient();
  await client.init();
  return { client, dispatch };
};
const consume = async (client: WebSpeechClient) => {
  const events: TTSMessageEvent[] = [];
  for await (const event of client.speak(sample, new AbortController().signal)) {
    events.push(event);
  }
  return events;
};

beforeEach(() => {
  selection.preferred = '';
});
afterEach(() => vi.unstubAllGlobals());

describe('Web Speech offline boundary', () => {
  test('notifies its reader controller when a local voice is unavailable', async () => {
    const { client } = await setup([voice('remote-en', 'en-US', false)]);
    const dispatchEvent = vi.fn();
    client.controller = {
      dispatchEvent,
      dispatchSpeakMark: vi.fn(),
    } as unknown as TTSController;
    await consume(client);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tts-local-voice-unavailable' }),
    );
  });

  test('lists and selects only verified local voices despite a stored remote preference', async () => {
    const local = voice('local-en', 'en-US', true);
    const { client, dispatch } = await setup([
      local,
      voice('remote-en', 'en-US', false),
      voice('unknown-en', 'en-US'),
    ]);
    selection.preferred = 'remote-en';
    expect((await client.getAllVoices()).map((item) => item.id)).toEqual(['local-en']);
    expect((await client.getVoices('en'))[0]?.voices.map((item) => item.id)).toEqual(['local-en']);
    await client.setVoice('remote-en');
    expect(await consume(client)).toContainEqual({ code: 'end', message: 'Speech finished' });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0]?.[0].voice).toBe(local);
    expect(client.getVoiceId()).toBe('local-en');
  });

  test.each([
    ['only remote voices', [voice('remote-en', 'en-US', false)]],
    ['unverified voices', [voice('unknown-en', 'en-US')]],
    ['no matching language', [voice('local-fr', 'fr-FR', true)]],
  ])('fails closed with an error for %s instead of using the system default', async (_name, voices) => {
    const { client, dispatch } = await setup(voices);
    expect(await consume(client)).toEqual([
      expect.objectContaining({ code: 'error', message: expect.stringContaining('local voice') }),
    ]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('rechecks a previously local voice immediately before dispatch', async () => {
    const local = voice('local-en', 'en-US', true);
    const { client, dispatch } = await setup([local]);
    const stream = client.speak(sample, new AbortController().signal);
    expect((await stream.next()).value).toMatchObject({ code: 'boundary' });
    Object.defineProperty(local, 'localService', { value: false });
    const result = await stream.next();
    expect(result.value).toMatchObject({ code: 'error' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('does not submit a cancelled utterance', async () => {
    const { client, dispatch } = await setup([voice('local-en', 'en-US', true)]);
    const abort = new AbortController();
    abort.abort();
    for await (const _event of client.speak(sample, abort.signal)) {
      // Fully consume the client without speaking or using an external service.
    }
    expect(dispatch).not.toHaveBeenCalled();
  });
});
