import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import TranslatorPopup from '@/app/reader/components/annotator/TranslatorPopup';

const mocks = vi.hoisted(() => ({
  translate: vi.fn(),
  setSettings: vi.fn(),
  saveSettings: vi.fn(),
  envConfig: { platform: 'windows' },
  settings: {
    globalReadSettings: {
      translateTargetLang: 'ZH-CN',
      translationProvider: 'deepseek',
    },
  },
  translators: [
    { name: 'deepseek', label: 'DeepSeek', configured: true },
    { name: 'openai', label: 'OpenAI', configured: true },
    { name: 'disabled', label: 'Disabled', configured: false },
  ],
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: mocks.envConfig }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: mocks.settings,
    setSettings: mocks.setSettings,
    saveSettings: mocks.saveSettings,
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, values?: Record<string, unknown>) =>
    values?.['provider'] ? key.replace('{{provider}}', String(values['provider'])) : key,
}));

vi.mock('@/hooks/useTranslator', () => ({
  useTranslator: () => ({
    translate: mocks.translate,
    translators: mocks.translators,
  }),
}));

vi.mock('@/services/constants', () => ({
  TRANSLATOR_LANGS: {
    EN: 'English',
    JA: 'Japanese',
    'ZH-CN': 'Simplified Chinese',
  },
}));

vi.mock('@/services/translators', () => ({
  getTranslatorDisplayLabel: (translator: { label: string }) => translator.label,
  getTranslators: () => mocks.translators,
  isTranslatorAvailable: (translator: { configured: boolean }) => translator.configured,
}));

vi.mock('@/components/Popup', () => ({
  default: ({ children, onDismiss }: React.PropsWithChildren<{ onDismiss?: () => void }>) => (
    <div>
      <button type='button' aria-label='Dismiss translator' onClick={onDismiss} />
      {children}
    </div>
  ),
}));

vi.mock('@/components/Select', () => ({
  default: ({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: React.ChangeEventHandler<HTMLSelectElement>;
    options: Array<{ value: string; label: string; disabled?: boolean }>;
  }) => (
    <select value={value} onChange={onChange}>
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const defaultProps = {
  text: ' Hello\nworld ',
  position: { point: { x: 10, y: 10 } },
  trianglePosition: { point: { x: 12, y: 12 } },
  popupWidth: 440,
  popupHeight: 240,
};

beforeEach(() => {
  mocks.settings.globalReadSettings.translateTargetLang = 'ZH-CN';
  mocks.settings.globalReadSettings.translationProvider = 'deepseek';
  mocks.translate.mockReset();
  mocks.translate.mockResolvedValue(['你好，世界']);
  mocks.setSettings.mockReset();
  mocks.saveSettings.mockReset();
  mocks.saveSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TranslatorPopup', () => {
  test('submits selected text immediately and renders a successful translation', async () => {
    const onDismiss = vi.fn();
    render(<TranslatorPopup {...defaultProps} onDismiss={onDismiss} />);

    await waitFor(() => expect(screen.getByText('你好，世界')).toBeTruthy());
    expect(mocks.translate).toHaveBeenCalledWith(
      ['Helloworld'],
      expect.objectContaining({
        source: 'AUTO',
        target: 'ZH-CN',
        useCache: true,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.getByText('Translated by DeepSeek.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss translator' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('persists target language and provider changes without mutating the current settings object', async () => {
    const originalSettings = mocks.settings;
    render(<TranslatorPopup {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('你好，世界')).toBeTruthy());

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(selects[1]!, { target: { value: 'EN' } });
    await waitFor(() => expect(mocks.saveSettings).toHaveBeenCalledTimes(1));
    const languageSettings = mocks.setSettings.mock.calls[0]![0];
    expect(languageSettings).not.toBe(originalSettings);
    expect(languageSettings.globalReadSettings).not.toBe(originalSettings.globalReadSettings);
    expect(languageSettings.globalReadSettings.translateTargetLang).toBe('EN');
    expect(originalSettings.globalReadSettings.translateTargetLang).toBe('ZH-CN');
    expect(mocks.saveSettings).toHaveBeenCalledWith(mocks.envConfig, languageSettings);

    fireEvent.change(selects[2]!, { target: { value: 'openai' } });
    await waitFor(() => expect(mocks.saveSettings).toHaveBeenCalledTimes(2));
    const providerSettings = mocks.setSettings.mock.calls[1]![0];
    expect(providerSettings.globalReadSettings.translationProvider).toBe('openai');
    expect(originalSettings.globalReadSettings.translationProvider).toBe('deepseek');
    expect(mocks.saveSettings).toHaveBeenLastCalledWith(mocks.envConfig, providerSettings);
  });

  test('aborts superseded work and never lets a stale response replace the current translation', async () => {
    const requests: Array<{
      signal: AbortSignal;
      resolve: (value: string[]) => void;
    }> = [];
    mocks.translate.mockImplementation(
      (_texts: string[], options: { signal: AbortSignal }) =>
        new Promise<string[]>((resolve) => {
          requests.push({ signal: options.signal, resolve });
        }),
    );

    const { rerender } = render(<TranslatorPopup {...defaultProps} text='first' />);
    await waitFor(() => expect(requests).toHaveLength(1));
    rerender(<TranslatorPopup {...defaultProps} text='second' />);
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]!.signal.aborted).toBe(true);

    await act(async () => requests[1]!.resolve(['current']));
    expect(screen.getByText('current')).toBeTruthy();
    await act(async () => requests[0]!.resolve(['stale']));
    expect(screen.queryByText('stale')).toBeNull();
    expect(screen.getByText('current')).toBeTruthy();
  });

  test('shows a redacted user-facing failure without exposing provider error details', async () => {
    const rawError = 'Bearer sk-secret-provider-value';
    mocks.translate.mockRejectedValue(new Error(rawError));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<TranslatorPopup {...defaultProps} />);

    await waitFor(() =>
      expect(
        screen.getByText('Unable to fetch the translation. Check the configured model API.'),
      ).toBeTruthy(),
    );
    expect(document.body.textContent).not.toContain(rawError);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
