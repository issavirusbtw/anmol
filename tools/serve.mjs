// Production server: serves the built game (dist/) and the multiplayer relay at /mp on one port.
// npm run build && npm start   ->  http://127.0.0.1:8080   (hosts set PORT, HOST=0.0.0.0, TRUST_PROXY=1)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { attachMp } from './mp-server.mjs';

const root = path.resolve('dist');
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('dist/index.html is missing: run "npm run build" first.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const fail = (code) => {
    res.writeHead(code, { 'content-type': 'text/plain' });
    res.end(String(code));
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405);
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    return fail(400);
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, rel);
  // path.join resolves "..": anything that lands outside dist/ is refused
  if (!file.startsWith(root + path.sep) || rel.includes('\0')) return fail(403);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return fail(404);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': st.size,
      // Vite fingerprints everything under assets/, so it can be cached forever; the page itself never is
      'cache-control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
});

attachMp(server);
// attachMp only answers /mp; nothing else upgrades here, so don't leave other sockets hanging
server.on('upgrade', (req, sock) => {
  if (!(req.url ?? '').startsWith('/mp')) sock.destroy();
});
server.listen(port, host, () => console.log(`Shelf Life on http://${host}:${port}`));
