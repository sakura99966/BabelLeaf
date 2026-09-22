// Run test-tauri.mjs first to build the isolated webdriver-feature executable.
// This probe kills only its own spawned executable, never an existing reader.
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
// Reuse the native test provider's declared WebDriver dependency.
const providerRequire = createRequire(import.meta.resolve('@vitest/browser-webdriverio'));
const { remote } = await import(pathToFileURL(providerRequire.resolve('webdriverio')).href);

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '../..');
const executable = path.join(repoRoot, 'target/debug/Readest.exe');
if (process.platform !== 'win32') throw new Error('Windows-only process interruption probe');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const portOpen = (port) => new Promise((resolve) => {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  const finish = (value) => { socket.destroy(); resolve(value); };
  socket.once('connect', () => finish(true));
  socket.once('error', () => finish(false));
  socket.setTimeout(1000, () => finish(false));
});
for (const port of [3000, 4445]) {
  if (await portOpen(port)) throw new Error(`Port ${port} is occupied; refusing existing state`);
}
const runtime = await mkdtemp(path.join(os.tmpdir(), 'babelleaf-crash-'));
const root = path.join(runtime, '.readest-test-sandbox-tauri');
const profile = path.join(runtime, 'WebView2/EBWebView');
const evidence = [];
let server;
let child;
const stop = async () => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  await Promise.race([exited, delay(10000).then(() => { throw new Error('Spawned process did not exit'); })]);
  child.stdout?.destroy();
  child.stderr?.destroy();
  await delay(1500);
};
let passed = false;
try {
  for (const directory of [root, profile, path.join(runtime, 'Roaming'), path.join(runtime, 'Local')])
    await mkdir(directory, { recursive: true });
  server = await createServer({
    configFile: false,
    root: appRoot,
    plugins: [tsconfigPaths({ root: appRoot })],
    define: { 'process.env': JSON.stringify({ NEXT_PUBLIC_APP_PLATFORM: 'tauri' }) },
    resolve: { conditions: ['development'] },
    optimizeDeps: { include: ['@tauri-apps/plugin-fs', '@tauri-apps/plugin-http', '@tauri-apps/api/path', '@tauri-apps/api/core', '@tauri-apps/plugin-dialog', '@tauri-apps/plugin-os', '@choochmeque/tauri-plugin-sharekit-api', '@zip.js/zip.js', 'franc-min', 'iso-639-2', 'iso-639-3', 'js-md5'], exclude: ['@pdfjs/pdf.min.mjs'] },
    server: { port: 3000, strictPort: true, host: '127.0.0.1' },
  });
  await server.listen();
  for (const [phase, expected] of [['before-main', 'before-main'], ['after-main', 'after-main'], ['recover', 'recovered']]) {
    child = spawn(executable, [], {
      cwd: appRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, APPDATA: path.join(runtime, 'Roaming'), LOCALAPPDATA: path.join(runtime, 'Local'),
        WEBVIEW2_USER_DATA_FOLDER: path.dirname(profile), BABELLEAF_WEBDRIVER_WEBVIEW_DATA_DIR: profile,
        BABELLEAF_NATIVE_TEST_ROOT: root, BABELLEAF_WEBDRIVER_PID_FILE: path.join(runtime, 'webdriver.pid'), TAURI_WEBDRIVER_PORT: '4445' },
    });
    child.stdout.on('data', (data) => process.stdout.write(data));
    child.stderr.on('data', (data) => process.stderr.write(data));
    const deadline = Date.now() + 60000;
    while (!(await portOpen(4445))) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error('Isolated WebDriver failed to start');
      await delay(200);
    }
    const browser = await remote({ hostname: '127.0.0.1', port: 4445, capabilities: { browserName: 'chrome' }, logLevel: 'error', connectionRetryCount: 0 });
    await browser.url(`http://127.0.0.1:3000/src/__tests__/fixtures/native-crash.html?${new URLSearchParams({ root, phase })}`);
    let result;
    await browser.waitUntil(async () => {
      const text = await browser.execute(() => document.body?.textContent ?? '');
      try { result = JSON.parse(text); } catch { return false; }
      if (result.error) throw new Error(result.error);
      return result.stage === expected;
    }, { timeout: 60000, interval: 200 });
    evidence.push({ phase, processId: child.pid, result });
    // Deliberately do not close the WebDriver session/window gracefully.
    await stop();
  }
  const output = path.join(repoRoot, 'target/windows-crash-recovery/result.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ passed: true, timestamp: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim(), sourceDirty: execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim().length > 0, scope: 'process kill, not power loss or storage-controller failure', evidence }, null, 2));
  console.log(JSON.stringify(evidence));
  passed = true;
} finally {
  await stop();
  await server?.close();
  // Retain a failed isolated profile for diagnosis; never touch user application data.
  if (passed && path.dirname(runtime) === os.tmpdir() && path.basename(runtime).startsWith('babelleaf-crash-'))
    await rm(runtime, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  else console.error(`Retained isolated diagnostic directory: ${runtime}`);
}
