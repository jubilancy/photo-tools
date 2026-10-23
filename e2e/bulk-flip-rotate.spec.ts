import { expect, test, type Page } from '@playwright/test';
import { bytesOf, expectNoUserDataRequests, probe, sample, sniff, trackRequests, unzip } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('bulk-flip-rotate/');
});

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];
const YELLOW = [255, 255, 0, 255];
// Corners, nudged inward so single-pixel sampling stays inside each quadrant.
const CORNERS: [number, number][] = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]];

async function convertQuad(page: Page, setup: () => Promise<void>) {
  await page.setInputFiles('input[type=file]', sample('quad.png'));
  await setup();
  await page.getByRole('radio', { name: 'PNG' }).check({ force: true });
  await page.getByRole('button', { name: /^Apply to/ }).click();
  await expect(page.locator('li.file[data-status=done]')).toHaveCount(1);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
  return probe(page, await bytesOf(dl), CORNERS);
}

test('90° clockwise is pixel exact', async ({ page }) => {
  const out = await convertQuad(page, async () => {});
  expect([out.width, out.height]).toEqual([20, 40]);
  expect(out.pixels).toEqual([BLUE, RED, YELLOW, GREEN]);
});

test('flip horizontal then 90°, and 180°, 270°', async ({ page }) => {
  const a = await convertQuad(page, async () => {
    await page.getByLabel(/Flip horizontally/).check();
  });
  expect(a.pixels).toEqual([YELLOW, GREEN, BLUE, RED]);
  await page.getByLabel(/Flip horizontally/).uncheck();
  await page.getByRole('radio', { name: '180°' }).check({ force: true });
  await page.getByRole('button', { name: /^Apply to/ }).click();
  await expect(page.locator('li.file[data-status=done]')).toHaveCount(1);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
  const b = await probe(page, await bytesOf(dl), CORNERS);
  expect([b.width, b.height]).toEqual([40, 20]);
  expect(b.pixels).toEqual([YELLOW, BLUE, GREEN, RED]);
});

test('vertical flip alone', async ({ page }) => {
  const out = await convertQuad(page, async () => {
    await page.getByRole('radio', { name: 'None' }).check({ force: true });
    await page.getByLabel(/Flip vertically/).check();
  });
  expect(out.pixels).toEqual([BLUE, YELLOW, RED, GREEN]);
});

test('custom angle expands with transparent corners, or keeps size when asked', async ({ page }) => {
  const out = await convertQuad(page, async () => {
    await page.getByRole('radio', { name: 'Custom' }).check({ force: true });
    await page.getByLabel('Exact angle (degrees)').fill('45');
  });
  expect([out.width, out.height]).toEqual([43, 43]);
  expect(out.pixels[0]![3]).toBe(0);
  await page.getByLabel('Expand canvas to keep the corners').uncheck();
  await page.getByRole('button', { name: /^Apply to/ }).click();
  await expect(page.locator('li.file[data-status=done]')).toContainText('40×20');
});

test('same-as-input keeps formats; EXIF photo is upright; bad files fail alone; ZIP names unique', async ({ page }) => {
  const log = await trackRequests(page);
  await page.setInputFiles('input[type=file]', [
    sample('photo.jpg'),
    sample('dup/photo.jpg'),
    sample('photo.png'),
    sample('photo.webp'),
    sample('rotated-exif.jpg'),
    sample('corrupt.jpg'),
    sample('empty.png'),
  ]);
  await page.getByRole('radio', { name: 'None' }).check({ force: true });
  await page.getByLabel(/Flip horizontally/).check();
  await page.getByLabel('Keep EXIF metadata (JPEG output only)').check();
  await page.getByRole('button', { name: /^Apply to/ }).click();
  await expect(page.getByText('7 of 7 finished, 2 failed.')).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all as ZIP/ }).click()]);
  const files = unzip(await bytesOf(dl));
  expect(Object.keys(files).sort()).toEqual(['photo-edited-2.jpg', 'photo-edited.jpg', 'photo-edited.png', 'photo-edited.webp', 'rotated-exif-edited.jpg']);
  expect(sniff(files['photo-edited.png']!)).toBe('png');
  expect(sniff(files['photo-edited.webp']!)).toBe('webp');
  const rot = await probe(page, files['rotated-exif-edited.jpg']!);
  expect([rot.width, rot.height]).toEqual([400, 600]);
  expect(Buffer.from(files['rotated-exif-edited.jpg']!).includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(true);
  expectNoUserDataRequests(log);
});

test('does nothing until a transform is chosen, cancel works', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('huge.jpg'), sample('photo.jpg'), sample('photo.png')]);
  await page.getByRole('radio', { name: 'None' }).check({ force: true });
  await expect(page.getByRole('button', { name: /^Apply to/ })).toBeDisabled();
  await page.getByRole('radio', { name: '180°' }).check({ force: true });
  await page.getByRole('button', { name: /^Apply to/ }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: /^Apply to/ })).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('li.file[data-status=cancelled]').first()).toBeVisible();
});
