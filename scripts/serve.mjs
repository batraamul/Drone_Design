#!/usr/bin/env node
/**
 * Minimal static file server for development and end-to-end tests.
 *
 *   node scripts/serve.mjs --root . --port 8080
 *   node scripts/serve.mjs --root _site --port 4173 --base /Drone_Design/
 *
 * --base serves the site under a sub-path, exactly like GitHub Pages serves a
 * project site, so tests catch absolute-path mistakes. Responses are sent with
 * Cache-Control: no-store so the browser never serves stale development files.
 */
import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const root = resolve(option('root', '.'));
const port = Number(option('port', 8080));
let base = option('base', '/');
if (!base.startsWith('/')) base = `/${base}`;
if (!base.endsWith('/')) base = `${base}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    if (base !== '/' && url.pathname === base.slice(0, -1)) {
      response.writeHead(301, { Location: base });
      response.end();
      return;
    }
    if (!url.pathname.startsWith(base)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found (outside base path)');
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(base.length));
    let filePath = normalize(join(root, relative));
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info?.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Server error: ${error.message}`);
  }
});

server.listen(port, () => {
  process.stdout.write(`AEROLAB X serving ${root} at http://localhost:${port}${base}\n`);
});
