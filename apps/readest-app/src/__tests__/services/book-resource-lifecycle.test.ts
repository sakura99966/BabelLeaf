import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  views: {} as Record<string, unknown>,
  active: false,
  spokenHash: '',
  release: vi.fn(async (_hash: string) => {}),
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: { getState: () => ({ viewStates: state.views }) },
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: { getState: () => ({ releaseBookContent: state.release }) },
}));
vi.mock('@/services/tts/sessionPresence', () => ({
  ttsSessionPresence: { hasBookOwner: (hash: string) => hash === state.spokenHash },
}));
vi.mock('@/services/tts/TTSSessionManager', () => ({
  ttsSessionManager: {
    getSessionByHash: (hash: string) => (hash === state.spokenHash ? { bookHash: hash } : null),
  },
}));
import { releaseClosedBookContent } from '@/services/bookResourceLifecycle';

beforeEach(() => {
  state.views = {};
  state.active = false;
  state.spokenHash = '';
  state.release.mockClear();
});

it('releases only parser/file content when the final owner closes', async () => {
  await expect(releaseClosedBookContent('hash-pane')).resolves.toBe(true);
  expect(state.release).toHaveBeenCalledExactlyOnceWith('hash');
});

it('retains a shared document while another pane is open or initializing', async () => {
  state.views = { 'hash-other': { view: null }, 'other-pane': {} };
  await expect(releaseClosedBookContent('hash-pane')).resolves.toBe(false);
  expect(state.release).not.toHaveBeenCalled();
});

it('retains the detached background speech document', async () => {
  state.active = true;
  state.spokenHash = 'hash';
  await expect(releaseClosedBookContent('hash-pane')).resolves.toBe(false);
  expect(state.release).not.toHaveBeenCalled();
});

it('does not retain unrelated closed books just because speech is active', async () => {
  state.active = true;
  state.spokenHash = 'other';
  await expect(releaseClosedBookContent('hash-pane')).resolves.toBe(true);
  expect(state.release).toHaveBeenCalledExactlyOnceWith('hash');
});

it('rechecks a same-turn reopening view before resource disposal', async () => {
  state.active = true;
  state.spokenHash = 'other';
  const pending = releaseClosedBookContent('hash-pane');
  state.views = { 'hash-reopened': {} };
  await expect(pending).resolves.toBe(false);
  expect(state.release).not.toHaveBeenCalled();
});

it('retains an owner while speech UI is already stopped but shutdown is pending', async () => {
  state.active = false;
  state.spokenHash = 'hash';
  await expect(releaseClosedBookContent('hash-pane')).resolves.toBe(false);
  expect(state.release).not.toHaveBeenCalled();
});
