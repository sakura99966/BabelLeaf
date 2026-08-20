import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webdriverPort = Number(process.env.BABELLEAF_WDIO_WEBDRIVER_PORT || 4445);
const devPort = Number(process.env.BABELLEAF_WDIO_DEV_PORT || 3000);
const timeoutMs = Number(process.env.BABELLEAF_WDIO_TIMEOUT_MS || 300_000);
const children = [];
const removeDirectory = (directory) =>
  rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 500,
  });
const baseEnvironment = {
  ...process.env,
  NEXT_PUBLIC_APP_PLATFORM: 'tauri',
  NEXT_PUBLIC_BABELLEAF_E2E: '1',
};
let environment = baseEnvironment;

const spawnNode = (entryPoint, args = [], environmentOverrides = {}) => {
  const child = spawn(process.execPath, [entryPoint, ...args], {
    cwd: appRoot,
    env: { ...environment, ...environmentOverrides },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  children.push(child);
  return child;
};

const isAlive = (child) => child.exitCode === null && child.signalCode === null;

const terminate = async (child) => {
  if (!child || !isAlive(child)) return;
  if (process.platform === 'win32') {
    try {
      child.kill('SIGKILL');
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
    if (isAlive(child)) {
      await Promise.race([
        once(child, 'close'),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
    if (isAlive(child)) throw new Error(`Child process ${child.pid} remained alive after cleanup`);
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  if (isAlive(child)) {
    await Promise.race([
      once(child, 'close'),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
  if (isAlive(child)) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
};

const terminateWindowsProcessTree = async (processId) => {
  if (process.platform !== 'win32' || !Number.isInteger(processId)) return;
  // The final native spec asks the process plugin to exit with code 0 after
  // WebDriver has closed its session. Give that bounded clean path precedence
  // over window messages and forceful cleanup.
  const naturalExitDeadline = Date.now() + 3000;
  while (Date.now() < naturalExitDeadline) {
    try {
      process.kill(processId, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const gracefulCloser = spawn(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$target = Get-Process -Id ${processId} -ErrorAction SilentlyContinue; if ($null -ne $target) { [void]$target.CloseMainWindow() }`,
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  await Promise.race([
    once(gracefulCloser, 'close'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  const gracefulDeadline = Date.now() + 5000;
  while (Date.now() < gracefulDeadline) {
    try {
      process.kill(processId, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  try {
    process.kill(processId, 'SIGKILL');
  } catch (error) {
    if (error?.code === 'ESRCH') return;
  }

  await new Promise((resolve) => setTimeout(resolve, 100));
  try {
    process.kill(processId, 0);
  } catch {
    return;
  }

  const powershellFallback = spawn(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Stop-Process -Id ${processId} -Force -ErrorAction SilentlyContinue`,
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  await Promise.race([
    once(powershellFallback, 'close'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      process.kill(processId, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Windows process ${processId} remained alive after bounded cleanup`);
};

const isPortOpen = (port) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });

const requireFreePort = async (port, label) => {
  if (await isPortOpen(port)) {
    throw new Error(`${label} port ${port} is already occupied; refusing to reuse stale state`);
  }
};

const getWindowsListeningProcessId = (port) => {
  if (process.platform !== 'win32') return undefined;
  const output = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  for (const line of output.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (
      fields.length >= 5 &&
      fields[0] === 'TCP' &&
      fields[1]?.endsWith(`:${port}`) &&
      fields[3] === 'LISTENING'
    ) {
      const processId = Number.parseInt(fields[4], 10);
      if (Number.isInteger(processId) && processId > 0) return processId;
    }
  }
  return undefined;
};

const waitForProcessId = async (pidFiles, stageFile, child) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(child)) throw new Error('Tauri exited before publishing its process ID');
    for (const pidFile of pidFiles) {
      try {
        const processId = Number.parseInt(await readFile(pidFile, 'utf8'), 10);
        if (Number.isInteger(processId) && processId > 0) return processId;
      } catch {
        // Window construction can finish after the WebDriver listener starts.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  let stage = 'not-published';
  try {
    stage = (await readFile(stageFile, 'utf8')).trim() || stage;
  } catch {
    // Retain the explicit not-published diagnostic.
  }
  throw new Error(
    `Tauri WebDriver application did not publish its window-ready process ID; last stage: ${stage}`,
  );
};

const waitForChildExit = (child, label) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} exceeded ${timeoutMs} ms before exiting`));
    }, timeoutMs);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });

const waitForHttp = async (port, child, pathName = '/') => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(child)) throw new Error(`Process exited before HTTP port ${port} became ready`);
    const ready = await new Promise((resolve) => {
      const request = http.get({ hostname: '127.0.0.1', port, path: pathName }, (response) => {
        response.resume();
        resolve(response.statusCode >= 200 && response.statusCode < 500);
      });
      request.on('error', () => resolve(false));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
      });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for HTTP port ${port}`);
};

let temporaryConfigDirectory;
let temporaryRuntimeDirectory;
const temporaryFormatFixtureDirectory = path.join(
  appRoot,
  'src',
  '__tests__',
  '.babelleaf-wdio-fixtures',
);
let webdriverProcessId;
let webdriverFallbackPidFile;
let webdriverStageFile;
let failure;
try {
  await requireFreePort(devPort, 'Next.js development server');
  await requireFreePort(webdriverPort, 'Tauri WebDriver');
  console.log('Generating and verifying deterministic format fixtures...');
  await removeDirectory(temporaryFormatFixtureDirectory);
  const fixtureGenerator = spawnNode(
    path.resolve(appRoot, '../../scripts/fixtures/generate-format-fixtures.mjs'),
    [
      '--output',
      temporaryFormatFixtureDirectory,
      '--manifest',
      path.resolve(appRoot, 'test-data/FORMAT_FIXTURE_MANIFEST.json'),
    ],
  );
  const fixtureGeneratorCode = await waitForChildExit(
    fixtureGenerator,
    'Deterministic format fixture generation',
  );
  if (fixtureGeneratorCode !== 0) {
    throw new Error(`Format fixture generator exited with code ${fixtureGeneratorCode}`);
  }
  temporaryRuntimeDirectory = await mkdtemp(path.join(os.tmpdir(), 'babelleaf-wdio-runtime-'));
  const runtimeAppData = path.join(temporaryRuntimeDirectory, 'Roaming');
  const runtimeLocalAppData = path.join(temporaryRuntimeDirectory, 'Local');
  const runtimeWebViewData = path.join(temporaryRuntimeDirectory, 'WebView2');
  const runtimeWebViewProfile = path.join(runtimeWebViewData, 'EBWebView');
  const webdriverPidFile = path.join(temporaryRuntimeDirectory, 'webdriver.pid');
  webdriverFallbackPidFile = path.join(os.tmpdir(), `babelleaf-webdriver-${webdriverPort}.pid`);
  webdriverStageFile = path.join(os.tmpdir(), `babelleaf-webdriver-${webdriverPort}.stage`);
  await rm(webdriverFallbackPidFile, { force: true });
  await rm(webdriverStageFile, { force: true });
  await mkdir(runtimeAppData, { recursive: true });
  await mkdir(runtimeLocalAppData, { recursive: true });
  await mkdir(runtimeWebViewData, { recursive: true });
  environment = {
    ...baseEnvironment,
    APPDATA: runtimeAppData,
    LOCALAPPDATA: runtimeLocalAppData,
    NEXT_PUBLIC_BABELLEAF_E2E_DATA_ROOT: path.join(
      temporaryRuntimeDirectory,
      '.readest-test-sandbox-tauri',
    ),
    WEBVIEW2_USER_DATA_FOLDER: runtimeWebViewData,
    BABELLEAF_WEBDRIVER_WEBVIEW_DATA_DIR: runtimeWebViewProfile,
    BABELLEAF_WEBDRIVER_PID_FILE: webdriverPidFile,
    TAURI_WEBDRIVER_PORT: String(webdriverPort),
  };
  console.log(`Starting Next.js development server on port ${devPort}...`);
  const next = spawnNode('node_modules/next/dist/bin/next', ['dev', '-p', String(devPort)]);
  await waitForHttp(devPort, next);

  temporaryConfigDirectory = await mkdtemp(path.join(os.tmpdir(), 'babelleaf-wdio-test-'));
  const configPath = path.join(temporaryConfigDirectory, 'tauri.test.conf.json');
  await writeFile(
    configPath,
    JSON.stringify({
      build: { beforeDevCommand: '' },
      app: { security: { capabilities: ['default', 'desktop-capability', 'webdriver-remote'] } },
    }),
    'utf8',
  );

  console.log(`Starting Tauri WebDriver app on port ${webdriverPort}...`);
  const tauri = spawnNode('node_modules/@tauri-apps/cli/tauri.js', [
    'dev',
    '--features',
    'webdriver',
    '--no-watch',
    '--config',
    configPath,
  ]);
  await waitForHttp(webdriverPort, tauri, '/status');
  const listeningProcessId = getWindowsListeningProcessId(webdriverPort);
  webdriverProcessId = listeningProcessId;
  const readyProcessId = await waitForProcessId(
    [webdriverPidFile, webdriverFallbackPidFile],
    webdriverStageFile,
    tauri,
  );
  if (listeningProcessId && listeningProcessId !== readyProcessId) {
    throw new Error(
      `WebDriver listener PID ${listeningProcessId} did not match window-ready PID ${readyProcessId}`,
    );
  }
  webdriverProcessId = readyProcessId;

  console.log('Running WebDriverIO native tests...');
  const userInfoShim = path.join(appRoot, 'scripts', 'node-user-info-shim.cjs').replaceAll('\\', '/');
  const nodeOptions = [environment.NODE_OPTIONS, `--require="${userInfoShim}"`]
    .filter(Boolean)
    .join(' ');
  const tests = spawnNode(
    'node_modules/@wdio/cli/bin/wdio.js',
    ['run', 'wdio.conf.mjs'],
    {
      NODE_OPTIONS: nodeOptions,
      BABELLEAF_NATIVE_APP_PID: String(readyProcessId),
    },
  );
  const code = await waitForChildExit(tests, 'WebDriverIO native tests');
  if (code !== 0) throw new Error(`WebDriverIO tests exited with code ${code}`);
} catch (error) {
  failure = error;
} finally {
  try {
    await terminateWindowsProcessTree(webdriverProcessId);
    for (const child of [...children].reverse()) await terminate(child);
  } catch (error) {
    failure ??= error;
  } finally {
    for (const child of children) {
      child.stdout?.destroy();
      child.stderr?.destroy();
    }
  }
  // WebView2 can release its profile lock slightly after the Tauri process
  // exits. Give the runtime a bounded grace period before the next lane starts.
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (temporaryConfigDirectory) {
      await removeDirectory(temporaryConfigDirectory);
    }
    if (temporaryRuntimeDirectory) {
      await removeDirectory(temporaryRuntimeDirectory);
    }
    await removeDirectory(temporaryFormatFixtureDirectory);
    if (webdriverFallbackPidFile) {
      await rm(webdriverFallbackPidFile, { force: true });
    }
    if (webdriverStageFile) {
      await rm(webdriverStageFile, { force: true });
    }
  } catch (error) {
    if (failure) {
      console.warn(
        `Native E2E cleanup also failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } else {
      failure = error;
    }
  }
}

if (failure) {
  console.error(failure instanceof Error ? failure.stack || failure.message : String(failure));
  process.exitCode = 1;
}
