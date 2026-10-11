import { readFile } from 'node:fs/promises';

/**
 * The WebDriver listener starts before the native WebView finishes construction.
 * Wait for the marker written AFTER build(), belonging to this spawned process.
 * @param {{pidFile: string, expectedPid: number, isAlive: () => boolean, timeoutMs?: number, pollMs?: number, readMarker?: (path: string) => Promise<string>}} options
 */
export async function waitForNativeWindow({ pidFile, expectedPid, isAlive, timeoutMs = 60000, pollMs = 100, readMarker = (path) => readFile(path, 'utf8') }) {
  if (!Number.isInteger(expectedPid) || expectedPid <= 0) throw new Error('Invalid owned process ID');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error('Spawned application exited before its window was ready');
    try {
      if (Number((await readMarker(pidFile)).trim()) === expectedPid) return;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error('Spawned application did not publish its window-ready process ID');
}
