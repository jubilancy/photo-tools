import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
});
