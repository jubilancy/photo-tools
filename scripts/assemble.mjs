// Copies apps/landing/dist to site/ and every other app's dist to site/<slug>/.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'site');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const slug of readdirSync(join(root, 'apps'))) {
  const dist = join(root, 'apps', slug, 'dist');
  if (!existsSync(dist)) {
    console.error(`missing build output for ${slug}: run pnpm build first`);
    process.exit(1);
  }
  cpSync(dist, slug === 'landing' ? out : join(out, slug), { recursive: true });
}
// Pages runs Jekyll on branch deploys only; this keeps underscore-prefixed assets safe if that ever changes.
writeFileSync(join(out, '.nojekyll'), '');
console.log(`assembled ${readdirSync(out).length} entries into site/`);
