import { get } from 'node:http';

/** Never route an owned DevTools endpoint through a global fetch dispatcher. */
export async function readPackagedProbeTargets(port) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new Error('Invalid packaged-probe loopback port');
  const limit = 1024 * 1024;
  return new Promise((done, fail) => {
    const request = get({
      hostname: '127.0.0.1', port, path: '/json/list', agent: false,
    }, (response) => {
      const rejectResponse = (error) => {
        response.destroy();
        request.destroy();
        fail(error);
      };
      if (response.statusCode !== 200) {
        rejectResponse(new Error('Unexpected loopback HTTP status: ' + response.statusCode));
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > limit) {
          rejectResponse(new Error('Packaged-probe endpoint exceeded response budget'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', fail);
      response.on('end', () => {
        clearTimeout(timer);
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!Array.isArray(value) || value.length > 32)
            throw new Error('Invalid packaged-probe target list');
          done(value);
        } catch (error) { fail(error); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('Loopback endpoint timed out')), 1000);
    request.on('error', fail);
    request.on('close', () => clearTimeout(timer));
  });
}
