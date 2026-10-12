import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import {
  cleanupSampler,
  finishSampler,
  observeSampler,
  waitForSamplerReady,
} from '../../../scripts/native-workload-sampler.mjs';

const probe = readFileSync(
  resolve(process.cwd(), 'scripts/test-windows-crash-recovery.mjs'),
  'utf8',
);
const sampler = readFileSync(
  resolve(process.cwd(), 'scripts/sample-windows-process-tree.ps1'),
  'utf8',
);

test('waits for the sampler first-sample marker before starting the measured workload', () => {
  expect(probe).toContain('await waitForSamplerReady(');
  expect(probe.indexOf('await waitForSamplerReady(')).toBeLessThan(
    probe.indexOf('await browser.url('),
  );
  expect(sampler).toContain('$ReadyFile');
});

test('explicitly stops and joins measurement before killing the measured process', () => {
  expect(probe).toContain('await finishSampler(');
  const resultOffset = probe.indexOf('evidence.push({ phase, processId: child.pid, result });');
  const finishOffset = probe.indexOf('await finishSampler(', resultOffset);
  expect(finishOffset).toBeGreaterThan(resultOffset);
  expect(finishOffset).toBeLessThan(probe.indexOf('await stop();', resultOffset));
  expect(sampler).toContain('Test-Path -LiteralPath $StopFile');
});

test('bounds both CIM queries and cleans up the owned sampler on every exit path', () => {
  expect(sampler.match(/Get-CimInstance Win32_Process[^\n]*-OperationTimeoutSec 5/g)).toHaveLength(
    2,
  );
  const finalCleanup = probe.slice(probe.lastIndexOf('} finally {'));
  expect(finalCleanup).toContain('await cleanupSampler(');
  expect(finalCleanup).toContain('cleanupSampler(sampler, samplerStopFile).finally(async () => {');
});

test('retains the memory budget and requires a nonempty real sample receipt', () => {
  expect(probe).toContain('const memoryBudgetBytes = 1024 * 1024 * 1024;');
  expect(probe).toContain('!memory.samples');
  expect(probe).toContain('memory.peakWorkingSetBytes > memoryBudgetBytes');
  expect(probe).toContain('memory.peakPrivateBytes > memoryBudgetBytes');
});

const receipt = {
  samples: 2,
  peakWorkingSetBytes: 200,
  peakPrivateBytes: 100,
  intervalMs: 200,
  stopRequested: true,
};

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    pid: 42,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
}

test('waits through a missing or stale first-sample marker', async () => {
  const readMarker = vi
    .fn()
    .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    .mockResolvedValueOnce('999')
    .mockResolvedValueOnce('42');
  await waitForSamplerReady({
    readyFile: 'owned.pid',
    expectedPid: 42,
    isAlive: () => true,
    pollMs: 1,
    readMarker,
  });
  expect(readMarker).toHaveBeenCalledTimes(3);
});

test('fails before measurement if the sampler exits or marker access is denied', async () => {
  await expect(
    waitForSamplerReady({ readyFile: 'owned.pid', expectedPid: 42, isAlive: () => false }),
  ).rejects.toThrow('exited');
  await expect(
    waitForSamplerReady({
      readyFile: 'owned.pid',
      expectedPid: 42,
      isAlive: () => true,
      readMarker: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' })),
    }),
  ).rejects.toThrow('denied');
});

test('rejects a bounded missing first-sample marker', async () => {
  await expect(
    waitForSamplerReady({
      readyFile: 'owned.pid',
      expectedPid: 42,
      isAlive: () => true,
      timeoutMs: 5,
      pollMs: 1,
      readMarker: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })),
    }),
  ).rejects.toThrow('first-sample');
});

test('waits for close and drained receipt bytes, rather than process exit alone', async () => {
  const child = fakeChild();
  const observed = observeSampler(child);
  let completed = false;
  void observed.completion.then(() => {
    completed = true;
  });
  child.emit('exit', 0);
  await Promise.resolve();
  expect(completed).toBe(false);
  child.stdout.emit('data', JSON.stringify(receipt));
  child.emit('close', 0, null);
  expect(await observed.completion).toEqual(receipt);
  expect(observed.isClosed()).toBe(true);
});

test.each([
  { ...receipt, samples: 0 },
  { ...receipt, stopRequested: false },
  { ...receipt, peakWorkingSetBytes: -1 },
  { ...receipt, peakPrivateBytes: 'missing' },
])('rejects incomplete or invalid sample receipts: %j', async (invalid) => {
  const child = fakeChild();
  const observed = observeSampler(child);
  child.stdout.emit('data', JSON.stringify(invalid));
  child.emit('close', 0, null);
  await expect(observed.completion).rejects.toThrow('Incomplete');
});

test('retains sampler launch and nonzero-exit failures', async () => {
  const failedLaunch = fakeChild();
  const launch = observeSampler(failedLaunch);
  failedLaunch.emit('error', new Error('spawn failure'));
  await expect(launch.completion).rejects.toThrow('spawn failure');
  const failedExit = fakeChild();
  const exit = observeSampler(failedExit);
  failedExit.stderr.emit('data', 'CIM failure');
  failedExit.emit('close', 1, null);
  await expect(exit.completion).rejects.toThrow('CIM failure');
});

test('writes the stop request and cleans only the owned sampler on a stop-write failure', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'babelleaf-sampler-unit-'));
  try {
    const stopFile = resolve(directory, 'stop');
    const finished = await finishSampler({ completion: Promise.resolve(receipt) }, stopFile);
    expect(finished).toEqual(receipt);
    expect(await readFile(stopFile, 'utf8')).toContain('workload complete');
    const child = fakeChild();
    const observed = observeSampler(child);
    child.kill.mockImplementation(() => {
      child.emit('close', null, 'SIGKILL');
      return true;
    });
    await cleanupSampler(observed, resolve(directory, 'missing-parent', 'stop'));
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    expect(observed.isClosed()).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
