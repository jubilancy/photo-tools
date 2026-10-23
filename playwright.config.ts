import { defineConfig } from '@playwright/test';

const base = process.env.BASE_URL ?? 'http://localhost:4173/photo-tools/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: base,
    acceptDownloads: true,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'node scripts/serve.mjs', url: base, reuseExistingServer: true },
});
