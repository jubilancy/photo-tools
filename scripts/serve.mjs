// Serves site/ under a subpath (default /photo-tools/) to mimic GitHub Pages project hosting.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const prefix = process.env.PREFIX ?? '/photo-tools/';
const port = Number(process.env.PORT ?? 4173);
const site = join(new URL('..', import.meta.url).pathname, 'site');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.mjs': 'text/javascript',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!url.pathname.startsWith(prefix)) { res.writeHead(404).end('not found'); return; }
  let file = normalize(join(site, decodeURIComponent(url.pathname.slice(prefix.length))));
  if (!file.startsWith(site)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}${prefix}`));
