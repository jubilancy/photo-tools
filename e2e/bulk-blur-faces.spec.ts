import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { bytesOf, expectNoUserDataRequests, probe, sample, trackRequests, unzip } from './helpers';

const hasFace = existsSync(sample('portrait.jpg'));

test.beforeEach(async ({ page }) => {
  await page.goto('bulk-blur-faces/');
});

async function waitForDetection(page: Page) {
  await expect(page.getByTestId('face-count').filter({ hasText: 'Detecting' })).toHaveCount(0, { timeout: 60_000 });
}

async function run(page: Page) {
  await page.getByRole('radio', { name: 'PNG' }).check({ force: true });
  await page.getByRole('button', { name: /^Blur faces in/ }).click();
  await expect(page.getByText(/finished/)).toContainText(/(\d+) of \1 finished/, { timeout: 90_000 });
}

async function downloadNth(page: Page, n: number) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('li.file').nth(n).getByRole('button', { name: 'Download' }).click()]);
  return bytesOf(dl);
}

/** Mean absolute channel difference between two same-size grids of sampled pixels. */
const diff = (a: number[][], b: number[][]) => a.reduce((s, p, i) => s + p.slice(0, 3).reduce((t, v, c) => t + Math.abs(v - b[i]![c]!), 0), 0) / (a.length * 3);

const grid = (x0: number, y0: number, x1: number, y1: number, n = 8): [number, number][] =>
  Array.from({ length: n * n }, (_, i) => [x0 + ((i % n) / (n - 1)) * (x1 - x0), y0 + (Math.floor(i / n) / (n - 1)) * (y1 - y0)]);

test.describe('with a real face photo', () => {
  test.skip(!hasFace, 'portrait.jpg was not downloaded (offline)');

  test('detects the face on-device, blurs only that area, and sends nothing out', async ({ page }) => {
    const log = await trackRequests(page);
    await page.setInputFiles('input[type=file]', sample('portrait.jpg'));
    await waitForDetection(page);
    await expect(page.getByTestId('face-count')).toHaveText('1 found');
    await expect(page.getByTestId('region')).toHaveCount(1);
    await run(page);
    await expect(page.locator('li.file')).toContainText('1 region hidden');
    const out = await downloadNth(page, 0);
    const face = grid(0.45, 0.12, 0.55, 0.28);
    const background = grid(0.05, 0.6, 0.15, 0.7);
    const before = await probe(page, readFileSync(sample('portrait.jpg')), [...face, ...background]);
    const after = await probe(page, out, [...face, ...background]);
    expect(diff(after.pixels.slice(0, 64), before.pixels.slice(0, 64))).toBeGreaterThan(3);
    expect(diff(after.pixels.slice(64), before.pixels.slice(64))).toBeLessThan(1);
    expect([after.width, after.height]).toEqual([820, 1024]);
    expectNoUserDataRequests(log);
  });

  test('manual regions: draw, remove with × and with the keyboard; pixelate and rectangle', async ({ page }) => {
    await page.setInputFiles('input[type=file]', sample('portrait.jpg'));
    await waitForDetection(page);
    const stage = page.locator('.region-stage');
    await page.setViewportSize({ width: 1280, height: 1400 });
    await stage.scrollIntoViewIfNeeded();
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.7, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('region')).toHaveCount(2);

    await page.getByRole('radio', { name: 'Pixelate' }).check({ force: true });
    await page.getByRole('radio', { name: 'Rectangle' }).check({ force: true });
    await run(page);
    await expect(page.locator('li.file')).toContainText('2 regions hidden');
    const out = await downloadNth(page, 0);
    const drawn = grid(0.12, 0.62, 0.18, 0.68);
    const before = await probe(page, readFileSync(sample('portrait.jpg')), drawn);
    const after = await probe(page, out, drawn);
    expect(diff(after.pixels, before.pixels)).toBeGreaterThan(2);

    await page.getByRole('button', { name: 'Remove region 2' }).click();
    await expect(page.getByTestId('region')).toHaveCount(1);
    await page.getByTestId('region').first().focus();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('region')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add a region' }).click();
    await expect(page.getByTestId('region')).toHaveCount(1);
    await page.getByTestId('region').first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('+');
    await page.getByRole('button', { name: 'Remove all' }).click();
    await expect(page.getByTestId('region')).toHaveCount(0);
  });
});

test('photos without faces pass through; corrupt files fail alone; names stay unique; cancel works', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('photo.jpg'), sample('dup/photo.jpg'), sample('rotated-exif.jpg'), sample('corrupt.jpg'), sample('empty.png')]);
  await waitForDetection(page);
  const counts = await page.getByTestId('face-count').allTextContents();
  expect(counts.filter((c) => c === 'Detection failed')).toHaveLength(2);
  await run(page);
  await expect(page.getByText('5 of 5 finished, 2 failed.')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all as ZIP/ }).click()]);
  const files = unzip(await bytesOf(dl));
  expect(Object.keys(files).sort()).toEqual(['photo-blurred-2.png', 'photo-blurred.png', 'rotated-exif-blurred.png']);
  const rot = await probe(page, files['rotated-exif-blurred.png']!);
  expect([rot.width, rot.height]).toEqual([400, 600]);

  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.setInputFiles('input[type=file]', [sample('huge.jpg'), sample('photo.jpg'), sample('photo.png'), sample('natural.jpg')]);
  await waitForDetection(page);
  await page.getByRole('button', { name: /^Blur faces in/ }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: /^Blur faces in/ })).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('li.file[data-status=cancelled]').first()).toBeVisible();
});
