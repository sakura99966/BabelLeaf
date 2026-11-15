import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import AIPanel from '@/components/settings/AIPanel';

const mocks = vi.hoisted(() => ({
  getApiKey: vi.fn(() => 'not-for-bilibili'),
  saveApiKey: vi.fn(),
  setApiKey: vi.fn(),
  setSettings: vi.fn(),
  saveSettings: vi.fn(async () => undefined),
  checkConnection: vi.fn(async () => true),
  settings: { aiSettings: { provider: 'deepseek' } },
}));

vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: {} }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/components/settings/OcrModelPackPanel', () => ({ default: () => null }));
vi.mock('@/components/settings/InpaintModelPackPanel', () => ({ default: () => null }));
vi.mock('@/services/ai/providers', () => ({
  getAIProvider: () => ({ healthCheck: mocks.checkConnection }),
}));
vi.mock('@/services/ai/translationApiKey', () => ({
  getTranslationApiKey: mocks.getApiKey,
  saveTranslationApiKey: mocks.saveApiKey,
  setTranslationApiKeyForSession: mocks.setApiKey,
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: Object.assign(
    () => ({
      settings: mocks.settings,
      setSettings: mocks.setSettings,
      saveSettings: mocks.saveSettings,
    }),
    { getState: () => ({ settings: mocks.settings }) },
  ),
}));

afterEach(cleanup);

test('Index-Translate settings require no key and do not test the connection implicitly', async () => {
  const { container } = render(<AIPanel />);
  fireEvent.click(screen.getByRole('radio', { name: 'Bilibili Index-Translate' }));
  expect(container.querySelector('input[type="password"]')).toBeNull();
  expect(screen.getByText('Index-Translate-35B-A3B')).toBeTruthy();
  expect(screen.getByText(/Translation sends requested text to Bilibili/)).toBeTruthy();
  expect(mocks.setSettings).toHaveBeenCalledWith({
    aiSettings: {
      provider: 'index-translate',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'llama3.2',
    },
  });
  expect(mocks.saveApiKey).not.toHaveBeenCalled();
  expect(mocks.getApiKey).not.toHaveBeenCalledWith('index-translate');
  expect(mocks.checkConnection).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy());
  expect(mocks.checkConnection).toHaveBeenCalledOnce();
});
