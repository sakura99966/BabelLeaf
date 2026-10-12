import { readFile, writeFile } from 'node:fs/promises';

/** Observe immediately after spawn; close, not exit, means piped JSON is drained. */
export function observeSampler(child) {
  let output = '';
  let errors = '';
  let closed = false;
  const completion = new Promise((resolve, reject) => {
    child.stdout?.on('data', (data) => { output += data; });
    child.stderr?.on('data', (data) => { errors += data; });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      closed = true;
      if (code !== 0) {
        reject(new Error('Workload sampling failed: ' + (errors || signal || code)));
        return;
      }
      try {
        const result = JSON.parse(output);
        if (!Number.isSafeInteger(result.samples) || result.samples < 1 ||
            !Number.isFinite(result.peakWorkingSetBytes) || result.peakWorkingSetBytes < 0 ||
            !Number.isFinite(result.peakPrivateBytes) || result.peakPrivateBytes < 0 ||
            result.stopRequested !== true) {
          throw new Error('Incomplete workload sample receipt');
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
  completion.catch(() => {}); // Preserve early failure until finish/cleanup.
  return { child, completion, isClosed: () => closed };
}

export async function waitForSamplerReady({
  readyFile, expectedPid, isAlive, timeoutMs = 60000, pollMs = 100,
  readMarker = (file) => readFile(file, 'utf8'),
}) {
  if (!Number.isInteger(expectedPid) || expectedPid <= 0) throw new Error('Invalid owned sampler PID');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error('Workload sampler exited before its first sample');
    try {
      if (Number((await readMarker(readyFile)).trim()) === expectedPid) return;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error('Workload sampler did not publish its first-sample marker');
}

async function boundedCompletion(completion, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      completion,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Workload sampler did not finish')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function finishSampler(observation, stopFile, timeoutMs = 20000) {
  await writeFile(stopFile, 'measured workload complete');
  return boundedCompletion(observation.completion, timeoutMs);
}

export async function cleanupSampler(observation, stopFile) {
  if (!observation) return;
  try {
    if (!observation.isClosed()) await finishSampler(observation, stopFile);
    else await observation.completion;
  } catch {
    if (!observation.isClosed() && observation.child.pid) {
      observation.child.kill('SIGKILL'); // Only the child spawned by this harness.
      try { await boundedCompletion(observation.completion, 5000); }
      catch (error) { if (!observation.isClosed()) throw error; }
    }
  }
}
