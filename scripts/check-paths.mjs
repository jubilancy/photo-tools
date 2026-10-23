// Fails when a built HTML file references an absolute "/" path, which breaks under /<repo>/ subpaths.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const site = join(new URL('..', import.meta.url).pathname, 'site');
const attr = /\b(?:src|href|poster|data-src)\s*=\s*["']\/(?!\/)[^"']*["']/gi;

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith('.html')) yield p;
  }
}

let bad = 0;
for (const file of htmlFiles(site)) {
  for (const m of readFileSync(file, 'utf8').matchAll(attr)) {
    console.error(`${file.slice(site.length)}: absolute path ${m[0]}`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log('no absolute asset paths in built HTML');
