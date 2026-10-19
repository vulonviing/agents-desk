import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadConfig, scan, writeProjects } from '../scanner/scan.js';

const OFFICE = join(ROOT, 'office');
const DATA = join(ROOT, 'data', 'projects.json');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function rescan() {
  const data = scan(loadConfig());
  writeProjects(data, DATA);
  return data;
}

function readProjects() {
  return existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')) : rescan();
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

// Only loopback hosts: blocks DNS-rebinding style requests from other origins.
const hostOk = (req) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '');
const originOk = (req) => !req.headers.origin || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin);

export function createDeskServer() {
  return createServer((req, res) => {
    if (!hostOk(req)) return send(res, 403, { error: 'forbidden host' });
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/projects' && req.method === 'GET') return send(res, 200, readProjects());
      if (url.pathname === '/api/rescan' && req.method === 'POST') {
        if (!originOk(req)) return send(res, 403, { error: 'forbidden origin' });
        return send(res, 200, rescan());
      }
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = resolve(OFFICE, normalize(rel));
      if (!file.startsWith(OFFICE + sep) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: 'not found' });
      return send(res, 200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
    } catch (err) {
      return send(res, 500, { error: String(err.message ?? err) });
    }
  });
}

async function listen(server, port) {
  for (let p = port; p < port + 20; p++) {
    const ok = await new Promise((done) => {
      server.once('error', () => done(false));
      server.listen(p, '127.0.0.1', () => done(true));
    });
    if (ok) return p;
  }
  throw new Error(`no free port from ${port}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = await listen(createDeskServer(), loadConfig().port ?? 4317);
  console.log(`Agents Desk → http://127.0.0.1:${port}/`);
}
