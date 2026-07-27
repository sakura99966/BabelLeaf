import type { ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span aria-label={alt} />,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { hasUpdater: false } }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { updateChannel: 'stable' } }),
}));

vi.mock('@/helpers/updater', () => ({
  checkForAppUpdates: vi.fn(),
  checkAppReleaseNotes: vi.fn(),
}));

vi.mock('@/utils/ua', () => ({
  parseWebViewInfo: () => 'WebView test',
}));

vi.mock('@/utils/version', () => ({
  getAppVersion: () => '0.1.0',
}));

vi.mock('@/components/Dialog', () => ({
  default: ({ id, children }: { id: string; children: ReactNode }) => <div id={id}>{children}</div>,
}));

vi.mock('@/components/Link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/SupportLinks', () => ({
  default: () => <div>Readest support links</div>,
}));

vi.mock('@/components/LegalLinks', () => ({
  default: () => <div>Readest legal links</div>,
}));

import { AboutWindow, setAboutDialogVisible } from '@/components/AboutWindow';

describe('AboutWindow BabelLeaf identity and network policy', () => {
  afterEach(() => {
    cleanup();
  });

  test('shows BabelLeaf identity without inherited update or service links', () => {
    render(<AboutWindow />);

    act(() => {
      setAboutDialogVisible(true);
    });

    expect(screen.getByRole('heading', { name: 'BabelLeaf' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check Update' })).toBeNull();
    expect(screen.queryByText('Readest support links')).toBeNull();
    expect(screen.queryByText('Readest legal links')).toBeNull();
    expect(screen.getByRole('link', { name: 'GitHub' }).getAttribute('href')).toBe(
      'https://github.com/sakura99966/BabelLeaf',
    );
    expect(screen.getByText(/Derived from Readest/)).toBeTruthy();
    expect(screen.getByText(/Bilingify LLC/)).toBeTruthy();
  });
});
