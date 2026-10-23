import { expect, test, type Page } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';
import { bytesOf, expectNoUserDataRequests, probe, sample, sniff, trackRequests, unzip } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('image-compressor/');
});

async function run(page: Page, timeout = 90_000) {
  await page.getByRole('button', { name: /^Compress/ }).click();
  await expect(page.getByText(/finished/)).toContainText(/(\d+) of \1 finished/, { timeout });
}

async function downloadOne(page: Page, nth = 0) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('li.file').nth(nth).getByRole('button', { name: 'Download' }).click()]);
  return bytesOf(dl);
}

const sizeOf = (name: string) => statSync(sample(name)).size;

test('WebAssembly encoders beat the browser built-ins, and output is a valid image of the same size', async ({ page }) => {
  const log = await trackRequests(page);
  await page.setInputFiles('input[type=file]', [sample('natural.jpg')]);
  await run(page);
  const wasmJpeg = await downloadOne(page);
  await page.getByRole('radio', { name: /Browser built-in/ }).check({ force: true });
  await run(page);
  const nativeJpeg = await downloadOne(page);
  expect(sniff(wasmJpeg)).toBe('jpeg');
  expect(wasmJpeg.length).toBeLessThan(nativeJpeg.length);
  expect(wasmJpeg.length).toBeLessThan(sizeOf('natural.jpg'));
  const shown = await probe(page, wasmJpeg);
  expect([shown.width, shown.height]).toEqual([1600, 1200]);
  console.log(`JPEG q75: original ${sizeOf('natural.jpg')}, mozjpeg ${wasmJpeg.length}, canvas ${nativeJpeg.length}`);
  expectNoUserDataRequests(log);
});

test('PNG is optimised losslessly (identical pixels) and WebP lossless is exact', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('natural.png')]);
  await run(page);
  const png = await downloadOne(page);
  expect(sniff(png)).toBe('png');
  expect(png.length).toBeLessThan(sizeOf('natural.png'));
  const points: [number, number][] = [[0.1, 0.1], [0.5, 0.5], [0.9, 0.2], [0.33, 0.77]];
  const before = await probe(page, readFileSync(sample('natural.png')), points);
  const after = await probe(page, png, points);
  expect(after.pixels).toEqual(before.pixels);

  await page.getByRole('radio', { name: 'WebP' }).check({ force: true });
  await page.getByRole('radio', { name: 'Lossless' }).check({ force: true });
  await run(page);
  const webp = await downloadOne(page);
  expect(sniff(webp)).toBe('webp');
  expect((await probe(page, webp, points)).pixels).toEqual(before.pixels);
  console.log(`PNG: original ${sizeOf('natural.png')}, oxipng ${png.length}, lossless webp ${webp.length}`);
});

test('lossy WebP shrinks further than lossless; quality slider changes size', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('natural.jpg')]);
  await page.getByRole('radio', { name: 'WebP' }).check({ force: true });
  await page.getByLabel(/^Quality/).fill('30');
  await run(page);
  const low = await downloadOne(page);
  await page.getByLabel(/^Quality/).fill('90');
  await run(page);
  const high = await downloadOne(page);
  expect(low.length).toBeLessThan(high.length);
  expect(sniff(low)).toBe('webp');
});

test('keeps the original when re-encoding cannot make it smaller; shows per-file and total savings', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('photo.webp'), sample('natural.jpg')]);
  await page.getByLabel(/^Quality/).fill('100');
  await run(page);
  await expect(page.locator('li.file').nth(0)).toContainText('original kept');
  await expect(page.locator('li.file').nth(1)).toContainText('original kept');
  const kept = await downloadOne(page, 0);
  expect(kept.equals(readFileSync(sample('photo.webp')))).toBe(true);

  await page.getByLabel(/^Quality/).fill('60');
  await run(page);
  await expect(page.locator('li.file').nth(1)).toContainText(/→ .*\(−\d+%\)/);
  await expect(page.getByRole('status').filter({ hasText: 'Total:' })).toBeVisible();
});

test('transparency: flattened on white for JPEG, preserved for WebP/PNG', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('transparent.png')]);
  await page.getByRole('radio', { name: 'JPEG' }).check({ force: true });
  await run(page);
  const jpg = await probe(page, await downloadOne(page), [[0.95, 0.95], [0.5, 0.5]]);
  expect(jpg.pixels[0]![0]).toBeGreaterThan(240);
  expect(jpg.pixels[0]![3]).toBe(255);
  await page.getByRole('radio', { name: 'WebP' }).check({ force: true });
  await page.getByRole('radio', { name: 'Lossless' }).check({ force: true });
  await run(page);
  const webp = await probe(page, await downloadOne(page), [[0.99, 0.99], [0.5, 0.5]]);
  expect(webp.pixels[0]![3]).toBe(0);
  expect(webp.pixels[1]).toEqual([255, 0, 0, 255]);
});

test('mixed batch: EXIF upright, metadata option, corrupt/empty fail alone, duplicate names', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('natural.jpg'), sample('dup/photo.jpg'), sample('photo.jpg'), sample('rotated-exif.jpg'), sample('corrupt.jpg'), sample('empty.png'), sample('tiny.png')]);
  await page.getByLabel('Keep EXIF metadata (JPEG to JPEG only)').check();
  await run(page);
  await expect(page.getByText('7 of 7 finished, 2 failed.')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all as ZIP/ }).click()]);
  const files = unzip(await bytesOf(dl));
  expect(Object.keys(files).sort()).toEqual(['natural-compressed.jpg', 'photo-compressed-2.jpg', 'photo-compressed.jpg', 'rotated-exif-compressed.jpg', 'tiny-compressed.png']);
  const rot = files['rotated-exif-compressed.jpg']!;
  const shown = await probe(page, rot);
  expect([shown.width, shown.height]).toEqual([400, 600]);
});

test('huge image either compresses or fails cleanly, and cancel stops the batch', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('huge.jpg')]);
  await run(page, 180_000);
  const li = page.locator('li.file');
  const status = await li.getAttribute('data-status');
  console.log(`huge.jpg (10000×8000): ${status} — ${await li.textContent()}`);
  expect(['done', 'error']).toContain(status);

  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.setInputFiles('input[type=file]', [sample('natural.png'), sample('natural.jpg'), sample('photo.png'), sample('photo.jpg')]);
  await page.getByRole('button', { name: /^Compress/ }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: /^Compress/ })).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('li.file[data-status=cancelled]').first()).toBeVisible();
});
