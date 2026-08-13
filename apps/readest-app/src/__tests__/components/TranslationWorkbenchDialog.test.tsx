import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import TranslationWorkbenchDialog from '@/app/reader/components/TranslationWorkbenchDialog';

const mocks = vi.hoisted(() => {
  const artifact = {
    bookHash: 'book-hash',
    provider: 'deepseek',
    sourceLang: 'en',
    targetLang: 'zh-CN',
    promptVersion: 'test-v1',
    updatedAt: 1,
    segments: [
      {
        id: 'segment-1',
        sourceText: 'Hello',
        translatedText: '你好',
        sourceLang: 'en',
        targetLang: 'zh-CN',
        status: 'translated',
      },
    ],
  };
  const completedSnapshot = {
    id: 'job-1',
    bookHash: 'book-hash',
    kind: 'book',
    status: 'completed',
    total: 1,
    completed: 1,
    failed: 0,
    items: [{ id: 'segment-1', status: 'completed' }],
    createdAt: 1,
    updatedAt: 2,
  };
  return {
    artifact,
    completedSnapshot,
    artifactLoad: vi.fn(),
    artifactSave: vi.fn(),
    jobsList: vi.fn(),
    jobsRemove: vi.fn(),
    jobsPrune: vi.fn(),
    glossaryLoad: vi.fn(),
    memoryLoad: vi.fn(),
    extractItems: vi.fn(),
    controllerStart: vi.fn(),
    controllerResume: vi.fn(),
    controllerRetry: vi.fn(),
    controllerSubscribe: vi.fn(),
    controllerCancel: vi.fn(),
    controllerPause: vi.fn(),
    selectFiles: vi.fn(),
    translate: vi.fn(),
    saveFile: vi.fn(),
    openFile: vi.fn(),
    ask: vi.fn(),
    saveViewSettings: vi.fn(),
    onClose: vi.fn(),
    appService: {},
    envConfig: { platform: 'windows' },
  };
});

mocks.appService = {
  saveFile: mocks.saveFile,
  openFile: mocks.openFile,
  ask: mocks.ask,
};

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService, envConfig: mocks.envConfig }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useFileSelector', () => ({
  useFileSelector: () => ({ selectFiles: mocks.selectFiles }),
}));

vi.mock('@/hooks/useTranslator', () => ({
  useTranslator: () => ({ translate: mocks.translate }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({
      book: {
        hash: 'book-hash',
        title: 'Local book',
        format: 'EPUB',
        primaryLanguage: 'en',
      },
      bookDoc: { sections: [{ id: 'chapter-1', linear: 'yes' }] },
    }),
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => null,
    getViewSettings: () => ({
      translationProvider: 'deepseek',
      translateTargetLang: 'zh-CN',
      translationWorkbenchPage: 0,
    }),
  }),
}));

vi.mock('@/utils/misc', () => ({ getLocale: () => 'zh-CN' }));

vi.mock('@/helpers/settings', () => ({
  saveViewSettings: mocks.saveViewSettings,
}));

vi.mock('@/components/Dialog', () => ({
  default: ({
    isOpen,
    title,
    children,
    onClose,
  }: React.PropsWithChildren<{ isOpen: boolean; title: string; onClose: () => void }>) =>
    isOpen ? (
      <section aria-label={title}>
        <button type='button' onClick={onClose}>
          Close
        </button>
        {children}
      </section>
    ) : null,
}));

vi.mock('@/components/SegmentedControl', () => ({
  default: ({
    options,
    onChange,
  }: {
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
  }) => (
    <nav aria-label='Translation workspace'>
      {options.map((option) => (
        <button key={option.value} type='button' onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </nav>
  ),
}));

vi.mock('@/app/reader/components/BilingualTranslationView', () => ({
  default: ({ pairs }: { pairs: Array<{ sourceText: string; translatedText: string }> }) => (
    <div data-testid='review-pairs'>
      {pairs.map((pair) => `${pair.sourceText}:${pair.translatedText}`).join('|')}
    </div>
  ),
}));

vi.mock('@/app/reader/components/TranslationGlossaryPanel', () => ({
  default: () => <div>Glossary panel direct entry</div>,
}));

vi.mock('@/app/reader/components/TranslationMemoryPanel', () => ({
  default: () => <div>Memory panel direct entry</div>,
}));

vi.mock('@/services/translators/batch', () => {
  class TranslationExtractionError extends Error {
    code = 'unsupported';
  }
  class TranslationBatchController {
    static restore = vi.fn(async () => new TranslationBatchController());
    subscribe(callback: (snapshot: unknown) => void) {
      mocks.controllerSubscribe(callback);
      return () => undefined;
    }
    start() {
      return mocks.controllerStart();
    }
    resume() {
      return mocks.controllerResume();
    }
    retryFailed() {
      return mocks.controllerRetry();
    }
    pause() {
      mocks.controllerPause();
    }
    cancel() {
      mocks.controllerCancel();
    }
    getArtifact() {
      return mocks.artifact;
    }
    getSnapshot() {
      return mocks.completedSnapshot;
    }
  }
  return {
    createEmptyTranslationArtifact: () => mocks.artifact,
    extractTranslationItems: mocks.extractItems,
    TranslationBatchController,
    TranslationExtractionError,
  };
});

vi.mock('@/services/translators', () => {
  class TranslationArtifactStore {
    load() {
      return mocks.artifactLoad();
    }
    save(value: unknown) {
      return mocks.artifactSave(value);
    }
  }
  class TranslationJobStore {
    list() {
      return mocks.jobsList();
    }
    remove(id: string) {
      return mocks.jobsRemove(id);
    }
    prune(options: unknown) {
      return mocks.jobsPrune(options);
    }
  }
  class TranslationGlossaryStore {
    load() {
      return mocks.glossaryLoad();
    }
  }
  class TranslationMemoryFileStore {}
  class TranslationMemory {
    static load() {
      return mocks.memoryLoad();
    }
  }
  return {
    TranslationArtifactStore,
    TranslationJobStore,
    TranslationGlossaryStore,
    TranslationMemoryFileStore,
    TranslationMemory,
    TRANSLATION_PROMPT_VERSION: 'test-v1',
    parseTranslationSidecar: (value: unknown) => value,
    serializeTranslationSidecar: () => '{"artifact":true}',
    getInterchangeMimeType: () => 'application/json',
    getTranslationInterchangeFormat: () => 'json',
    parseReviewInterchange: (value: unknown) => value,
    serializeReviewInterchange: () => 'review',
    toTranslationReviewPairs: () => [
      {
        id: 'segment-1',
        sourceText: 'Hello',
        translatedText: '你好',
        sourceLang: 'en',
        targetLang: 'zh-CN',
        status: 'translated',
      },
    ],
    reviewTranslationSegment: () => mocks.artifact,
    revertTranslationSegment: () => mocks.artifact,
    diagnoseTranslationFormat: () => ({ message: 'Unsupported format' }),
  };
});

beforeEach(() => {
  for (const mock of [
    mocks.artifactLoad,
    mocks.artifactSave,
    mocks.jobsList,
    mocks.jobsRemove,
    mocks.jobsPrune,
    mocks.glossaryLoad,
    mocks.memoryLoad,
    mocks.extractItems,
    mocks.controllerStart,
    mocks.controllerResume,
    mocks.controllerRetry,
    mocks.controllerSubscribe,
    mocks.controllerCancel,
    mocks.controllerPause,
    mocks.selectFiles,
    mocks.translate,
    mocks.saveFile,
    mocks.openFile,
    mocks.ask,
    mocks.saveViewSettings,
    mocks.onClose,
  ]) {
    mock.mockReset();
  }
  mocks.artifactLoad.mockResolvedValue(null);
  mocks.artifactSave.mockResolvedValue(undefined);
  mocks.jobsList.mockResolvedValue([]);
  mocks.glossaryLoad.mockResolvedValue(null);
  mocks.memoryLoad.mockResolvedValue({ snapshot: () => ({ entries: [] }) });
  mocks.extractItems.mockResolvedValue([{ id: 'segment-1', text: 'Hello' }]);
  mocks.controllerStart.mockResolvedValue(mocks.completedSnapshot);
  mocks.controllerResume.mockResolvedValue(mocks.completedSnapshot);
  mocks.controllerRetry.mockResolvedValue(mocks.completedSnapshot);
  mocks.selectFiles.mockResolvedValue({ files: [], error: null });
  mocks.translate.mockResolvedValue(['你好']);
  mocks.saveFile.mockResolvedValue('/saved/file');
  mocks.ask.mockResolvedValue(true);
  mocks.saveViewSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TranslationWorkbenchDialog', () => {
  test('loads a local artifact, starts a batch job, and exposes every workspace entry', async () => {
    render(
      <TranslationWorkbenchDialog bookKey='book-hash-window' isOpen onClose={mocks.onClose} />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mocks.controllerStart).toHaveBeenCalledTimes(1));
    expect(mocks.extractItems).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('1/1 (100%) · 0 failed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByTestId('review-pairs').textContent).toBe('Hello:你好');
    fireEvent.click(screen.getByRole('button', { name: 'Glossary' }));
    expect(screen.getByText('Glossary panel direct entry')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Memory' }));
    expect(screen.getByText('Memory panel direct entry')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mocks.onClose).toHaveBeenCalledTimes(1);
  });

  test('reports file-picker and export failures in the workbench instead of rejecting silently', async () => {
    mocks.selectFiles.mockResolvedValue({ files: [], error: 'picker unavailable' });
    mocks.saveFile.mockRejectedValue(new Error('disk full'));
    render(
      <TranslationWorkbenchDialog bookKey='book-hash-window' isOpen onClose={mocks.onClose} />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByText('picker unavailable')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(screen.getByText('disk full')).toBeTruthy());
  });

  test('does not initialize stores or expose content while closed', async () => {
    render(
      <TranslationWorkbenchDialog
        bookKey='book-hash-window'
        isOpen={false}
        onClose={mocks.onClose}
      />,
    );

    expect(screen.queryByLabelText('Translation')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.artifactLoad).not.toHaveBeenCalled();
    expect(mocks.jobsList).not.toHaveBeenCalled();
  });
});
