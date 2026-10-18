import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { readPackagedProbeTargets } from '../../../scripts/packaged-runtime-transport.mjs';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
});

const serve = async (response: string, status = 200) => {
  const server = createServer((request, reply) => {
    expect(request.url).toBe('/json/list');
    reply.writeHead(status);
    reply.end(response);
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local port');
  return address.port;
};

it('uses direct loopback HTTP even when the global fetch path is unavailable', async () => {
  const port = await serve('[{"type":"page","url":"http://tauri.localhost/"}]');
  const previous = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('Global fetch must not be used'));
  try {
    expect(await readPackagedProbeTargets(port)).toEqual([
      { type: 'page', url: 'http://tauri.localhost/' },
    ]);
  } finally {
    globalThis.fetch = previous;
  }
});

it.each([
  '{}',
  'not JSON',
  JSON.stringify(Array.from({ length: 33 }, () => ({}))),
])('rejects malformed or excessive target lists', async (body) => {
  await expect(readPackagedProbeTargets(await serve(body))).rejects.toThrow();
});

it('does not follow an HTTP redirect or accept oversized endpoint data', async () => {
  await expect(readPackagedProbeTargets(await serve('[]', 302))).rejects.toThrow();
  await expect(
    readPackagedProbeTargets(await serve(' '.repeat(1024 * 1024 + 1))),
  ).rejects.toThrow();
});

it.each([0, -1, 1.5, 65536])('rejects an invalid local port', async (port) => {
  await expect(readPackagedProbeTargets(port)).rejects.toThrow();
});
