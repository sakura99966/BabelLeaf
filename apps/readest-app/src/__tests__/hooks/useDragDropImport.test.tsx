import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { AppService } from '@/types/system';
import { useDragDropImport } from '@/app/library/hooks/useDragDropImport';

const mocks = vi.hoisted(() => ({
  service: null as AppService | null,
  dispatch: vi.fn(),
  unlisten: vi.fn(),
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: mocks.service }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useSearchParams: () => ({ get: () => null }) }));
vi.mock('@/services/environment', () => ({ isTauriAppPlatform: () => true }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch: mocks.dispatch } }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => mocks.unlisten }),
}));
const service = () =>
  ({
    isMobile: false,
    hasHaptics: false,
    isDirectory: vi.fn(async () => false),
  }) as unknown as AppService;
const Harness = ({ ready = true }: { ready?: boolean }) => {
  useDragDropImport(ready);
  return ready ? <div className='library-page' /> : null;
};
const drop = (node: Element) =>
  fireEvent.drop(node, { dataTransfer: { files: [new File(['Local sample'], 'sample.txt')] } });
beforeEach(() => {
  mocks.service = null;
  mocks.dispatch.mockClear();
  mocks.unlisten.mockClear();
});
afterEach(cleanup);

test('refreshes the import callback when the native service initializes after the page mounts', async () => {
  const { container, rerender } = render(<Harness />);
  mocks.service = service();
  rerender(<Harness />);
  await act(async () => drop(container.firstElementChild!));
  expect(mocks.dispatch).toHaveBeenCalledWith(
    'import-book-files',
    expect.objectContaining({ files: [expect.objectContaining({ file: expect.any(File) })] }),
  );
});

test('removes both DOM and native drop listeners when a native library page unmounts', async () => {
  mocks.service = service();
  const { container, unmount } = render(<Harness />);
  const node = container.firstElementChild!;
  unmount();
  await act(async () => drop(node));
  expect(mocks.dispatch).not.toHaveBeenCalled();
  expect(mocks.unlisten).toHaveBeenCalledOnce();
});

test('attaches after the library leaves its initial loading screen', async () => {
  mocks.service = service();
  const { container, rerender } = render(<Harness ready={false} />);
  rerender(<Harness ready />);
  await act(async () => drop(container.firstElementChild!));
  expect(mocks.dispatch).toHaveBeenCalledWith('import-book-files', expect.any(Object));
});
