import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDeskServer } from '../server/server.js';

function request(port, path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body, type: res.headers['content-type'] }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('server: serves the page, blocks foreign hosts/origins and path traversal', async (t) => {
  const server = createDeskServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const { port } = server.address();

  const page = await request(port, '/');
  assert.equal(page.status, 200);
  assert.match(page.type, /text\/html/);

  const foreignHost = await request(port, '/', { headers: { host: 'evil.example' } });
  assert.equal(foreignHost.status, 403);

  const foreignOrigin = await request(port, '/api/rescan', { method: 'POST', headers: { origin: 'http://evil.example' } });
  assert.equal(foreignOrigin.status, 403);

  const traversal = await request(port, '/..%2fpackage.json');
  assert.equal(traversal.status, 404);

  const post = await request(port, '/index.html', { method: 'POST' });
  assert.equal(post.status, 405);
});
