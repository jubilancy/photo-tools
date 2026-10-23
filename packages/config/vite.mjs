import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Shared Vite config for every tool.
 *
 * `base: './'` emits relative asset URLs, so a build works unchanged at
 * https://<user>.github.io/<repo>/<slug>/, on a custom domain, or from any
 * local subpath. `scripts/check-paths.mjs` enforces this after the build.
 *
 * @param {import('vite').UserConfig} [overrides]
 */
export function toolConfig(overrides = {}) {
  return defineConfig({
    base: './',
    plugins: [react()],
    worker: { format: 'es' },
    build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, ...overrides.build },
    server: { port: 5173 },
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'build')),
  });
}
