// Serve dist/ with the headers from dist/_headers, the way Cloudflare Pages
// will, to check the Content Security Policy locally before deploying.
// Usage: npm run build && node scripts/serve-with-headers.mjs [port]

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.argv[2] ?? 4175);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
};

/** Parse _headers into [pattern, headers] rules (only the forms this project uses). */
function rules() {
  const out = [];
  let current;
  for (const line of readFileSync(join(root, '_headers'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: {} };
      out.push(current);
    } else if (current) {
      const i = line.indexOf(':');
      current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return out;
}

const matches = (pattern, path) =>
  pattern.endsWith('/*') ? path.startsWith(pattern.slice(0, -1)) || pattern === '/*' : pattern === path;

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(normalize(root)) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, 'index.html');
  }
  for (const rule of rules()) if (matches(rule.pattern, path)) for (const [k, v] of Object.entries(rule.headers)) res.setHeader(k, v);
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving dist/ with _headers on http://localhost:${port}`));
