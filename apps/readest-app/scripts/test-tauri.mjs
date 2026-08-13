import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const devPort = Number(process.env.BABELLEAF_TAURI_DEV_PORT || 3000);
const webdriverPort = Number(process.env.BABELLEAF_TAURI_WEBDRIVER_PORT || 4445);
const timeoutMs = Number(process.env.BABELLEAF_TAURI_TEST_TIMEOUT_MS || 300_000);

const childProcesses = [];
const baseEnvironment = {
  ...process.env,
  NEXT_PUBLIC_APP_PLATFORM: 'tauri',
  NEXT_PUBLIC_BABELLEAF_E2E: '1',
};
let environment = baseEnvironment;

const spawnNode = (entryPoint, args = []) => {
  const child = spawn(process.execPath, [entryPoint, ...args], {
    cwd: appRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  childProcesses.push(child);
  return child;
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

const isAlive = (child) => child.exitCode === null && child.signalCode === null;

const terminate = async (child) => {
  if (!child || !isAlive(child)) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    await Promise.race([
      once(killer, 'close'),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (isAlive(child)) child.kill();
    if (isAlive(child)) {
      await Promise.race([
        once(child, 'close'),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
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

  const killer = spawn('taskkill.exe', ['/PID', String(processId), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  await Promise.race([
    once(killer, 'close'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  try {
    process.kill(processId, 'SIGKILL');
  } catch {
    // The preferred process-tree cleanup already removed the application.
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

const waitForPort = async (port, child) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(child)) throw new Error(`Process exited before port ${port} became ready`);
    const ready = await new Promise((resolve) => {
      const request = http.get({ hostname: '127.0.0.1', port, path: '/status' }, (response) => {
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
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for port ${port}`);
};

const waitForHttp = async (port, child) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(child)) throw new Error(`Process exited before HTTP port ${port} became ready`);
    const ready = await new Promise((resolve) => {
      const request = http.get({ hostname: '127.0.0.1', port, path: '/' }, (response) => {
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
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for HTTP port ${port}`);
};

let failure;
let temporaryConfigDirectory;
let temporaryRuntimeDirectory;
let webdriverProcessId;
let webdriverFallbackPidFile;
let webdriverStageFile;
let webdriverExitFile;
try {
  await requireFreePort(devPort, 'Next.js development');
  await requireFreePort(webdriverPort, 'Tauri WebDriver');
  temporaryRuntimeDirectory = await mkdtemp(path.join(os.tmpdir(), 'babelleaf-tauri-runtime-'));
  const runtimeAppData = path.join(temporaryRuntimeDirectory, 'Roaming');
  const runtimeLocalAppData = path.join(temporaryRuntimeDirectory, 'Local');
  const runtimeWebViewData = path.join(temporaryRuntimeDirectory, 'WebView2');
  const runtimeWebViewProfile = path.join(runtimeWebViewData, 'EBWebView');
  const webdriverPidFile = path.join(temporaryRuntimeDirectory, 'webdriver.pid');
  webdriverExitFile = path.join(temporaryRuntimeDirectory, 'webdriver.exit');
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
    BABELLEAF_WEBDRIVER_EXIT_FILE: webdriverExitFile,
    TAURI_WEBDRIVER_PORT: String(webdriverPort),
  };
  console.log(`Starting Next.js development server on port ${devPort}...`);
  const next = spawnNode('node_modules/next/dist/bin/next', ['dev', '-p', String(devPort)]);
  await waitForHttp(devPort, next);

  console.log(`Starting Tauri WebDriver app on port ${webdriverPort}...`);
  temporaryConfigDirectory = await mkdtemp(path.join(os.tmpdir(), 'babelleaf-tauri-test-'));
  const configPath = path.join(temporaryConfigDirectory, 'tauri.test.conf.json');
  const config = JSON.stringify({
    build: { beforeDevCommand: '' },
    app: { security: { capabilities: ['default', 'desktop-capability', 'webdriver-remote'] } },
  });
  await writeFile(configPath, config, 'utf8');
  const tauri = spawnNode('node_modules/@tauri-apps/cli/tauri.js', [
    'dev',
    '--features',
    'webdriver',
    '--no-watch',
    '--config',
    configPath,
  ]);
  await waitForPort(webdriverPort, tauri);
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

  console.log('Running Tauri integration tests...');
  const tests = spawnNode('node_modules/vitest/vitest.mjs', [
    '--config',
    'vitest.tauri.config.mts',
    '--watch=false',
  ]);
  const code = await waitForChildExit(tests, 'Tauri integration tests');
  if (code !== 0) throw new Error(`Tauri integration tests exited with code ${code}`);
} catch (error) {
  failure = error;
} finally {
  try {
    if (webdriverExitFile && Number.isInteger(webdriverProcessId)) {
      await writeFile(webdriverExitFile, '0', 'utf8');
      const cleanExitDeadline = Date.now() + 5000;
      while (Date.now() < cleanExitDeadline) {
        try {
          process.kill(webdriverProcessId, 0);
        } catch {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    await terminateWindowsProcessTree(webdriverProcessId);
    for (const child of [...childProcesses].reverse()) await terminate(child);
  } catch (error) {
    failure ??= error;
  } finally {
    for (const child of childProcesses) {
      child.stdout?.destroy();
      child.stderr?.destroy();
    }
  }
  // WebView2 can release its profile lock slightly after the Tauri process
  // exits. Give the runtime a bounded grace period before the next lane starts.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (temporaryConfigDirectory) {
    await rm(temporaryConfigDirectory, { recursive: true, force: true });
  }
  if (temporaryRuntimeDirectory) {
    await rm(temporaryRuntimeDirectory, { recursive: true, force: true });
  }
  if (webdriverFallbackPidFile) {
    await rm(webdriverFallbackPidFile, { force: true });
  }
  if (webdriverStageFile) {
    await rm(webdriverStageFile, { force: true });
  }
}

if (failure) {
  console.error(failure instanceof Error ? failure.stack || failure.message : String(failure));
  process.exitCode = 1;
}
