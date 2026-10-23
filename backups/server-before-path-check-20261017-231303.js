import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end('Bad request'); return; }
  if (pathname === '/') pathname = '/index.html';
  const target = resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(root + sep)) { response.writeHead(403).end('Forbidden'); return; }
  try {
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    if (request.method === 'HEAD') response.end(); else response.end(body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error.code === 'ENOENT' ? 'Not found' : 'Unable to read requested file');
  }
});

const hasExplicitPort = Boolean(process.env.PORT);
const startingPort = Number(hasExplicitPort ? process.env.PORT : 4173);

if (!Number.isInteger(startingPort) || startingPort < 1 || startingPort > 65535) {
  console.error(`Invalid PORT value: ${process.env.PORT}`);
  process.exitCode = 1;
} else {
  function listenAt(port) {
    const onError = (error) => {
      if (error.code === 'EADDRINUSE' && !hasExplicitPort && port < 65535) {
        const nextPort = port + 1;
        console.warn(`Port ${port} is already in use; trying ${nextPort}.`);
        listenAt(nextPort);
        return;
      }

      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Stop the other server or choose another port with PORT=<port>.`);
      } else {
        console.error(`Could not start Habit Tracker: ${error.message}`);
      }
      process.exitCode = 1;
    };

    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError);
      console.log(`Habit Tracker running at http://127.0.0.1:${port}`);
    });
  }

  listenAt(startingPort);
}
