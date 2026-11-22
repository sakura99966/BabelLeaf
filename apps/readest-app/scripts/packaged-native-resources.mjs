import { spawn } from 'node:child_process';

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

export function startPackagedResourceSampler(pid) {
  if (process.platform !== 'win32' || !Number.isSafeInteger(pid) || pid < 1)
    throw new Error('Expected an owned Windows process ID');
  const command = `
    $ErrorActionPreference = 'Stop';
    while (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) {
      $all = @(Get-CimInstance Win32_Process -OperationTimeoutSec 5);
      $owned = @{}; $owned[${pid}] = $true;
      for ($round = 0; $round -lt 16; $round++) {
        foreach ($row in $all) {
          if ($owned.ContainsKey([int]$row.ParentProcessId)) { $owned[[int]$row.ProcessId] = $true }
        }
      }
      $working = [long]0; $private = [long]0; $count = 0;
      foreach ($row in $all) {
        if (-not $owned.ContainsKey([int]$row.ProcessId)) { continue }
        $item = Get-Process -Id $row.ProcessId -ErrorAction SilentlyContinue;
        if ($item) { $working += $item.WorkingSet64; $private += $item.PrivateMemorySize64; $count++ }
      }
      if ($count -gt 0) {
        [Console]::WriteLine(([pscustomobject]@{
          timestampMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();
          processes = $count; workingSetBytes = $working; privateBytes = $private
        } | ConvertTo-Json -Compress));
      }
      Start-Sleep -Milliseconds 200;
    }
  `;
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
    return { ...summarizePackagedResources(samples), measurements: samples };
  } };
}
