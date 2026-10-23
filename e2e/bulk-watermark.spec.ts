import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bytesOf, expectNoUserDataRequests, probe, sample, trackRequests, unzip } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('bulk-watermark/');
});

const near = (a: number[], b: number[], tol = 12) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]!) <= tol);

async function useImageMark(page: import('@playwright/test').Page, file = 'mark-wide.png') {
  await page.getByRole('radio', { name: 'Image' }).check({ force: true });
  await page.getByLabel('Watermark image').setInputFiles(sample(file));
}

async function setSlider(page: import('@playwright/test').Page, label: RegExp, value: number) {
  await page.getByLabel(label).fill(String(value));
}

async function exportPng(page: import('@playwright/test').Page, points: [number, number][]) {
  await page.getByRole('radio', { name: 'PNG' }).check({ force: true });
  await page.getByRole('button', { name: /^Apply to/ }).click();
  await expect(page.locator('li.file[data-status=done]')).toHaveCount(1);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
  return probe(page, await bytesOf(dl), points);
}

test('image watermark lands in the chosen spot at the chosen opacity and size', async ({ page }) => {
  const log = await trackRequests(page);
  await page.setInputFiles('input[type=file] >> nth=0', sample('photo.png'));
  await useImageMark(page);
  await page.getByRole('radio', { name: 'Middle centre' }).check({ force: true });
  await setSlider(page, /^Opacity/, 1);
  await setSlider(page, /^Size/, 20);
  await expect(page.getByRole('img', { name: /Preview of photo.png/ })).toBeVisible();
  // 1200px wide image, 20% → 240×60 red bar centred.
  const out = await exportPng(page, [[0.5, 0.5], [0.5 + 100 / 1200, 0.5], [0.5 + 140 / 1200, 0.5], [0.5, 0.5 + 40 / 800], [0.02, 0.02]]);
  expect(out.pixels[0]).toEqual([255, 0, 0, 255]);
  expect(out.pixels[1]).toEqual([255, 0, 0, 255]);
  expect(near(out.pixels[2]!, [255, 0, 0], 0)).toBe(false); // outside the 240px bar
  expect(near(out.pixels[3]!, [255, 0, 0], 0)).toBe(false); // outside the 60px height
  const original = await probe(page, readFileSync(sample('photo.png')), [[0.02, 0.02]]);
  expect(out.pixels[4]).toEqual(original.pixels[0]);
  expectNoUserDataRequests(log);
});

test('rotation turns the bar upright', async ({ page }) => {
  await page.setInputFiles('input[type=file] >> nth=0', sample('photo.png'));
  await useImageMark(page);
  await page.getByRole('radio', { name: 'Middle centre' }).check({ force: true });
  await setSlider(page, /^Opacity/, 1);
  await setSlider(page, /^Size/, 20);
  await setSlider(page, /^Rotation/, 90);
  const out = await exportPng(page, [[0.5, 0.5 + 100 / 800], [0.5 + 100 / 1200, 0.5]]);
  expect(out.pixels[0]).toEqual([255, 0, 0, 255]); // 240 tall now
  expect(near(out.pixels[1]!, [255, 0, 0], 0)).toBe(false); // only 60 wide now
});

test('tiling repeats the mark and half opacity blends', async ({ page }) => {
  await page.setInputFiles('input[type=file] >> nth=0', sample('photo.png'));
  await useImageMark(page);
  await page.getByLabel('Tile across the whole image').check();
  await setSlider(page, /^Opacity/, 0.5);
  await setSlider(page, /^Size/, 10); // 120×30
  await setSlider(page, /^Tile spacing/, 100); // step 240×60
  const pts: [number, number][] = [[0.5, 0.5], [0.5 + 240 / 1200, 0.5], [0.5, 0.5 + 60 / 800], [0.5 - 240 / 1200, 0.5 - 60 / 800], [0.5 + 120 / 1200, 0.5]];
  const out = await exportPng(page, pts);
  const original = await probe(page, readFileSync(sample('photo.png')), pts);
  const blend = (px: number[]) => [(px[0]! + 255) / 2, px[1]! / 2, px[2]! / 2];
  for (const i of [0, 1, 2, 3]) expect(near(out.pixels[i]!, blend(original.pixels[i]!), 3)).toBe(true);
  // halfway between tiles stays untouched
  expect(near(out.pixels[4]!, original.pixels[4]!, 2)).toBe(true);
});

test('text watermark changes pixels near the bottom-right corner only', async ({ page }) => {
  await page.setInputFiles('input[type=file] >> nth=0', sample('photo.png'));
  await setSlider(page, /^Opacity/, 1);
  const grid: [number, number][] = [];
  for (let x = 0; x < 12; x++) for (let y = 0; y < 6; y++) grid.push([0.7 + x * 0.025, 0.9 + y * 0.016]);
  const topLeft: [number, number][] = [[0.1, 0.1], [0.2, 0.2], [0.3, 0.1]];
  const out = await exportPng(page, [...grid, ...topLeft]);
  const original = await probe(page, readFileSync(sample('photo.png')), [...grid, ...topLeft]);
  const changed = grid.filter((_, i) => !near(out.pixels[i]!, original.pixels[i]!, 2)).length;
  expect(changed).toBeGreaterThan(5);
  topLeft.forEach((_, i) => expect(out.pixels[grid.length + i]).toEqual(original.pixels[grid.length + i]));
});

test('mixed batch: bad files fail alone, EXIF-rotated photo keeps its upright size, ZIP names are unique', async ({ page }) => {
  await page.setInputFiles('input[type=file] >> nth=0', [
    sample('photo.jpg'),
    sample('dup/photo.jpg'),
    sample('rotated-exif.jpg'),
    sample('corrupt.jpg'),
    sample('empty.png'),
    sample('tiny.png'),
  ]);
  await page.getByRole('button', { name: /^Apply to/ }).click();
  await expect(page.getByText('6 of 6 finished, 2 failed.')).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all as ZIP/ }).click()]);
  const files = unzip(await bytesOf(dl));
  expect(Object.keys(files).sort()).toEqual(['photo-watermarked-2.jpg', 'photo-watermarked.jpg', 'rotated-exif-watermarked.jpg', 'tiny-watermarked.jpg']);
  const rot = await probe(page, files['rotated-exif-watermarked.jpg']!);
  expect([rot.width, rot.height]).toEqual([400, 600]);
});

test('requires a watermark image before running, and cancel works on a large batch', async ({ page }) => {
  await page.setInputFiles('input[type=file] >> nth=0', [sample('huge.jpg'), sample('photo.jpg'), sample('photo.png')]);
  await page.getByRole('radio', { name: 'Image' }).check({ force: true });
  await expect(page.getByRole('button', { name: /^Apply to/ })).toBeDisabled();
  await useImageMark(page);
  await page.getByRole('button', { name: /^Apply to/ }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: /^Apply to/ })).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('li.file[data-status=cancelled]').first()).toBeVisible();
});
