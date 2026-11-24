// Qualification test only. No user files, network, shell or credentials.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (!process.argv.includes('--leaf')) {
  spawn(process.execPath, [fileURLToPath(import.meta.url), '--leaf'], {
    windowsHide: true, stdio: 'ignore',
  });
}
setInterval(() => {}, 1000);
