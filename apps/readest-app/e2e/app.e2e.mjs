import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeFormatFixtures = [
  { format: 'EPUB', path: path.join(appRoot, 'src/__tests__/fixtures/data/sample-alice.epub') },
  { format: 'PDF', path: path.join(appRoot, 'src/__tests__/fixtures/data/sample-alice.pdf') },
  { format: 'MOBI', path: path.join(appRoot, 'src/__tests__/fixtures/data/sample-war-peace.mobi') },
  {
    format: 'AZW',
    path: path.join(appRoot, 'src/__tests__/.babelleaf-wdio-fixtures/AZW/valid.azw'),
  },
  { format: 'AZW3', path: path.join(appRoot, 'src/__tests__/fixtures/data/sample-babelleaf.azw3') },
  { format: 'FB2', path: path.join(appRoot, 'src/__tests__/fixtures/data/sample-metadata.fb2') },
  {
    format: 'FBZ',
    path: path.join(appRoot, 'src/__tests__/.babelleaf-wdio-fixtures/FBZ/image-only.fbz'),
  },
  { format: 'CBZ', path: path.join(appRoot, 'src/__tests__/fixtures/data/sample-metadata.cbz') },
  { format: 'TXT', path: path.join(appRoot, 'src/__tests__/fixtures/data/sample-alice.txt') },
  { format: 'MD', path: path.join(appRoot, 'src/__tests__/fixtures/data/sample-fixture.md') },
];

const setSelectValue = async (selector, value) =>
  browser.execute(
    (targetSelector, nextValue) => {
      const select = document.querySelector(targetSelector);
      if (!(select instanceof HTMLSelectElement)) {
        throw new Error(`Select not found: ${targetSelector}`);
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (!setter) throw new Error('HTMLSelectElement value setter is unavailable');
      setter.call(select, nextValue);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
    selector,
    value,
  );

const openDictionarySettings = async () => {
  const languageTab = await $('[data-tab="Language"]');
  if (!(await languageTab.isExisting())) {
    const settingsMenu = await $('[data-testid="library-settings-menu"]');
    await settingsMenu.waitForDisplayed({ timeout: 10000 });
    await settingsMenu.click();
    const openSettings = await $('[data-testid="open-settings"]');
    await openSettings.waitForDisplayed({ timeout: 10000 });
    await openSettings.click();
  }

  const visibleLanguageTab = await $('[data-tab="Language"]');
  await visibleLanguageTab.waitForDisplayed({ timeout: 10000 });
  await visibleLanguageTab.click();
  const manageDictionaries = await $('[data-testid="manage-dictionaries"]');
  await manageDictionaries.waitForDisplayed({ timeout: 10000 });
  await manageDictionaries.click();
  await $('[data-testid="custom-dictionaries"]').waitForDisplayed({ timeout: 10000 });
};

// Native desktop acceptance tests intentionally use plain ESM so the Windows
// runner does not require a TypeScript loader before a WebDriver session exists.
describe('Readest App Launch', () => {
  it('should have a visible body element', async () => {
    const body = await $('body');
    await body.waitForDisplayed({ timeout: 10000 });
    expect(await body.isDisplayed()).toBe(true);
  });

  it('should have the correct window handle', async () => {
    const handle = await browser.getWindowHandle();
    expect(handle).toBeTruthy();
  });

  it('should return the page source', async () => {
    const source = await browser.getPageSource();
    expect(source).toContain('html');
  });
});

describe('Library Page', () => {
  it('should navigate to the library page', async () => {
    const url = await browser.getUrl();
    expect(url).toMatch(/library|localhost/);
  });

  it('should display the library container', async () => {
    const library = await $('[data-testid="library-page"]');
    await library.waitForExist({ timeout: 15000 });
    expect(await library.isExisting()).toBe(true);
  });

  it('should display the library header', async () => {
    const header = await $('[data-testid="library-header"]');
    await header.waitForExist({ timeout: 10000 });
    expect(await header.isExisting()).toBe(true);
  });

  it('should display the bookshelf area', async () => {
    const bookshelf = await $('[data-testid="library-bookshelf"]');
    const emptyState = await $('[data-testid="library-empty-state"]');
    await browser.waitUntil(
      async () => (await bookshelf.isExisting()) || (await emptyState.isExisting()),
      { timeout: 10000, timeoutMsg: 'The library content did not render' },
    );
    expect((await bookshelf.isExisting()) || (await emptyState.isExisting())).toBe(true);
  });

  it('should have a search input', async () => {
    const searchInput = await $('[data-testid="library-search-input"]');
    await searchInput.waitForExist({ timeout: 10000 });
    expect(await searchInput.isExisting()).toBe(true);
  });

  it('should allow typing in the search input', async () => {
    const searchInput = await $('[data-testid="library-search-input"]');
    await searchInput.waitForDisplayed({ timeout: 10000 });
    await searchInput.setValue('test search');
    const value = await searchInput.getValue();
    expect(value).toBe('test search');
  });

  it('should show the clear search button after typing', async () => {
    const clearBtn = await $('[data-testid="library-clear-search"]');
    await clearBtn.waitForExist({ timeout: 5000 });
    expect(await clearBtn.isExisting()).toBe(true);
  });

  it('should clear the search input when clear button is clicked', async () => {
    const clearBtn = await $('[data-testid="library-clear-search"]');
    await clearBtn.click();
    const searchInput = await $('[data-testid="library-search-input"]');
    const value = await searchInput.getValue();
    expect(value).toBe('');
  });

  it('should have a select books button', async () => {
    const selectBtn = await $('[data-testid="library-select-books"]');
    await selectBtn.waitForExist({ timeout: 10000 });
    expect(await selectBtn.isExisting()).toBe(true);
  });

  it('should have an import books button', async () => {
    const importBtn = await $('[data-testid="library-import-books"]');
    await importBtn.waitForExist({ timeout: 10000 });
    expect(await importBtn.isExisting()).toBe(true);
  });
});

describe('Native local format import matrix', () => {
  it('should import every supported local PC format through the Tauri file service', async () => {
    const testBridgeAvailable = await browser.execute(
      () => window.__BABELLEAF_WEBDRIVER__ === true,
    );
    expect(testBridgeAvailable).toBe(true);

    await browser.execute((paths) => {
      window.__BABELLEAF_E2E_FILE_SELECTION = paths;
    }, nativeFormatFixtures.map((fixture) => fixture.path));

    await $('[data-testid="library-import-books"]').click();
    const importFiles = await $('[data-testid="import-books-from-files"]');
    await importFiles.waitForDisplayed({ timeout: 10000 });
    await importFiles.click();

    const successToast = await $('[data-testid="app-toast"][data-toast-type="success"]');
    await successToast.waitForDisplayed({ timeout: 120000 });
    expect(await successToast.getText()).toContain(String(nativeFormatFixtures.length));
    expect(await $('[data-testid="failed-imports-dialog"]').isExisting()).toBe(false);
    expect((await $$('[data-book-hash]')).length).toBeGreaterThan(0);
  });
});

describe('Simplified Chinese UI', () => {
  it('should switch the native application shell to Simplified Chinese', async () => {
    const settingsMenu = await $('[data-testid="library-settings-menu"]');
    await settingsMenu.click();

    const openSettings = await $('[data-testid="open-settings"]');
    await openSettings.waitForDisplayed({ timeout: 10000 });
    await openSettings.click();

    const languageTab = await $('[data-tab="Language"]');
    await languageTab.waitForDisplayed({ timeout: 10000 });
    await languageTab.click();

    const languageSelector = '[data-setting-id="settings.language.interfaceLanguage"] select';
    const languageSelect = await $(languageSelector);
    await languageSelect.waitForDisplayed({ timeout: 10000 });

    await setSelectValue(languageSelector, 'en');
    await browser.waitUntil(
      async () =>
        (await browser.execute(() => document.documentElement.lang)).startsWith('en') &&
        (await $('[data-testid="library-import-books"]').getAttribute('aria-label')) ===
          'Import Books',
      { timeout: 10000, timeoutMsg: 'The English UI did not become active' },
    );

    await setSelectValue(languageSelector, 'zh-CN');

    try {
      await browser.waitUntil(
        async () => {
          const lang = await browser.execute(() => document.documentElement.lang);
          const placeholder = await $('[data-testid="library-search-input"]').getAttribute(
            'placeholder',
          );
          return (
            lang === 'zh-CN' &&
            (placeholder === '搜索书籍...' || /^在 \d+ 本书籍中搜索\.\.\.$/.test(placeholder))
          );
        },
        { timeout: 10000, timeoutMsg: 'The Simplified Chinese UI did not become active' },
      );
    } catch (error) {
      const state = await browser.execute(() => ({
        lang: document.documentElement.lang,
        selectedLanguage: document.querySelector(
          '[data-setting-id="settings.language.interfaceLanguage"] select',
        )?.value,
        searchPlaceholder: document
          .querySelector('[data-testid="library-search-input"]')
          ?.getAttribute('placeholder'),
        importLabel: document
          .querySelector('[data-testid="library-import-books"]')
          ?.getAttribute('aria-label'),
      }));
      throw new Error(`${error.message}; actual state: ${JSON.stringify(state)}`);
    }
    expect(await $('[data-testid="library-import-books"]').getAttribute('aria-label')).toBe(
      '导入书籍',
    );
    expect(
      await browser.execute(
        () =>
          document.querySelector('[data-setting-id="settings.language.interfaceLanguage"] select')
            ?.value,
      ),
    ).toBe('zh-CN');
  });
});

describe('Native local dictionaries', () => {
  it('should import, persist, enable, and remove a real local MDict bundle', async () => {
    await openDictionarySettings();

    const dictionaryDirectory = path.join(
      appRoot,
      'src',
      '__tests__',
      'fixtures',
      'data',
      'dicts',
    );
    const fixtures = [
      path.join(dictionaryDirectory, 'mdict-en-en.mdx'),
      path.join(dictionaryDirectory, 'mdict-en-en.mdd'),
    ];
    const testBridgeAvailable = await browser.execute(
      () => window.__BABELLEAF_WEBDRIVER__ === true,
    );
    expect(testBridgeAvailable).toBe(true);
    await browser.execute((paths) => {
      window.__BABELLEAF_E2E_FILE_SELECTION = paths;
    }, fixtures);
    await $('[data-testid="import-dictionary"]').click();

    const importedRow = await $('[data-testid="dictionary-row"][data-dictionary-kind="mdict"]');
    await importedRow.waitForDisplayed({ timeout: 30000 });
    const importedToggle = await importedRow.$('input[type="checkbox"]');
    expect(await importedToggle.isSelected()).toBe(true);
    expect(await importedToggle.isEnabled()).toBe(true);

    // A renderer reload reconstructs the store from the native app-data
    // bundle instead of preserving the in-memory Zustand instance.
    await browser.refresh();
    await $('[data-testid="library-page"]').waitForExist({ timeout: 15000 });
    await openDictionarySettings();
    const restoredRow = await $('[data-testid="dictionary-row"][data-dictionary-kind="mdict"]');
    await restoredRow.waitForDisplayed({ timeout: 30000 });
    expect(await restoredRow.$('input[type="checkbox"]').isSelected()).toBe(true);

    await $('[data-testid="dictionary-delete-mode"]').click();
    const deleteButton = await restoredRow.$('[data-testid="delete-dictionary"]');
    await deleteButton.waitForDisplayed({ timeout: 10000 });
    await deleteButton.click();
    await browser.waitUntil(
      async () =>
        !(await $('[data-testid="dictionary-row"][data-dictionary-kind="mdict"]').isExisting()),
      { timeout: 15000, timeoutMsg: 'The imported dictionary was not removed from the native UI' },
    );
  });
});

describe('Window Management', () => {
  it('should return the window size', async () => {
    const size = await browser.getWindowSize();
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  it('should render the supported minimum viewport without horizontal overflow', async () => {
    // The Rust contract independently asserts min_inner_size(480, 360). Render
    // that supported minimum through the application's Tauri window command;
    // avoid tauri-plugin-webdriver 0.2.1 executeAsync/window-rect endpoints,
    // which emit spurious null/u32 conversion errors on Windows.
    await browser.execute(() => {
      window.__BABELLEAF_WINDOW_SIZE_RESULT__ = {
        done: false,
        error: '',
        width: 0,
        height: 0,
      };
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function') {
        window.__BABELLEAF_WINDOW_SIZE_RESULT__ = {
          done: true,
          error: 'Tauri invoke is unavailable',
          width: 0,
          height: 0,
        };
        return;
      }
      void invoke('plugin:window|set_size', {
        label: 'main',
        value: { Logical: { width: 480, height: 360 } },
      })
        .then(
          () =>
            new Promise((resolve) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() =>
                  resolve({
                    done: true,
                    error: '',
                    width: document.documentElement.clientWidth,
                    height: document.documentElement.clientHeight,
                  }),
                ),
              );
            }),
        )
        .then(
          (result) => {
            window.__BABELLEAF_WINDOW_SIZE_RESULT__ = result;
          },
          (error) => {
            window.__BABELLEAF_WINDOW_SIZE_RESULT__ = {
              done: true,
              error: String(error),
              width: 0,
              height: 0,
            };
          },
        );
    });
    await browser.waitUntil(
      async () =>
        browser.execute(() => window.__BABELLEAF_WINDOW_SIZE_RESULT__?.done === true),
      { timeout: 10000, timeoutMsg: 'The native minimum-size render did not complete' },
    );
    const viewport = await browser.execute(() => window.__BABELLEAF_WINDOW_SIZE_RESULT__);
    expect(viewport.error).toBe('');
    expect(viewport.width).toBeGreaterThanOrEqual(480);
    expect(viewport.height).toBeGreaterThanOrEqual(360);

    const layout = await browser.execute(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

    const searchInput = await $('[data-testid="library-search-input"]');
    const importButton = await $('[data-testid="library-import-books"]');
    expect(await searchInput.isDisplayed()).toBe(true);
    expect(await importButton.isDisplayed()).toBe(true);
  });
});

describe('JavaScript Execution', () => {
  it('should execute JavaScript in the app context', async () => {
    const result = await browser.execute(() => {
      return document.readyState;
    });
    expect(result).toBe('complete');
  });

  it('should access the document title via JS', async () => {
    const title = await browser.execute(() => {
      return document.title;
    });
    expect(title).toContain('BabelLeaf');
  });

  it('should expose WebGL required by the page-curl renderer', async () => {
    const hasWebGl = await browser.execute(() => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl');
      context?.getExtension('WEBGL_lose_context')?.loseContext();
      return context !== null;
    });
    expect(hasWebGl).toBe(true);
  });
});

describe('Windows speech synthesis', () => {
  it('should enumerate voices and complete muted utterances for available language packs', async () => {
    await browser.execute((samples) => {
      window.__BABELLEAF_TTS_RESULT__ = {
        done: false,
        failure: null,
        results: [],
        unavailable: [],
        voiceCount: 0,
      };
      let finished = false;
      const finish = (result) => {
        if (finished) return;
        finished = true;
        window.__BABELLEAF_TTS_RESULT__ = { done: true, ...result };
      };
      const deadline = window.setTimeout(() => {
        window.speechSynthesis.cancel();
        finish({
          failure: 'speech synthesis timed out',
          results: [],
          unavailable: [],
          voiceCount: 0,
        });
      }, 30000);

      const getVoices = async () => {
        const voiceDeadline = Date.now() + 15000;
        while (Date.now() < voiceDeadline) {
          const current = window.speechSynthesis.getVoices();
          if (current.length > 0) return current;
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
        return window.speechSynthesis.getVoices();
      };

      void getVoices().then(async (voices) => {
        const completed = [];
        const unavailable = [];
        for (const sample of samples) {
          const voice = voices.find((candidate) =>
            candidate.lang.toLowerCase().startsWith(sample.language.toLowerCase()),
          );
          if (!voice) {
            unavailable.push(sample.language);
            continue;
          }

          const result = await new Promise((resolve) => {
            const utterance = new SpeechSynthesisUtterance(sample.text);
            utterance.lang = voice.lang;
            utterance.voice = voice;
            utterance.volume = 0;
            utterance.onend = () =>
              resolve({ language: sample.language, voice: voice.name, ended: true });
            utterance.onerror = (event) =>
              resolve({
                language: sample.language,
                voice: voice.name,
                ended: false,
                error: event.error,
              });
            window.speechSynthesis.speak(utterance);
          });
          completed.push(result);
        }
        window.clearTimeout(deadline);
        finish({ failure: null, results: completed, unavailable, voiceCount: voices.length });
      });
    }, [
      { language: 'en', text: 'BabelLeaf speech verification.' },
      { language: 'ja', text: '音声読み上げの確認です。' },
      { language: 'zh', text: '这是语音朗读验证。' },
    ]);
    await browser.waitUntil(
      async () => browser.execute(() => window.__BABELLEAF_TTS_RESULT__?.done === true),
      { timeout: 35000, timeoutMsg: 'Windows speech synthesis did not complete' },
    );
    const results = await browser.execute(() => window.__BABELLEAF_TTS_RESULT__);

    expect(results.failure).toBeNull();
    expect(results.voiceCount).toBeGreaterThan(0);
    expect(results.results.some((result) => result.language === 'en')).toBe(true);
    expect(
      [...results.results.map((result) => result.language), ...results.unavailable].sort(),
    ).toEqual(['en', 'ja', 'zh']);
    for (const result of results.results) {
      expect(result.ended).toBe(true);
      expect(result.error).toBeUndefined();
    }
  });
});

describe('Navigation', () => {
  it('should navigate back to library after visiting another route', async () => {
    const currentUrl = await browser.getUrl();
    await browser.url(currentUrl.replace(/\/[^/]*$/, '/library'));
    const library = await $('[data-testid="library-page"]');
    await library.waitForExist({ timeout: 15000 });
    expect(await library.isExisting()).toBe(true);
  });
});

describe('Native IPC diagnostics', () => {
  it('should switch the WebView2 memory target without an ACL rejection', async () => {
    await browser.execute(() => {
      window.__BABELLEAF_MEMORY_TARGET_RESULT__ = { done: false, error: '' };
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function') {
        window.__BABELLEAF_MEMORY_TARGET_RESULT__ = {
          done: true,
          error: 'Tauri invoke is unavailable',
        };
        return;
      }
      Promise.resolve()
        .then(() => invoke('set_webview_memory_usage', { low: true }))
        .then(() => invoke('set_webview_memory_usage', { low: false }))
        .then(
          () => {
            window.__BABELLEAF_MEMORY_TARGET_RESULT__ = { done: true, error: '' };
          },
          (error) => {
            window.__BABELLEAF_MEMORY_TARGET_RESULT__ = {
              done: true,
              error: String(error),
            };
          },
        );
    });
    await browser.waitUntil(
      async () =>
        browser.execute(() => window.__BABELLEAF_MEMORY_TARGET_RESULT__?.done === true),
      { timeout: 10000, timeoutMsg: 'The WebView2 memory target command did not complete' },
    );
    const result = await browser.execute(() => window.__BABELLEAF_MEMORY_TARGET_RESULT__);
    expect(result.error).toBe('');
  });

  it('should not issue non-loopback application traffic during local workflows', async () => {
    const traffic = await browser.execute(() => {
      const loopbackHosts = new Set([
        '127.0.0.1',
        'localhost',
        '[::1]',
        'tauri.localhost',
        'ipc.localhost',
        'asset.localhost',
      ]);
      return (window.__BABELLEAF_WEBDRIVER_TRAFFIC__ || []).filter((entry) => {
        if (entry.kind === 'tauri-http') return true;
        try {
          return !loopbackHosts.has(new URL(entry.target, window.location.href).hostname);
        } catch {
          return true;
        }
      });
    });
    expect(traffic).toEqual([]);
  });

  it('should finish without rejected Tauri commands', async () => {
    const failures = await browser.execute(
      () => window.__BABELLEAF_WEBDRIVER_INVOKE_FAILURES__ || [],
    );
    expect(failures).toEqual([]);
  });

  it('should schedule a clean test-application exit', async () => {
    const scheduled = await browser.execute(() => {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function') return false;
      window.setTimeout(() => {
        void invoke('plugin:process|exit', { code: 0 });
      }, 2000);
      return true;
    });
    expect(scheduled).toBe(true);
  });
});
