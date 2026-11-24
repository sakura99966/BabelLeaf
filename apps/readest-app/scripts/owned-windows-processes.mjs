import { execFileSync } from 'node:child_process';
import { win32, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ownedWindowsProcessScript = join(dirname(fileURLToPath(import.meta.url)), 'owned-windows-processes.ps1');
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const prefix = `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n. ${quote(ownedWindowsProcessScript)}\n`;
const validId = (id) => Number.isSafeInteger(id) && id > 0;
const validPath = (path) => typeof path === 'string' && win32.isAbsolute(path) &&
  /\.exe$/i.test(path) && !/[\0\r\n]/.test(path);

export function ownedWindowsProcessCommand(identity, body) {
  if (!identity || !validId(identity.ProcessId) || !validPath(identity.ExecutablePath) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(identity.CreationKey))
    throw new Error('Expected an immutable owned Windows process identity');
  return prefix +
    `$identity = [pscustomobject]@{ ProcessId=${identity.ProcessId}; ` +
    `CreationKey=${quote(identity.CreationKey)}; ExecutablePath=${quote(identity.ExecutablePath)} }\n` + body;
}

export function readOwnedWindowsProcessIdentity(pid, executable) {
  if (process.platform !== 'win32' || !validId(pid) || !validPath(executable))
    throw new Error('Expected the exact owned Windows executable and PID');
  const command = prefix +
    `Get-BabelLeafProcessIdentity -RootId ${pid} -ExecutablePath ${quote(executable)} | ConvertTo-Json -Compress`;
  const identity = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, encoding: 'utf8', timeout: 15000 }));
  if (identity.ProcessId !== pid || identity.ExecutablePath?.toLowerCase() !== executable.toLowerCase())
    throw new Error('Owned process metadata does not match the expected executable');
  ownedWindowsProcessCommand(identity, '');
  return identity;
}

export function stopOwnedWindowsProcesses(identity) {
  const command = ownedWindowsProcessCommand(identity,
    'Stop-BabelLeafOwnedProcesses -Identity $identity | ConvertTo-Json -Compress');
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, encoding: 'utf8', timeout: 30000 }));
}
