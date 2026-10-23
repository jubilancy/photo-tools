import { expect, test, type Page } from '@playwright/test';
import { bytesOf, expectNoUserDataRequests, probe, sample, sniff, trackRequests, unzip } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('bulk-image-resize/');
});

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];

async function run(page: Page) {
  await page.getByRole('button', { name: /^Resize/ }).click();
  await expect(page.getByText(/finished/)).toContainText(/(\d+) of \1 finished/, { timeout: 90_000 });
}

async function downloadOne(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
  return bytesOf(dl);
}

test('longest side, percent and pixel modes compute the expected sizes', async ({ page }) => {
  const log = await trackRequests(page);
  await page.setInputFiles('input[type=file]', sample('photo.jpg'));
  await page.getByLabel('Longest side (px)').fill('100');
  await run(page);
  await expect(page.locator('li.file')).toContainText('1200×800 → 100×67');

  await page.getByRole('radio', { name: 'Percent' }).check({ force: true });
  await page.getByLabel(/^Scale/).fill('25');
  await run(page);
  await expect(page.locator('li.file')).toContainText('→ 300×200');

  await page.getByRole('radio', { name: 'Width × height' }).check({ force: true });
  await page.getByLabel('Width (px)').fill('240');
  await page.getByLabel('Height (px)').fill('');
  await run(page);
  await expect(page.locator('li.file')).toContainText('→ 240×160');
  const out = await probe(page, await downloadOne(page));
  expect([out.width, out.height]).toEqual([240, 160]);
  expectNoUserDataRequests(log);
});

test('fill crops from the centre, pad adds colour, stretch ignores the ratio', async ({ page }) => {
  await page.setInputFiles('input[type=file]', sample('quad.png'));
  await page.getByRole('radio', { name: 'Width × height' }).check({ force: true });
  await page.getByRole('radio', { name: 'PNG' }).check({ force: true });
  await page.getByLabel('Width (px)').fill('20');
  await page.getByLabel('Height (px)').fill('20');
  await page.getByLabel('When both are set').selectOption('cover');
  await run(page);
  let out = await probe(page, await downloadOne(page), [[0.1, 0.1], [0.9, 0.1]]);
  expect([out.width, out.height]).toEqual([20, 20]);
  expect(out.pixels).toEqual([RED, GREEN]);

  await page.getByLabel('When both are set').selectOption('pad');
  await page.getByLabel('Width (px)').fill('40');
  await page.getByLabel('Height (px)').fill('40');
  await page.getByLabel('Padding colour').fill('#00ff00');
  await run(page);
  out = await probe(page, await downloadOne(page), [[0.5, 0.05], [0.1, 0.4], [0.5, 0.95]]);
  expect([out.width, out.height]).toEqual([40, 40]);
  expect(out.pixels).toEqual([GREEN, RED, GREEN]);

  await page.getByLabel('Keep aspect ratio').uncheck();
  await page.getByLabel('Width (px)').fill('10');
  await page.getByLabel('Height (px)').fill('30');
  await run(page);
  out = await probe(page, await downloadOne(page));
  expect([out.width, out.height]).toEqual([10, 30]);
});

test("don't-enlarge keeps tiny images; unticking enlarges; transparency survives", async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('tiny.png'), sample('transparent.png')]);
  await page.getByLabel('Longest side (px)').fill('800');
  await run(page);
  await expect(page.locator('li.file').nth(0)).toContainText('1×1 → 1×1');
  await expect(page.locator('li.file').nth(1)).toContainText('400×300 → 400×300');
  await page.getByLabel("Don't enlarge smaller images").uncheck();
  await run(page);
  await expect(page.locator('li.file').nth(0)).toContainText('1×1 → 800×800');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('li.file').nth(1).getByRole('button', { name: 'Download' }).click()]);
  const bytes = await bytesOf(dl);
  expect(sniff(bytes)).toBe('png');
  const out = await probe(page, bytes, [[0.99, 0.99], [0.5, 0.5]]);
  expect([out.width, out.height]).toEqual([800, 600]);
  expect(out.pixels[0]![3]).toBe(0);
  expect(out.pixels[1]).toEqual(RED);
});

test('mixed batch: EXIF upright, corrupt/empty fail alone, duplicate names, format conversion', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('photo.jpg'), sample('dup/photo.jpg'), sample('rotated-exif.jpg'), sample('corrupt.jpg'), sample('empty.png'), sample('photo.webp')]);
  await page.getByLabel('Longest side (px)').fill('200');
  await page.getByRole('radio', { name: 'WebP' }).check({ force: true });
  await run(page);
  await expect(page.getByText('6 of 6 finished, 2 failed.')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all as ZIP/ }).click()]);
  const files = unzip(await bytesOf(dl));
  expect(Object.keys(files).sort()).toEqual(['photo-200x133-2.webp', 'photo-200x133-3.webp', 'photo-200x133.webp', 'rotated-exif-133x200.webp']);
  for (const bytes of Object.values(files)) expect(sniff(bytes)).toBe('webp');
});

test('huge image resizes, invalid options block the run, cancel works', async ({ page }) => {
  await page.setInputFiles('input[type=file]', sample('huge.jpg'));
  await page.getByLabel('Longest side (px)').fill('500');
  await run(page);
  await expect(page.locator('li.file')).toContainText('10000×8000 → 500×400');

  await page.getByRole('radio', { name: 'Width × height' }).check({ force: true });
  await page.getByLabel('Width (px)').fill('');
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a width' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Resize/ })).toBeDisabled();

  await page.getByRole('radio', { name: 'Longest side' }).check({ force: true });
  await page.setInputFiles('input[type=file]', [sample('huge.jpg'), sample('photo.jpg'), sample('photo.png')]);
  await page.getByRole('button', { name: /^Resize/ }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: /^Resize/ })).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('li.file[data-status=cancelled]').first()).toBeVisible();
});
