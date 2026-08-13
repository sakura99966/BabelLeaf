import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.BABELLEAF_WEB_E2E_PORT || 3000);
const timeoutMs = Number(process.env.BABELLEAF_WEB_E2E_TIMEOUT_MS || 120_000);
// A production suite can legitimately take longer than a single 45-second
// worker startup (especially on a cold Windows checkout).  The watchdog is a
// safety net for a hung child, not a second test timeout.  If it does fire we
// must fail explicitly; returning success for an incomplete run makes CI
// report a false green result.
const processGraceMs = Number(process.env.BABELLEAF_WEB_E2E_PROCESS_GRACE_MS || 300_000);
const ci = process.env.CI === 'true' || process.env.CI === '1';
// Preserve Playwright CLI filters/options passed through `pnpm ... -- ...`.
// The separator is inserted by pnpm/npm and is not a Playwright argument.
const playwrightArgs = process.argv.slice(2).filter((argument) => argument !== '--');
const children = [];

const environment = {
  ...process.env,
  BABELLEAF_E2E_EXTERNAL_SERVER: '1',
  NEXT_PUBLIC_APP_PLATFORM: 'web',
  PORT: String(port),
};

const spawnNode = (args) => {
  const child = spawn(process.execPath, args, {
    cwd: appRoot,
    env: environment,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  children.push(child);
  return child;
};

const runPlaywright = () =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['node_modules/playwright/cli.js', 'test', '--config', 'playwright.config.ts', ...playwrightArgs],
      {
        cwd: appRoot,
        env: environment,
        stdio: 'inherit',
        detached: process.platform !== 'win32',
        windowsHide: true,
      },
    );
    children.push(child);
    let settled = false;
    let watchdog;
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      reject(error);
    });
    watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.error(`Playwright process exceeded ${processGraceMs} ms before exiting`);
      void terminate(child).then(
        () => resolve({ code: 1 }),
        reject,
      );
    }, processGraceMs);
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve({ code: code ?? 1 });
    });
  });

const spawnDevServer = () => {
  if (ci) return spawnNode(['scripts/serve-web.mjs']);
  // Spawn Next directly. A cmd -> pnpm -> dotenv chain can orphan the actual
  // server on Windows after the shell exits, defeating bounded cleanup.
  return spawnNode(['node_modules/next/dist/bin/next', 'dev', '--port', String(port)]);
};

// `child.killed` only means a signal was sent; it does not mean the process has
// exited. Cleanup must continue until an exit or signal code is observable.
const isAlive = (child) => child.exitCode === null && child.signalCode === null;

const waitForHttp = async (child) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(child)) throw new Error('Web server exited before becoming ready');
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
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for the web server on port ${port}`);
};

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

let failure;
try {
  const server = spawnDevServer();
  await waitForHttp(server);
  const { code } = await runPlaywright();
  if (code !== 0) throw new Error(`Playwright exited with code ${code}`);
} catch (error) {
  failure = error;
} finally {
  for (const child of [...children].reverse()) await terminate(child);
}

if (failure) {
  console.error(failure instanceof Error ? failure.stack || failure.message : String(failure));
  process.exitCode = 1;
}
