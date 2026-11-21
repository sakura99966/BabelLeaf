// Acceptance-only driver. It connects to the owned standard packaged WebView;
// no dev server, test Rust command, production hook or paid provider is used.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

export function makePackagedPcSettings(baseUrl) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('PC acceptance requires its owned loopback fixture');
  const view = { uiLanguage: 'en', translationEnabled: false, translationProvider: 'ollama', translateTargetLang: 'ZH-CN' };
  return {
    version: 1, openBookInNewWindow: false, openLastBooks: false,
    aiSettings: { provider: 'ollama', ollamaBaseUrl: baseUrl, ollamaModel: 'babelleaf-acceptance' },
    globalViewSettings: view, globalReadSettings: view,
  };
}

export async function startPackagedOllamaFixture() {
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1024 * 1024) throw new Error('Oversized acceptance request');
      }
      const data = body ? JSON.parse(body) : {};
      requests.push({ path: req.url, method: req.method, model: data.model,
        bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') });
      if (requests.length > 512) throw new Error('Unbounded acceptance requests');
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET' && req.url === '/api/tags') {
        res.end(JSON.stringify({ models: [{ name: 'babelleaf-acceptance', model: 'babelleaf-acceptance' }] }));
      } else if (req.method === 'POST' && req.url === '/api/chat' &&
        data.model === 'babelleaf-acceptance' && data.stream === false) {
        res.end(JSON.stringify({ model: data.model, created_at: new Date().toISOString(),
          message: { role: 'assistant', content: '本地验收译文。' }, done: true, done_reason: 'stop',
          prompt_eval_count: 8, eval_count: 8, total_duration: 1000000 }));
      } else { res.statusCode = 404; res.end(JSON.stringify({ error: 'Unexpected acceptance request' })); }
    } catch {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid acceptance request' }));
    }
  });
  await new Promise((done, fail) => server.once('error', fail).listen(0, '127.0.0.1', done));
  return { baseUrl: 'http://127.0.0.1:' + server.address().port, requests,
    close: () => new Promise((done, fail) => {
      server.close((error) => error ? fail(error) : done());
      server.closeAllConnections();
    }) };
}

export async function runPackagedPcWorkflows({ port, runtime, appRoot, outputDirectory, fixture, full = true }) {
  const { chromium, expect } = await import('@playwright/test');
  const { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } = await import('@zip.js/zip.js');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  const page = browser.contexts()[0]?.pages().find((p) => /tauri[.:/]/.test(p.url()));
  if (!page) throw new Error('No owned packaged page');
  page.setDefaultTimeout(20000);
  const steps = [];
  const artifacts = [];
  const inputs = [];
  const consoleMessages = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()) && consoleMessages.length < 30)
      consoleMessages.push(message.type() + ': ' + message.text().slice(0, 1000));
  });
  page.on('pageerror', (error) => {
    if (consoleMessages.length < 30) consoleMessages.push(String(error).slice(0, 1000));
  });
  const run = async (name, action) => {
    const begin = performance.now();
    try {
      await action();
      steps.push({ name, passed: true, durationMs: performance.now() - begin });
      console.log('[BabelLeaf packaged PC] PASS: ' + name);
    } catch (error) {
      steps.push({ name, passed: false, error: String(error).slice(0, 2000) });
      throw error;
    }
  };
  const drop = async (file) => {
    const data = await readFile(file);
    inputs.push({ name: basename(file), bytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'), path: file });
    await page.evaluate(({ name, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (item) => item.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], name));
      document.querySelector('.library-page').dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, dataTransfer: transfer,
      }));
    }, { name: basename(file), base64: data.toString('base64') });
    await expect(page.locator('[data-book-format]').last()).toBeVisible({ timeout: 20000 });
  };
  const reveal = async () => {
    const box = await page.locator('.foliate-viewer').first().boundingBox();
    if (!box) throw new Error('Missing reader');
    await page.mouse.click(box.x + box.width / 2, box.y + 4);
  };
  const library = async () => {
    await page.keyboard.press('Escape');
    await reveal();
    await page.getByRole('button', { name: 'Go to Library', exact: true }).click();
    await expect(page.locator('.library-page')).toBeVisible();
  };
  const open = async (name, format) => {
    const card = page.locator('[data-book-format' + (format ? '="' + format + '"' : '') + ']')
      .filter({ hasText: name }).first();
    await card.click();
    await expect(page.locator('foliate-view').first()).toBeAttached();
    await page.waitForFunction(() => document.querySelector('foliate-view')?.renderer?.getContents?.().some(
      (entry) => entry.doc?.body?.textContent?.trim() || entry.doc?.querySelector('canvas,img'),
    ));
  };
  const workbench = async () => {
    await reveal();
    await page.getByRole('button', { name: 'View Options', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Translation', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Jobs', exact: true })).toBeVisible();
  };
  const assertNoImplicitRequests = () => {
    if (fixture.requests.length) throw new Error('Provider request before explicit translation');
  };
  const initializeProbeState = async () => {
    await page.evaluate(() => {
      // Production Tauri IPC is immutable: never replace, unlock, or claim
      // interception of it. Native pickers are exercised by the operator in
      // full mode, not answered by a hidden production test hook.
      window.__pcAcceptance = { speech: [] };
    });
  };
  try {
    await mkdir(outputDirectory, { recursive: true });
    await page.evaluate(() => localStorage.setItem('i18nextLng', 'en'));
    await page.reload();
    await expect(page.locator('.library-page')).toBeVisible();
    await page.waitForFunction(() => performance.getEntriesByName('babelleaf:library-interactive').length === 1);
    await initializeProbeState();

    await run('EPUB import, rendered reading, turns, bookmark and reload', async () => {
      await drop(join(appRoot, 'src/__tests__/fixtures/data/sample-alice.epub'));
      await open('Alice', 'EPUB');
      await page.evaluate(async () => {
        const view = document.querySelector('foliate-view');
        await view.next(); await view.next(); await view.prev();
      });
      await reveal();
      await page.getByRole('button', { name: 'Add Bookmark', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Remove Bookmark', exact: true })).toBeVisible();
      console.log('[BabelLeaf packaged PC] Bookmark toggled before restart');
      // Close through the application's durability guard before restarting
      // the WebView; a raw reload while writes are in flight is a process-kill
      // scenario, covered separately by native interruption tests.
      await library();
      await page.reload();
      await expect(page.locator('.library-page')).toBeVisible();
      await page.waitForFunction(() => performance.getEntriesByName('babelleaf:library-interactive').length === 1);
      await initializeProbeState();
      await open('Alice', 'EPUB');
      await reveal();
      await expect(page.getByRole('button', { name: 'Remove Bookmark', exact: true })).toBeVisible();
      assertNoImplicitRequests();
    });

    await run('PDF managed import and rendered page', async () => {
      await library();
      await drop(join(appRoot, 'src/__tests__/fixtures/data/sample-alice.pdf'));
      await open('Alice', 'PDF');
      assertNoImplicitRequests();
    });

    const textPath = join(runtime, 'acceptance-text.txt');
    await writeFile(textPath, 'Local Acceptance\n\n' + Array.from({ length: 12 },
      (_, i) => 'Synthetic paragraph ' + (i + 1) + ': a local reader preserves the original book.').join('\n\n'));
    await run('TXT import and full-book translation through the real native loopback adapter', async () => {
      await library();
      await drop(textPath);
      await open('acceptance-text');
      assertNoImplicitRequests();
      await workbench();
      await page.getByRole('button', { name: 'Start', exact: true }).click();
      await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible({ timeout: 60000 });
      if (!fixture.requests.some((request) => request.path === '/api/chat'))
        throw new Error('Translation did not use the native loopback adapter');
      await page.getByRole('radio', { name: 'Review', exact: true }).click();
      await expect(page.getByText('本地验收译文。', { exact: true }).first()).toBeVisible();
      await page.keyboard.press('Escape');
      const requestsBefore = fixture.requests.length;
      await page.reload();
      await expect(page.locator('foliate-view').first()).toBeAttached();
      await initializeProbeState();
      await workbench();
      await page.getByRole('radio', { name: 'Review', exact: true }).click();
      await expect(page.getByText('本地验收译文。', { exact: true }).first()).toBeVisible();
      if (fixture.requests.length !== requestsBefore) throw new Error('Reopening resent a completed translation');
    });

    const comicPath = join(runtime, 'acceptance-comic.cbz');
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 768;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 768);
      ctx.fillStyle = '#000'; ctx.font = '28px sans-serif'; ctx.fillText('Local sample.', 40, 70);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const zip = new ZipWriter(new Uint8ArrayWriter());
    await zip.add('page-001.png', new Uint8ArrayReader(Buffer.from(image, 'base64')));
    await writeFile(comicPath, await zip.close());
    await run(full
      ? 'native comic page import, edit/translation, erase, typeset and CBZ/PDF export'
      : 'packaged comic workspace entry and missing-model/manual-import diagnostics', async () => {
      await library();
      await drop(comicPath);
      await open('', 'CBZ');
      await reveal();
      await page.getByRole('button', { name: 'Comic workspace', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Import pages / CBZ / FBZ / PDF', exact: true })).toBeVisible();
      if (!full) {
        await expect(page.getByText(/Import local image files, a CBZ\/FBZ archive/)).toBeVisible();
        return;
      }
      console.log('[BabelLeaf packaged PC] NATIVE OPEN: ' + comicPath);
      // Native OS dialog input is a genuine local acceptance action. Keep it
      // available for an operator without weakening product IPC immutability.
      await page.getByRole('button', { name: 'Import pages / CBZ / FBZ / PDF', exact: true }).click({ noWaitAfter: true });
      await expect(page.getByLabel('New OCR region text')).toBeVisible({ timeout: 120000 });
      await page.getByLabel('New OCR region text').fill('Local sample.');
      await page.getByRole('button', { name: 'Add region', exact: true }).click();
      await page.getByRole('button', { name: 'Translate selected region', exact: true }).click();
      await expect(page.getByText('Translation completed and saved to the local workspace.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Erase selected region', exact: true }).click();
      await page.getByRole('button', { name: 'Save typesetting', exact: true }).click();
      for (const format of ['cbz', 'pdf']) {
        const destination = join(runtime, 'translated.' + format);
        console.log('[BabelLeaf packaged PC] NATIVE SAVE: ' + destination);
        await page.getByRole('button', { name: 'Export ' + format.toUpperCase(), exact: true }).click({ noWaitAfter: true });
        await expect.poll(async () => stat(destination).then((s) => s.size, () => 0), { timeout: 120000 }).toBeGreaterThan(0);
        const bytes = await readFile(destination);
        if (format === 'pdf' && bytes.subarray(0, 5).toString() !== '%PDF-')
          throw new Error('Invalid PDF export');
        if (format === 'cbz' && bytes.subarray(0, 2).toString() !== 'PK')
          throw new Error('Invalid CBZ export');
        await writeFile(join(outputDirectory, 'translated.' + format), bytes);
        artifacts.push({ name: 'translated.' + format, bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    });

    await run('source bytes unchanged and only expected loopback fixture routes used', async () => {
      for (const input of inputs) {
        if (createHash('sha256').update(await readFile(input.path)).digest('hex') !== input.sha256)
          throw new Error('Source modified: ' + input.name);
      }
      if (fixture.requests.some((request) => !['/api/chat', '/api/tags'].includes(request.path)))
        throw new Error('Unexpected fixture route');
    });
    await run('installed speech path rejects a nonlocal voice without dispatch', async () => {
      await library();
      await open('acceptance-text');
      await page.evaluate(() => {
        const remote = { voiceURI: 'acceptance-remote', name: 'Acceptance remote',
          lang: 'en-US', localService: false, default: true };
        localStorage.setItem('ttsPreferredVoices', JSON.stringify({ 'web-speech-en': remote.voiceURI }));
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
          getVoices: () => [remote], cancel() {}, pause() {}, resume() {},
          speak(utterance) { window.__pcAcceptance.speech.push(utterance.voice?.localService ?? null); },
        } });
      });
      const box = await page.locator('.foliate-viewer').first().boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4);
      await page.getByRole('button', { name: 'Speak', exact: true }).click();
      await expect(page.getByText('No local voice is available. Install an offline voice in system settings.')).toBeVisible();
      const dispatched = await page.evaluate(() => window.__pcAcceptance.speech);
      if (dispatched.length) throw new Error('Installed application dispatched nonlocal/default speech');
    });
    return { passed: true, mode: full ? 'full-native-dialogs' : 'automated-core',
      manualComicPending: !full, steps, inputs: inputs.map(({ path, ...input }) => input), artifacts,
      providerRequests: fixture.requests,
      scope: 'standard installed EXE copy; UI/native IO/synthetic inputs and loopback provider; no IPC replacement, no process-wide network or model-quality claim' };
  } catch (error) {
    return { passed: false, steps, artifacts, error: String(error).slice(0, 2000),
      providerRequests: fixture.requests, consoleMessages,
      visibleText: (await page.locator('body').innerText()).slice(-4000),
      diagnostics: await page.evaluate(() => ({
        route: location.pathname,
        buttons: [...document.querySelectorAll('button')].slice(0, 80).map((button) =>
          button.getAttribute('aria-label') || button.title || button.textContent?.trim().slice(0, 50)),
        location: document.querySelector('foliate-view')?.lastLocation?.cfi,
      })) };
  } finally {
    // Detach the CDP client; ownership and profile cleanup remain with the
    // caller, which kills only its own disposable process tree.
    await browser.close();
  }
}
