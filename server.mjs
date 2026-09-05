#!/usr/bin/env node
/**
 * GARGANTUA — zero-dependency static server
 * Serves the project from the repo root and logs requests.
 * Usage: node server.mjs [port]   (default 8123)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv[2] || process.env.PORT || '8123', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
  '.glsl': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    /* prevent traversal */
    const safe = path.normalize(pathname).replace(/^([.\\/])+/, '');
    const file = path.join(ROOT, safe);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        /* SPA fallback: anything without extension -> index.html */
        if (!path.extname(pathname)) {
          return serve(path.join(ROOT, 'index.html'), res);
        }
        res.writeHead(404);
        return res.end('Not found: ' + pathname);
      }
      serve(file, res, st);
    });
  } catch (e) {
    res.writeHead(500);
    res.end('Server error: ' + e.message);
  }
});

function serve(file, res, st) {
  const ext = path.extname(file).toLowerCase();
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
}

server.listen(PORT, () => {
  console.log(`\n  ◉ GARGANTUA — Schwarzschild Black Hole Raytracer`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log('  Ctrl+C to stop.');
});

/* Expose port for tests */
if (process.env.GARGANTUA_PORT_FILE) {
  fs.writeFileSync(process.env.GARGANTUA_PORT_FILE, String(PORT));
}