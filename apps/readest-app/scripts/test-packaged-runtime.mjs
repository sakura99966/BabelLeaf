// Read-only acceptance probe for an owned, portable copy of the standard EXE.
// No dev server, WebDriver build, user profile, key or external request.
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackagedRuntimeManifest, dispatchPackagedProbeResponse, makePackagedProbePolicy, validatePackagedLibraryTiming } from './packaged-runtime-manifest.mjs';
import { readPackagedProbeTargets } from './packaged-runtime-transport.mjs';
import net from 'node:net';

if (process.platform !== 'win32') throw new Error('Windows-only standard package acceptance probe');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw new Error('Missing ' + name);
  return process.argv[index + 1];
};
const executable = resolve(root, option('--executable', 'target/x86_64-pc-windows-msvc/release/babelleaf.exe'));
if (!/[\\/]babelleaf\.exe$/i.test(executable)) throw new Error('Expected the standard BabelLeaf executable');
const manifestPath = resolve(root, option('--manifest', 'apps/readest-app/out/vendor/runtime-manifest.json'));
const expected = validatePackagedRuntimeManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
const output = resolve(root, option('--output', 'target/windows-packaged-runtime/result.json'));
const productVersion = JSON.parse(await readFile(resolve(root, 'apps/readest-app/package.json'), 'utf8')).version;
const productName = JSON.parse(await readFile(resolve(root, 'apps/readest-app/src-tauri/tauri.conf.json'), 'utf8')).productName;
const probeSourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const declaredBuildSource = option('--source-revision', probeSourceCommit);
if (!/^[0-9a-f]{40}$/i.test(declaredBuildSource)) throw new Error('Invalid build source revision');
await mkdir(dirname(output), { recursive: true });
const runtime = await mkdtemp(join(tmpdir(), 'babelleaf-packaged-probe-'));
const binary = join(runtime, 'BabelLeafProbe-' + randomUUID().replaceAll('-', '') + '.exe');
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const listener = net.createServer();
await new Promise((done, fail) => listener.once('error', fail).listen(0, '127.0.0.1', done));
const port = listener.address().port;
await new Promise((done) => listener.close(done));
await copyFile(executable, binary);
await writeFile(join(runtime, 'settings.json'), '{}');
for (const name of ['Roaming', 'Local', 'WebView2']) await mkdir(join(runtime, name));
const executableSha256 = createHash('sha256').update(await readFile(binary)).digest('hex');
let child;
let launchError;
let socket;
let passed = false;
let policyApplied = false;
let policyAttempted = false;
let result;
let cdpReached = false;
let observedPageCount = 0;
let observedOrigins = [];
let endpointError;
let startupOutput = '';
let launchedAt;
const captureStartupOutput = (chunk) => {
  startupOutput = (startupOutput + chunk.toString()).slice(-8192);
};
const collectOwnedProcessDiagnostics = () => {
  if (!child?.pid) return undefined;
  try {
    const script = `
      $all = @(Get-CimInstance Win32_Process -OperationTimeoutSec 5);
      $owned = @{}; $owned[${child.pid}] = $true;
      for ($round = 0; $round -lt 16; $round++) {
        foreach ($row in $all) {
          if ($owned.ContainsKey([int]$row.ParentProcessId)) { $owned[[int]$row.ProcessId] = $true }
        }
      }
      $rows = @($all | Where-Object { $owned.ContainsKey([int]$_.ProcessId) } | Select-Object -First 64 | ForEach-Object {
        $process = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue;
        [pscustomobject]@{
          pid = $_.ProcessId; parent = $_.ParentProcessId; name = $_.Name;
          version = $process.FileVersion; hasWindow = ($process.MainWindowHandle -ne [IntPtr]::Zero);
          responding = $process.Responding;
          remotePortArgument = ([string]$_.CommandLine -match '--remote-debugging-port=${port}(?:\\s|$)');
          hasUserDataArgument = ([string]$_.CommandLine -match '--user-data-dir=')
        }
      });
      ConvertTo-Json -InputObject $rows -Compress
    `;
    return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', windowsHide: true, timeout: 15000 }));
  } catch (error) { return { diagnosticError: String(error) }; }
};
const messages = new Map();
let sequence = 0;
try {
  const policy = makePackagedProbePolicy(basename(binary), port);
  policyAttempted = true;
  const policyResult = JSON.parse(execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'apps/readest-app/scripts/packaged-probe-policy.ps1'),
    '-Action', 'create', '-ExecutableName', policy.name, '-Port', String(port),
  ], { encoding: 'utf8', windowsHide: true, timeout: 15000 }));
  policyApplied = policyResult.applied === true;
  launchedAt = Date.now();
  child = spawn(binary, [], {
    cwd: runtime, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, APPDATA: join(runtime, 'Roaming'), LOCALAPPDATA: join(runtime, 'Local'),
      WEBVIEW2_USER_DATA_FOLDER: join(runtime, 'WebView2'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + port + ' --remote-debugging-address=127.0.0.1' },
  });
  child.stdout.on('data', captureStartupOutput);
  child.stderr.on('data', captureStartupOutput);
  child.once('error', (error) => { launchError = error; });
  let target;
  const deadline = Date.now() + 45000;
  while (!target) {
    if (launchError) throw launchError;
    if (child.exitCode !== null || Date.now() > deadline) throw new Error('Owned packaged WebView did not become ready');
    try {
      const pages = await readPackagedProbeTargets(port);
      cdpReached = true;
      if (!Array.isArray(pages) || pages.length > 32) throw new Error('Invalid CDP target list');
      observedPageCount = pages.length;
      observedOrigins = [...new Set(pages.map((page) => {
        try { return new URL(page.url).origin; } catch { return 'unparseable'; }
      }))];
      target = pages.find((page) => page.type === 'page' && /^(?:http:\/\/tauri\.localhost|tauri:\/\/localhost)(?:\/|$)/.test(page.url));
    } catch (error) { endpointError = String(error); }
    if (!target) await delay(200);
  }
  const ownerCheck = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '$connections = @(Get-NetTCPConnection -LocalPort ' + port + ' -State Listen -ErrorAction Stop); if ($connections | Where-Object { $_.LocalAddress -notin @("127.0.0.1","::1") }) { exit 2 }; $owner = ($connections | Select-Object -First 1).OwningProcess; ' +
    '$seen = @{}; while ($owner -gt 0 -and -not $seen.ContainsKey([int]$owner)) { if ($owner -eq ' + child.pid + ') { exit 0 }; $seen[[int]$owner]=$true; ' +
    '$owner = (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $owner) -OperationTimeoutSec 5).ParentProcessId }; exit 1'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
  void ownerCheck;
  if (!target.webSocketDebuggerUrl.startsWith('ws://127.0.0.1:' + port + '/'))
    throw new Error('Unexpected CDP endpoint');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', fail, { once: true }); });
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    dispatchPackagedProbeResponse(messages, message);
  });
  const evaluate = (expression) => new Promise((done, fail) => {
    const id = ++sequence;
    const timer = setTimeout(() => { messages.delete(id); fail(new Error('Packaged probe timed out')); }, 45000);
    messages.set(id, (message) => {
      clearTimeout(timer);
      if (message.error || message.result?.exceptionDetails) fail(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
      else done(message.result?.result?.value);
    });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    ready = await evaluate("!!document.querySelector('[data-testid=\"library-page\"]') && !!document.querySelector('[data-testid=\"library-empty-state\"]') && performance.getEntriesByName('babelleaf:library-interactive').length === 1");
    if (!ready) await delay(100);
  }
  if (!ready) throw new Error('Packaged application did not hydrate its empty local library');
  const timing = validatePackagedLibraryTiming(await evaluate(`(() => {
    const marks = performance.getEntriesByName('babelleaf:library-interactive');
    const button = document.querySelector('[data-testid="library-empty-state"] button[aria-haspopup="menu"]');
    return { timeOrigin: performance.timeOrigin, startTime: marks[0]?.startTime,
      marks: marks.length, enabledImportButton: !!button && !button.disabled && button.getBoundingClientRect().width > 0 };
  })()`), launchedAt);
  const startupBudgetMs = 2500;
  const startupBudgetEnforced = process.argv.includes('--enforce-startup-budget');
  if (startupBudgetEnforced && timing.launchToInteractiveMs > startupBudgetMs)
    throw new Error('Reference-host interactive startup exceeds the recorded budget: ' + JSON.stringify(timing));
  await evaluate(`document.querySelector('[data-testid="library-empty-state"] button[aria-haspopup="menu"]').click()`);
  let menuInteractive = false;
  for (let i = 0; i < 100 && !menuInteractive; i++) {
    menuInteractive = await evaluate(`!!document.querySelector('[data-testid="import-books-from-files"]')`);
    if (!menuInteractive) await delay(100);
  }
  if (!menuInteractive) throw new Error('Packaged library import action is not interactive');
  const version = await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:app|version')");
  if (version !== productVersion) throw new Error('Packaged version does not match source version');
  const name = await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:app|name')");
  if (name !== productName) throw new Error('Wrong package variant; expected standard ' + productName);
  const embedded = await evaluate("(async () => { const r = await fetch('/vendor/runtime-manifest.json', { cache: 'no-store', redirect: 'error' }); if (!r.ok) throw Error('Missing embedded manifest'); return r.json(); })()");
  validatePackagedRuntimeManifest(embedded);
  if (JSON.stringify(embedded) !== JSON.stringify(expected))
    throw new Error('Embedded manifest does not match the verified source build');
  const verifyAssets = async () => {
    const manifestResponse = await fetch('/vendor/runtime-manifest.json', { cache: 'no-store' });
    if (!manifestResponse.ok) throw Error('Missing embedded runtime manifest');
    const manifest = await manifestResponse.json();
    if (manifest.assets.length > 4096) throw Error('Too many embedded assets');
    let verifiedBytes = 0;
    for (const asset of manifest.assets) {
      if (!/^(?:vendor|fonts)\/[a-z0-9/_.-]+$/i.test(asset.path)
        || asset.path.split('/').some(part => !part || part === '.' || part === '..')
        || !Number.isSafeInteger(asset.bytes) || asset.bytes < 0 || asset.bytes > 64 * 1024 * 1024)
        throw Error('Unsafe embedded asset');
      if (verifiedBytes + asset.bytes > 256 * 1024 * 1024) throw Error('Embedded assets exceed byte budget');
      const url = new URL('/' + asset.path, location.origin);
      if (url.origin !== location.origin) throw Error('Nonlocal asset');
      const response = await fetch(url, { cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw Error('Missing embedded runtime asset: ' + asset.path);
      const content = new Uint8Array(asset.bytes);
      const reader = response.body.getReader();
      let length = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          if (length + next.value.length > asset.bytes) throw Error('Oversized embedded asset');
          content.set(next.value, length);
          length += next.value.length;
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
      if (length !== asset.bytes) throw Error('Truncated embedded asset');
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', content)))
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (content.byteLength !== asset.bytes || digest !== asset.sha256) throw Error('Embedded runtime mismatch: ' + asset.path);
      verifiedBytes += content.byteLength;
    }
    return { manifest, verifiedBytes, ready: true, origin: location.origin };
  };
  const checked = await evaluate('(' + verifyAssets.toString() + ')()');
  if (JSON.stringify(checked.manifest) !== JSON.stringify(expected))
    throw new Error('Embedded manifest does not match the frozen build manifest');
  result = { passed: true, executableSha256, declaredBuildSource, probeSourceCommit, productVersion, productName,
    components: expected.components.length, assets: expected.assets.length, verifiedBytes: checked.verifiedBytes,
    libraryHydrated: checked.ready, origin: checked.origin, profile: 'owned portable temporary copy',
    startup: { ...timing, budgetMs: startupBudgetMs, budgetEnforced: startupBudgetEnforced,
      budgetPassed: timing.launchToInteractiveMs <= startupBudgetMs, menuInteractive },
    scope: 'standard release executable, not webdriver/dev-server build; read-only asset hash probe',
    timestamp: new Date().toISOString() };
  passed = true;
} catch (error) {
  result = { passed: false, executableSha256, runtime, error: String(error),
    processExitCode: child?.exitCode, processSignal: child?.signalCode,
    cdpReached, observedPageCount, observedOrigins, endpointError,
    ownedProcesses: collectOwnedProcessDiagnostics(), startupOutput,
    portableProfileCreated: await stat(join(runtime, 'EBWebView/Default/Preferences')).then((file) => file.isFile(), () => false),
    timestamp: new Date().toISOString() };
} finally {
  socket?.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
    await Promise.race([once(child, 'exit'), delay(3000)]);
  }
  await delay(1500);
  if (policyAttempted) {
    try {
      const removed = JSON.parse(execFileSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', join(root, 'apps/readest-app/scripts/packaged-probe-policy.ps1'),
        '-Action', 'remove', '-ExecutableName', basename(binary), '-Port', String(port),
      ], { encoding: 'utf8', windowsHide: true, timeout: 15000 }));
      result.policyCleanupPass = removed.removed === true;
      if (!result.policyCleanupPass) {
        passed = false;
        result.passed = false;
        result.policyCleanupError = 'Probe policy was not restored';
        result.policyName = basename(binary);
      }
    } catch (error) {
      passed = false;
      result.passed = false;
      result.policyCleanupPass = false;
      result.policyCleanupError = String(error);
      result.policyName = basename(binary);
    }
  }
  result.elevatedPolicyApplied = policyApplied;
  if (passed) {
    const owned = relative(tmpdir(), runtime);
    if (!owned.startsWith('babelleaf-packaged-probe-') || owned.includes('/') || owned.includes('\\') || isAbsolute(owned)) {
      passed = false;
      result.passed = false;
      result.cleanupError = 'Unsafe portable-probe cleanup path';
      result.runtime = runtime;
    } else {
      try { await rm(runtime, { recursive: true, force: true }); result.profileCleanupPass = true; }
      catch (error) { passed = false; result.passed = false; result.cleanupError = String(error); result.runtime = runtime; }
    }
  }
  await writeFile(output, JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result));
if (!passed) process.exitCode = 1;
