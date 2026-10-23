import { expect, test } from '@playwright/test';
import { bytesOf, expectNoUserDataRequests, probe, sample, sniff, trackRequests, unzip } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('grayscale-images/');
});

const isGray = (p: number[]) => Math.abs(p[0]! - p[1]!) <= 1 && Math.abs(p[1]! - p[2]!) <= 1;

test('converts a mixed batch, survives bad files, zips with unique names', async ({ page }) => {
  const log = await trackRequests(page);
  await page.setInputFiles('input[type=file]', [
    sample('photo.jpg'),
    sample('dup/photo.jpg'),
    sample('transparent.png'),
    sample('tiny.png'),
    sample('rotated-exif.jpg'),
    sample('corrupt.jpg'),
    sample('empty.png'),
  ]);
  await expect(page.locator('li.file')).toHaveCount(7);
  await page.getByRole('button', { name: /^Convert/ }).click();
  await expect(page.getByText('7 of 7 finished, 2 failed.')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('li.file[data-status=error]')).toHaveCount(2);
  await expect(page.locator('li.file[data-status=error]').first()).toContainText(/could not be read|empty/);

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all as ZIP/ }).click()]);
  const files = unzip(await bytesOf(dl));
  expect(Object.keys(files).sort()).toEqual(['photo-gray-2.jpg', 'photo-gray.jpg', 'rotated-exif-gray.jpg', 'tiny-gray.jpg', 'transparent-gray.jpg']);

  const photo = await probe(page, files['photo-gray.jpg']!, [[0.2, 0.2], [0.8, 0.8]]);
  expect(photo.width).toBe(1200);
  expect(photo.pixels.every(isGray)).toBe(true);
  // EXIF orientation 6: stored 600x400 must come out as 400x600.
  const rot = await probe(page, files['rotated-exif-gray.jpg']!);
  expect([rot.width, rot.height]).toEqual([400, 600]);
  // Transparent → JPEG is flattened on white, not black.
  const tr = await probe(page, files['transparent-gray.jpg']!, [[0.95, 0.95]]);
  expect(tr.pixels[0]![0]).toBeGreaterThan(240);
  expectNoUserDataRequests(log);
});

test('intensity 0 keeps colour; PNG output keeps alpha; WebGL and Canvas 2D agree', async ({ page }) => {
  await page.setInputFiles('input[type=file]', sample('transparent.png'));
  await page.getByLabel(/^Intensity/).fill('0');
  await page.getByRole('radio', { name: 'PNG' }).check({ force: true });
  await page.getByRole('button', { name: /^Convert/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
  const colour = await bytesOf(dl);
  expect(sniff(colour)).toBe('png');
  const p0 = await probe(page, colour, [[0.5, 0.5], [0.05, 0.05], [0.99, 0.01]]);
  expect(p0.pixels[0]).toEqual([255, 0, 0, 255]);
  expect(p0.pixels[2]![3]).toBe(0);

  const render = async (gpu: boolean) => {
    await page.getByLabel(/^Intensity/).fill('1');
    const box = page.getByLabel('Use the GPU (WebGL) when available');
    if (gpu) await box.check(); else await box.uncheck();
    await page.getByRole('button', { name: /^Convert/ }).click();
    await expect(page.getByText(gpu ? 'GPU' : 'Canvas 2D', { exact: false }).first()).toBeVisible();
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
    return probe(page, await bytesOf(d), [[0.5, 0.5], [0.08, 0.08], [0.99, 0.01]]);
  };
  const gpu = await render(true);
  const cpu = await render(false);
  for (let i = 0; i < 3; i++) for (let c = 0; c < 4; c++) expect(Math.abs(gpu.pixels[i]![c]! - cpu.pixels[i]![c]!)).toBeLessThanOrEqual(3);
  expect(isGray(cpu.pixels[0]!)).toBe(true);
});

test('huge image converts and cancel stops the batch', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('huge.jpg'), sample('photo.jpg'), sample('photo.png'), sample('photo.webp')]);
  await page.getByRole('button', { name: /^Convert/ }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: /^Convert/ })).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('li.file[data-status=cancelled]').first()).toBeVisible();
});

test('huge image completes', async ({ page }) => {
  await page.setInputFiles('input[type=file]', sample('huge.jpg'));
  await page.getByRole('button', { name: /^Convert/ }).click();
  await expect(page.locator('li.file[data-status=done]')).toHaveCount(1, { timeout: 90_000 });
  await expect(page.locator('li.file')).toContainText('10000×8000');
});

test('keeps EXIF in JPEG output only when asked', async ({ page }) => {
  await page.setInputFiles('input[type=file]', sample('rotated-exif.jpg'));
  const convert = async (keep: boolean) => {
    const box = page.getByLabel('Keep EXIF metadata (JPEG output only)');
    if (keep) await box.check(); else await box.uncheck();
    await page.getByRole('button', { name: /^Convert/ }).click();
    await expect(page.locator('li.file[data-status=done]')).toHaveCount(1);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
    return bytesOf(dl);
  };
  const kept = await convert(true);
  const stripped = await convert(false);
  expect(kept.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(true);
  expect(stripped.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(false);
  const shown = await probe(page, kept);
  expect([shown.width, shown.height]).toEqual([400, 600]);
});
