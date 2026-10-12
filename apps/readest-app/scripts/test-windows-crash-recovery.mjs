// Run test-tauri.mjs first to build the isolated webdriver-feature executable.
// This probe kills only its own spawned executable, never an existing reader.
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { waitForNativeWindow } from './native-probe-readiness.mjs';
import { observeSampler, waitForSamplerReady, finishSampler, cleanupSampler } from './native-workload-sampler.mjs';
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
const output = path.join(repoRoot, 'target/windows-crash-recovery/result.json');
let currentPhase;
let lastPage;
let server;
let child;
let sampler;
let samplerStopFile;
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
  const ungranted = path.join(runtime, 'ungranted-directory');
  await mkdir(ungranted);
  await writeFile(path.join(ungranted, 'must-not-enumerate.txt'), 'isolated out-of-scope sentinel');
  await writeFile(path.join(root, 'allowed.txt'), 'isolated in-scope sentinel');
  await symlink(ungranted, path.join(root, 'junction'), 'junction');
  const workloadRoot = path.join(root, 'workload');
  await mkdir(workloadRoot);
  for (let index = 0; index < 128; index++) {
    const directory = path.join(workloadRoot, String(index));
    await mkdir(directory);
    await Promise.all(Array.from({ length: 32 }, (_, item) => writeFile(path.join(directory, `${item}.txt`), 'local workload fixture')));
  }
  server = await createServer({
    configFile: false,
    root: appRoot,
    cacheDir: path.join(runtime, 'vite-cache'),
    plugins: [tsconfigPaths({ root: appRoot })],
    define: { 'process.env': JSON.stringify({ NEXT_PUBLIC_APP_PLATFORM: 'tauri' }) },
    resolve: { conditions: ['development'] },
    optimizeDeps: { include: ['@tauri-apps/api/window', '@tauri-apps/api/webviewWindow', '@tauri-apps/api/event', '@tauri-apps/plugin-process', '@tauri-apps/plugin-fs', '@tauri-apps/plugin-http', '@tauri-apps/api/path', '@tauri-apps/api/core', '@tauri-apps/plugin-dialog', '@tauri-apps/plugin-os', '@choochmeque/tauri-plugin-sharekit-api', '@zip.js/zip.js', 'franc-min', 'iso-639-2', 'iso-639-3', 'js-md5'], exclude: ['@pdfjs/pdf.min.mjs'] },
    // A native probe must not reload/re-execute an in-flight fixture when Vite
    // discovers another dependency. HMR is not part of the tested application.
    server: { port: 3000, strictPort: true, host: '127.0.0.1', hmr: false },
  });
  await server.listen();
  for (const [phase, expected] of [['quit-guard', 'quit-guard'], ['workload', 'workload'], ['directory-scope', 'directory-scope'], ['before-main', 'before-main'], ['after-main', 'after-main'], ['recover', 'recovered'], ['artifact-journal', 'artifact-journal'], ['recover-artifact', 'recovered-artifact']]) {
    currentPhase = phase;
    lastPage = undefined;
    console.log(`Native probe phase: ${phase}`);
    const pidFile = path.join(runtime, `${phase}.pid`);
    child = spawn(executable, [], {
      cwd: appRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, APPDATA: path.join(runtime, 'Roaming'), LOCALAPPDATA: path.join(runtime, 'Local'),
        WEBVIEW2_USER_DATA_FOLDER: path.dirname(profile), BABELLEAF_WEBDRIVER_WEBVIEW_DATA_DIR: profile,
        BABELLEAF_NATIVE_TEST_ROOT: root, BABELLEAF_WEBDRIVER_PID_FILE: pidFile, TAURI_WEBDRIVER_PORT: '4445' },
    });
    child.stdout.on('data', (data) => process.stdout.write(data));
    child.stderr.on('data', (data) => process.stderr.write(data));
    const deadline = Date.now() + 60000;
    while (!(await portOpen(4445))) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error('Isolated WebDriver failed to start');
      await delay(200);
    }
    await waitForNativeWindow({ pidFile, expectedPid: child.pid, isAlive: () => child.exitCode === null && child.signalCode === null });
    console.log(`Native window ready for ${phase}, PID ${child.pid}`);
    if (phase === 'workload') {
      const samplerReadyFile = path.join(runtime, 'sampler-workload.pid');
      samplerStopFile = path.join(runtime, 'sampler-workload.stop');
      sampler = observeSampler(spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(appRoot, 'scripts/sample-windows-process-tree.ps1'), '-RootProcessId', String(child.pid), '-ExpectedExecutable', executable, '-ReadyFile', samplerReadyFile, '-StopFile', samplerStopFile], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
      await waitForSamplerReady({ readyFile: samplerReadyFile, expectedPid: sampler.child.pid, isAlive: () => !sampler.isClosed() });
    }
    // The upstream server's initial script timeout is 30s; don't abort the
    // handshake client-side before that server-side diagnostic can arrive.
    const browser = await remote({ hostname: '127.0.0.1', port: 4445, capabilities: { browserName: 'chrome' }, logLevel: 'error', connectionRetryCount: 0, connectionRetryTimeout: 45000 });
    await browser.url(`http://127.0.0.1:3000/src/__tests__/fixtures/native-crash.html?${new URLSearchParams({ root, phase })}`);
    let result;
    await browser.waitUntil(async () => {
      lastPage = await browser.execute(() => ({ url: location.href, body: document.body?.textContent ?? '' }));
      try { result = JSON.parse(lastPage.body); } catch { return false; }
      if (result.error) throw new Error(result.error);
      return result.stage === expected;
    }, { timeout: 60000, interval: 200 });
    evidence.push({ phase, processId: child.pid, result });
    if (sampler) {
      // Finish measurement before taskkill, without relying on CIM observing process exit.
      const memory = await finishSampler(sampler, samplerStopFile);
      const samplingOutput = JSON.stringify(memory);
      const memoryBudgetBytes = 1024 * 1024 * 1024;
      if (!memory.samples || memory.peakWorkingSetBytes > memoryBudgetBytes || memory.peakPrivateBytes > memoryBudgetBytes)
        throw new Error(`Workload memory budget exceeded: ${samplingOutput}`);
      evidence[evidence.length - 1].memory = { ...memory, memoryBudgetBytes };
      sampler = undefined;
    }
    // Deliberately do not close the WebDriver session/window gracefully.
    await stop();
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ passed: true, timestamp: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim(), sourceDirty: execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim().length > 0, scope: 'process kill, not power loss or storage-controller failure', evidence }, null, 2));
  console.log(JSON.stringify(evidence));
  passed = true;
} catch (error) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ passed: false, timestamp: new Date().toISOString(), phase: currentPhase, lastPage, processExitCode: child?.exitCode, error: String(error), runtime, evidence }, null, 2));
  console.error(`Failed native phase ${currentPhase}: ${JSON.stringify(lastPage)}`);
  throw error;
} finally {
  await cleanupSampler(sampler, samplerStopFile).finally(async () => {
  await stop();
  await server?.close();
  // Retain a failed isolated profile for diagnosis; never touch user application data.
  if (passed && path.dirname(runtime) === os.tmpdir() && path.basename(runtime).startsWith('babelleaf-crash-'))
    await rm(runtime, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  else console.error(`Retained isolated diagnostic directory: ${runtime}`);
  });
}
