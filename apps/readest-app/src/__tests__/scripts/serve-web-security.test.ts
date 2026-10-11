import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { beforeAll, afterAll, expect, test } from 'vitest';

let serverProcess: ChildProcess;
let port: number;

beforeAll(async () => {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('No test port allocated');
  port = address.port;
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  serverProcess = spawn(process.execPath, ['scripts/serve-web.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview server did not start')), 10000);
    serverProcess.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    serverProcess.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Preview server exited: ${code}`));
    });
    serverProcess.stdout?.on('data', (data: Buffer) => {
      if (!data.toString().includes('Serving ')) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}, 15000);

afterAll(async () => {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  const stopped = once(serverProcess, 'exit');
  serverProcess.kill();
  await stopped;
});

const request = (pathname: string): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const connection = http.get({ hostname: '127.0.0.1', port, path: pathname }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      response.on('error', reject);
    });
    connection.on('error', reject);
    connection.setTimeout(5000, () => connection.destroy(new Error('Preview request timed out')));
  });

test('does not return exception details for malformed local preview requests', async () => {
  const response = await request('/%E0%A4%A');
  expect(response.status).toBe(500);
  expect(response.body).toBe('Internal server error');
  expect(response.body).not.toContain('URI malformed');
});

test('rejects encoded traversal without exposing filesystem paths', async () => {
  const response = await request('/%2e%2e%2foutside-private-file');
  expect(response.status).toBe(404);
  expect(response.body).toBe('Not found');
});
