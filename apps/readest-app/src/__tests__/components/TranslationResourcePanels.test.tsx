import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import TranslationGlossaryPanel from '@/app/reader/components/TranslationGlossaryPanel';
import TranslationMemoryPanel from '@/app/reader/components/TranslationMemoryPanel';
import {
  createTranslationGlossary,
  serializeMemoryInterchange,
  TranslationMemory,
  type TranslationGlossaryStore,
} from '@/services/translators';
import type { AppService } from '@/types/system';

const mocks = vi.hoisted(() => ({
  selectFiles: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, values?: Record<string, unknown>) => {
    let result = key;
    for (const [name, value] of Object.entries(values ?? {})) {
      result = result.replace(`{{${name}}}`, String(value));
    }
    return result;
  },
}));

vi.mock('@/hooks/useFileSelector', () => ({
  useFileSelector: () => ({ selectFiles: mocks.selectFiles }),
}));

const createAppService = () => ({
  ask: vi.fn().mockResolvedValue(true),
  saveFile: vi.fn().mockResolvedValue('/saved/file'),
  openFile: vi.fn(),
});

beforeEach(() => {
  mocks.selectFiles.mockReset();
  mocks.selectFiles.mockResolvedValue({ files: [], error: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TranslationGlossaryPanel', () => {
  test('validates, saves, edits, and deletes local glossary entries', async () => {
    const appService = createAppService();
    const store = { save: vi.fn().mockResolvedValue(undefined) };
    const onChange = vi.fn();
    const { rerender } = render(
      <TranslationGlossaryPanel
        appService={appService as unknown as AppService}
        store={store as unknown as TranslationGlossaryStore}
        glossary={createTranslationGlossary([], 1)}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Source term' }), {
      target: { value: 'cat' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Target term' }), {
      target: { value: '猫' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Source language' }), {
      target: { value: 'en' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Target language' }), {
      target: { value: 'zh-CN' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(1));
    const saved = store.save.mock.calls[0]![0];
    expect(saved.entries).toEqual([
      expect.objectContaining({
        source: 'cat',
        target: '猫',
        sourceLang: 'en',
        targetLang: 'zh-CN',
      }),
    ]);
    expect(onChange).toHaveBeenCalledWith(saved);

    rerender(
      <TranslationGlossaryPanel
        appService={appService as unknown as AppService}
        store={store as unknown as TranslationGlossaryStore}
        glossary={saved}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Target term' }), {
      target: { value: '小猫' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(2));
    const edited = store.save.mock.calls[1]![0];
    expect(edited.entries[0].source).toBe('cat');
    expect(edited.entries[0].target).toBe('小猫');

    rerender(
      <TranslationGlossaryPanel
        appService={appService as unknown as AppService}
        store={store as unknown as TranslationGlossaryStore}
        glossary={edited}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(3));
    expect(appService.ask).toHaveBeenCalledWith('Delete this glossary entry?');
    expect(store.save.mock.calls[2]![0].entries).toHaveLength(0);
  });

  test('shows duplicate, picker, and export failures without replacing persisted data', async () => {
    const existing = createTranslationGlossary([{ source: 'cat', target: '猫' }], 1);
    const appService = createAppService();
    const store = { save: vi.fn().mockResolvedValue(undefined) };
    render(
      <TranslationGlossaryPanel
        appService={appService as unknown as AppService}
        store={store as unknown as TranslationGlossaryStore}
        glossary={existing}
        onChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Source term' }), {
      target: { value: 'CAT' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Target term' }), {
      target: { value: '猫咪' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        'Duplicate glossary source term for the same language direction: cat',
      ),
    );
    expect(store.save).not.toHaveBeenCalled();

    mocks.selectFiles.mockResolvedValue({ files: [], error: 'picker unavailable' });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByText('picker unavailable')).toBeTruthy());

    appService.saveFile.mockRejectedValue(new Error('disk full'));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(screen.getByText('disk full')).toBeTruthy());
  });
});

describe('TranslationMemoryPanel', () => {
  const remember = (memory: TranslationMemory, sourceText: string, translatedText: string) =>
    memory.remember(
      {
        sourceText,
        sourceLang: 'en',
        targetLang: 'zh-CN',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        glossaryVersion: 2,
      },
      translatedText,
    );

  test('searches, exports, deletes, and clears the durable memory model', async () => {
    const memory = new TranslationMemory({ maxEntries: 10 });
    await remember(memory, 'cat', '猫');
    await remember(memory, 'dog', '狗');
    const appService = createAppService();
    const onChange = vi.fn();
    render(
      <TranslationMemoryPanel
        appService={appService as unknown as AppService}
        memory={memory}
        glossaryVersion={3}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('cat')).toBeTruthy();
    expect(screen.getByText('dog')).toBeTruthy();
    expect(document.body.textContent).toContain('2 entries use an older glossary version');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search translation memory' }), {
      target: { value: 'dog' },
    });
    expect(screen.queryByText('cat')).toBeNull();
    expect(screen.getByText('dog')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Translation memory export format' }), {
      target: { value: 'tmx' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(appService.saveFile).toHaveBeenCalledTimes(1));
    expect(appService.saveFile.mock.calls[0]![0]).toBe('BabelLeaf-translation-memory.tmx');
    expect(appService.saveFile.mock.calls[0]![1]).toContain('<tmx');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(memory.size()).toBe(1));
    expect(onChange).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search translation memory' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(memory.size()).toBe(0));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  test('imports a validated local file and reports picker or export failures', async () => {
    const memory = new TranslationMemory({ maxEntries: 10 });
    const imported = new TranslationMemory({ maxEntries: 10 });
    await remember(imported, 'bird', '鸟');
    const payload = serializeMemoryInterchange(imported.snapshot(), 'json');
    const appService = createAppService();
    const onChange = vi.fn();
    mocks.selectFiles.mockResolvedValue({
      files: [
        {
          name: 'memory.json',
          file: { name: 'memory.json', text: async () => payload },
        },
      ],
      error: null,
    });
    render(
      <TranslationMemoryPanel
        appService={appService as unknown as AppService}
        memory={memory}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(memory.size()).toBe(1));
    expect(screen.getByText('bird')).toBeTruthy();
    expect(onChange).toHaveBeenCalledTimes(1);

    mocks.selectFiles.mockResolvedValue({ files: [], error: 'picker unavailable' });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByText('picker unavailable')).toBeTruthy());

    appService.saveFile.mockRejectedValue(new Error('disk full'));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(screen.getByText('disk full')).toBeTruthy());
  });
});
