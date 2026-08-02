import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import ImportMenuPopup, { getMenuPosition } from '@/app/library/components/ImportMenuPopup';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));
const safeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ safeAreaInsets }),
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: null }) }));

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const renderPopup = (withDirectory = false) => {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  const onClose = vi.fn();
  const onImportBooksFromFiles = vi.fn();
  const onImportBooksFromDirectory = vi.fn();
  render(
    <ImportMenuPopup
      anchor={anchor}
      onClose={onClose}
      onImportBooksFromFiles={onImportBooksFromFiles}
      {...(withDirectory ? { onImportBooksFromDirectory } : {})}
    />,
  );
  return { onClose, onImportBooksFromFiles, onImportBooksFromDirectory };
};

describe('ImportMenuPopup', () => {
  it('offers local file import and no network source', () => {
    const { onClose, onImportBooksFromFiles } = renderPopup();
    fireEvent.click(screen.getByRole('menuitem', { name: 'From Local File' }));

    expect(onImportBooksFromFiles).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: 'From Feed URL' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Online Library' })).toBeNull();
  });

  it('offers directory import only when the local handler is available', () => {
    const { onImportBooksFromDirectory } = renderPopup(true);
    fireEvent.click(screen.getByRole('menuitem', { name: 'From Directory' }));

    expect(onImportBooksFromDirectory).toHaveBeenCalledTimes(1);
  });
});

describe('getMenuPosition', () => {
  it('centers a menu beneath its anchor and flips when necessary', () => {
    const anchor = {
      left: 400,
      top: 600,
      width: 100,
      height: 140,
      right: 500,
      bottom: 740,
    } as DOMRect;
    const bounds = { left: 8, top: 8, right: 992, bottom: 792 };
    expect(getMenuPosition(anchor, { width: 200, height: 240 }, bounds)).toEqual({
      left: 350,
      top: 352,
    });
  });
});
