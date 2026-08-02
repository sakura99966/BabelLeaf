import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('TTS Android audio keep-alive', () => {
  test('is a no-op when Web Audio is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const keepAlive = await import('@/services/tts/audioKeepAlive');

    await expect(keepAlive.ensureSharedAudioContext()).resolves.toBeUndefined();
    expect(() => keepAlive.startAudioKeepAlive()).not.toThrow();
    expect(() => keepAlive.stopAudioKeepAlive()).not.toThrow();
  });

  test('reuses one context and releases the oscillator graph', async () => {
    const oscillator = {
      frequency: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const context = {
      state: 'suspended',
      destination: {},
      resume: vi.fn(async () => {
        context.state = 'running';
      }),
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
    };
    const AudioContextMock = vi.fn(function () {
      return context;
    });
    vi.stubGlobal('AudioContext', AudioContextMock);
    const keepAlive = await import('@/services/tts/audioKeepAlive');

    await keepAlive.ensureSharedAudioContext();
    keepAlive.startAudioKeepAlive();
    keepAlive.startAudioKeepAlive();
    keepAlive.stopAudioKeepAlive();

    expect(AudioContextMock).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.createOscillator).toHaveBeenCalledOnce();
    expect(oscillator.start).toHaveBeenCalledOnce();
    expect(oscillator.stop).toHaveBeenCalledOnce();
    expect(oscillator.disconnect).toHaveBeenCalledOnce();
    expect(gain.disconnect).toHaveBeenCalledOnce();
  });
});
