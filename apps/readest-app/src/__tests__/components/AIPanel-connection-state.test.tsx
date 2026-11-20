import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import AIPanel from '@/components/settings/AIPanel';

const mocks = vi.hoisted(() => ({
  check: vi.fn<() => Promise<boolean>>(),
  settings: { aiSettings: { provider: 'index-translate' } },
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: {} }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/components/settings/OcrModelPackPanel', () => ({ default: () => null }));
vi.mock('@/components/settings/InpaintModelPackPanel', () => ({ default: () => null }));
vi.mock('@/services/ai/providers', () => ({
  getAIProvider: () => ({ healthCheck: mocks.check }),
}));
vi.mock('@/services/ai/translationApiKey', () => ({
  getTranslationApiKey: () => '',
  saveTranslationApiKey: vi.fn(async () => undefined),
  setTranslationApiKeyForSession: vi.fn(),
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: Object.assign(
    () => ({
      settings: mocks.settings,
      setSettings: vi.fn(),
      saveSettings: vi.fn(async () => undefined),
    }),
    { getState: () => ({ settings: mocks.settings }) },
  ),
}));

const pendingCheck = () => {
  let resolve!: (result: boolean) => void;
  let reject!: (error: Error) => void;
  mocks.check.mockImplementationOnce(
    () =>
      new Promise<boolean>((done, fail) => {
        resolve = done;
        reject = fail;
      }),
  );
  return { resolve: (result: boolean) => resolve(result), reject: (error: Error) => reject(error) };
};
const testConnection = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
beforeEach(() => {
  mocks.check.mockReset();
  mocks.settings.aiSettings.provider = 'index-translate';
});
afterEach(cleanup);

test.each([
  'success',
  'failure',
] as const)('does not apply an old %s after switching providers', async (outcome) => {
  const pending = pendingCheck();
  render(<AIPanel />);
  testConnection();
  fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }));
  await act(async () => {
    if (outcome === 'success') pending.resolve(true);
    else pending.reject(new Error('Old provider failed'));
  });
  expect(screen.queryByText('Connected')).toBeNull();
  expect(screen.queryByText('Old provider failed')).toBeNull();
  expect(screen.getByRole('button', { name: 'Test Connection' })).toHaveProperty('disabled', false);
});

test('switching away and back cannot reuse a previous result or replace a newer result', async () => {
  const old = pendingCheck();
  mocks.check.mockResolvedValueOnce(true);
  render(<AIPanel />);
  testConnection();
  fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Bilibili Index-Translate' }));
  await act(async () => testConnection());
  expect(screen.getByText('Connected')).toBeTruthy();
  await act(async () => old.reject(new Error('Old provider failed')));
  expect(screen.getByText('Connected')).toBeTruthy();
  expect(screen.queryByText('Old provider failed')).toBeNull();
});

test('editing the API key invalidates an in-flight check for the same provider', async () => {
  mocks.settings.aiSettings.provider = 'deepseek';
  const pending = pendingCheck();
  const { container } = render(<AIPanel />);
  testConnection();
  fireEvent.change(container.querySelector('input[type="password"]')!, {
    target: { value: 'local-test-placeholder' },
  });
  await act(async () => pending.resolve(true));
  expect(screen.queryByText('Connected')).toBeNull();
  expect(screen.getByRole('button', { name: 'Test Connection' })).toHaveProperty('disabled', false);
});

test.each([
  'http://127.0.0.1:11434',
  'llama3.2',
])('editing Ollama %s invalidates its in-flight check', async (value) => {
  mocks.settings.aiSettings.provider = 'ollama';
  const pending = pendingCheck();
  render(<AIPanel />);
  testConnection();
  fireEvent.change(screen.getByDisplayValue(value), { target: { value: value + '-changed' } });
  await act(async () => pending.resolve(true));
  expect(screen.queryByText('Connected')).toBeNull();
});

test('clears a successful check when its configuration is edited', async () => {
  mocks.settings.aiSettings.provider = 'ollama';
  mocks.check.mockResolvedValueOnce(true);
  render(<AIPanel />);
  await act(async () => testConnection());
  expect(screen.getByText('Connected')).toBeTruthy();
  fireEvent.change(screen.getByDisplayValue('llama3.2'), { target: { value: 'new-model' } });
  expect(screen.queryByText('Connected')).toBeNull();
});
