import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  // PDF.js ships its worker as an ES module.  Browsers reject the worker
  // when the static server falls back to application/octet-stream.
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
};

const headers = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

const resolveRequestPath = (requestUrl) => {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  const relative = pathname.replace(/^\/+/, '');
  const candidate = path.resolve(root, relative || 'index.html');
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  return candidate;
};

const findFile = async (requestUrl) => {
  const pathname = new URL(requestUrl, 'http://127.0.0.1').pathname;
  const requested = resolveRequestPath(requestUrl);
  if (!requested) return null;
  try {
    const details = await stat(requested);
    if (details.isFile()) return requested;
  } catch {
    // Try the exported route fallback below.
  }
  // Next static export writes app-router pages as `/route.html`. A request for
  // `/library` must resolve to `library.html`; falling straight back to the
  // root document hydrates the wrong route and leaves only the error boundary.
  if (!path.extname(requested)) {
    const exportedRoute = `${requested}.html`;
    try {
      await access(exportedRoute);
      return exportedRoute;
    } catch {
      // Dynamic reader routes and the root fallback are handled below.
    }
  }
  // Next's static export keeps the pages-router reader route in
  // `reader/[ids].html`. Client navigation asks for `/reader/<hash>` (and
  // sometimes an RSC `.txt` companion), so map all missing reader descendants
  // to the exported dynamic document instead of incorrectly falling back to
  // the library index.
  if (/^\/reader\/[^/]+/.test(pathname)) {
    const dynamicReader = path.join(root, 'reader', '[ids].html');
    try {
      await access(dynamicReader);
      return dynamicReader;
    } catch {
      return null;
    }
  }
  const fallback = path.extname(requested) ? requested : path.join(root, 'index.html');
  try {
    await access(fallback);
    return fallback;
  } catch {
    return null;
  }
};

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { ...headers, Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  try {
    const filePath = await findFile(request.url || '/');
    if (!filePath) {
      response.writeHead(404, headers);
      response.end('Not found');
      return;
    }
    const contentType = contentTypes[path.extname(filePath).toLowerCase()] ||
      'application/octet-stream';
    const details = await stat(filePath);
    response.writeHead(200, {
      ...headers,
      'Cache-Control': 'no-store',
      'Content-Length': details.size,
      'Content-Type': contentType,
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(500, headers);
    response.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} on http://127.0.0.1:${port}`);
});

const shutdown = () => {
  // Playwright keeps HTTP/1.1 connections alive between tests. Node waits for
  // those sockets before invoking `server.close`'s callback, which can leave
  // the Windows webServer child alive after all specs passed.
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
