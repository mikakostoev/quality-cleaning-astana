import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getContent, login, logout, putContent } from '../lib/admin-api.mjs';
import { handle } from '../lib/node-handler.mjs';

process.env.CMS_LOCAL_PUBLISH = '1';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
};

const routes = {
  '/api/admin/login': login,
  '/api/admin/logout': logout,
  '/api/admin/content': (ctx) => (ctx.method === 'PUT' ? putContent(ctx) : getContent(ctx)),
};

function fileFor(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? '/index.html' : decoded;
  const target = path.normalize(path.join(root, relative));
  if (!target.startsWith(root)) return null;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return path.join(target, 'index.html');
  }
  return target;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const fn = routes[url.pathname];
  if (fn) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return handle(req, res, fn);
  }
  const file = fileFor(url.pathname);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
  }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`admin dev http://127.0.0.1:${port}/admin`);
});
