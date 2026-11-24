import { spawn } from 'node:child_process';
import { ownedWindowsProcessCommand } from './owned-windows-processes.mjs';

export function summarizePackagedResources(samples) {
  if (!Array.isArray(samples) || samples.length === 0 || samples.length > 4096 ||
    samples.some((sample) => !sample || !Number.isSafeInteger(sample.timestampMs) || sample.timestampMs <= 0 ||
      !Number.isSafeInteger(sample.processes) || sample.processes < 1 || sample.processes > 128 ||
      !Number.isSafeInteger(sample.workingSetBytes) || sample.workingSetBytes < 0 ||
      !Number.isSafeInteger(sample.privateBytes) || sample.privateBytes < 0))
    throw new Error('Invalid or absent owned-process resource samples');
  const peakWorkingSetBytes = Math.max(...samples.map((s) => s.workingSetBytes));
  const peakPrivateBytes = Math.max(...samples.map((s) => s.privateBytes));
  const budgetBytes = 1024 ** 3;
  return { passed: peakWorkingSetBytes <= budgetBytes && peakPrivateBytes <= budgetBytes,
    samples: samples.length, peakWorkingSetBytes, peakPrivateBytes, budgetBytes,
    requestedIntervalMs: 200,
    scope: 'owned packaged app and descendant process sums at recorded times; sampled peaks, not unsampled maxima' };
}

export function startPackagedResourceSampler(identity) {
  if (process.platform !== 'win32') throw new Error('Expected an owned Windows process identity');
  const command = ownedWindowsProcessCommand(identity, `
    $ErrorActionPreference = 'Stop';
    while ($true) {
      $owned = @(Get-BabelLeafOwnedProcesses -Identity $identity);
      if ($owned.Count -eq 0) { throw 'Owned root identity changed or exited during measurement' }
      $working = [long]0; $private = [long]0; $count = 0;
      foreach ($row in $owned) {
        $sample = Get-BabelLeafProcessMemory -ProcessRow $row;
        $working += $sample.WorkingSetBytes;
        $private += $sample.PrivateBytes;
        $count++;
      }
      if ($count -gt 0) {
        [Console]::WriteLine(([pscustomobject]@{
          timestampMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();
          processes = $count; workingSetBytes = $working; privateBytes = $private
        } | ConvertTo-Json -Compress));
      }
      Start-Sleep -Milliseconds 200;
    }
  `);
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const samples = [];
  let pending = '';
  let failure = '';
  child.stdout.setEncoding('utf8').on('data', (text) => {
    pending += text;
    for (let newline; (newline = pending.indexOf('\n')) >= 0;) {
      const line = pending.slice(0, newline).trim(); pending = pending.slice(newline + 1);
      try {
        if (line) samples.push(JSON.parse(line));
        if (samples.length > 4096) { failure = 'Unbounded native sampler'; child.kill(); }
      } catch { failure = 'Invalid native sampler output'; }
    }
    if (pending.length > 8192) { failure = 'Unbounded native sampler buffer'; child.kill(); }
  });
  child.stderr.setEncoding('utf8').on('data', (text) => { failure = (failure + text).slice(-2000); });
  child.on('error', (error) => { failure = String(error); });
  return { stop: async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise((done) => child.once('close', done));
      child.kill();
      await closed;
    }
    if (failure) throw new Error(failure);
    return { ...summarizePackagedResources(samples), ownershipSchemaVersion: 1,
      measurements: samples };
  } };
}
