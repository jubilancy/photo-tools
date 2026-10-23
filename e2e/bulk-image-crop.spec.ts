import { expect, test, type Page } from '@playwright/test';
import { bytesOf, expectNoUserDataRequests, probe, sample, trackRequests, unzip } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('bulk-image-crop/');
});

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const readout = (page: Page) => page.getByTestId('crop-readout');

async function crop(page: Page) {
  await page.getByRole('button', { name: /^Crop \d/ }).click();
  await expect(page.getByText(/finished/)).toContainText(/(\d+) of \1 finished/, { timeout: 90_000 });
}

async function downloadNth(page: Page, n: number) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('li.file').nth(n).getByRole('button', { name: 'Download' }).click()]);
  return bytesOf(dl);
}

async function dragBox(page: Page, dxFrac: number, dyFrac = 0, handle?: string) {
  const target = handle ? page.locator(`.crop-handle[data-handle=${handle}]`) : page.locator('.crop-box');
  await target.scrollIntoViewIfNeeded();
  const stage = (await page.locator('.crop-stage').boundingBox())!;
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dxFrac * stage.width / 2, y + dyFrac * stage.height / 2, { steps: 4 });
  await page.mouse.move(x + dxFrac * stage.width, y + dyFrac * stage.height, { steps: 4 });
  await page.mouse.up();
}

test('same crop for all: 1:1 on mixed shapes, no network calls', async ({ page }) => {
  const log = await trackRequests(page);
  await page.setInputFiles('input[type=file]', [sample('photo.jpg'), sample('rotated-exif.jpg')]);
  await expect(readout(page)).toContainText('Source 1200×800 · crop 800×800 at (200, 0)');
  await crop(page);
  await expect(page.locator('li.file').nth(0)).toContainText('800×800');
  await expect(page.locator('li.file').nth(1)).toContainText('400×400'); // EXIF-rotated 400×600 source
  expectNoUserDataRequests(log);
});

test('dragging the box moves the crop and the export matches', async ({ page }) => {
  await page.setInputFiles('input[type=file]', sample('quad.png'));
  await page.getByRole('radio', { name: 'PNG' }).check({ force: true });
  await expect(readout(page)).toContainText('crop 20×20 at (10, 0)');
  await dragBox(page, -0.6); // far left, clamped to the edge
  await expect(readout(page)).toContainText('crop 20×20 at (0, 0)');
  await crop(page);
  const out = await probe(page, await downloadNth(page, 0), [[0.25, 0.25], [0.25, 0.75], [0.75, 0.25]]);
  expect([out.width, out.height]).toEqual([20, 20]);
  expect(out.pixels).toEqual([RED, BLUE, RED]);
});

test('keyboard: arrows move, plus/minus resize', async ({ page }) => {
  await page.setInputFiles('input[type=file]', sample('photo.png'));
  await expect(readout(page)).toContainText('crop 800×800 at (200, 0)');
  await page.locator('.crop-box').focus();
  await page.keyboard.press('-');
  await expect(readout(page)).toContainText('crop 792×792');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(readout(page)).toContainText(/at \((1[0-9]{2}|[0-9]{1,2}), /);
  const before = await readout(page).textContent();
  await page.keyboard.press('+');
  expect(await readout(page).textContent()).not.toBe(before);
});

test('exact size crops to the ratio and scales to the requested pixels', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('photo.jpg'), sample('rotated-exif.jpg'), sample('tiny.png')]);
  await page.getByLabel('Aspect ratio').selectOption('exact');
  await page.getByLabel('Width (px)').fill('300');
  await page.getByLabel('Height (px)').fill('200');
  await crop(page);
  for (const n of [0, 1, 2]) await expect(page.locator('li.file').nth(n)).toContainText('300×200');
  const out = await probe(page, await downloadNth(page, 1));
  expect([out.width, out.height]).toEqual([300, 200]);
  await page.getByLabel('Width (px)').fill('0');
  await expect(page.getByRole('alert').filter({ hasText: 'between 1 and 16384' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Crop \d/ })).toBeDisabled();
});

test('adjust each image keeps separate crops; "use this crop for all" shares one', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('quad.png'), sample('photo.png')]);
  await page.getByRole('radio', { name: 'PNG' }).check({ force: true });
  await page.getByRole('radio', { name: 'Adjust each image' }).check({ force: true });
  await dragBox(page, -0.6);
  await expect(readout(page)).toContainText('at (0, 0)');
  await page.locator('li.file').nth(1).getByRole('button', { name: 'Edit crop' }).click();
  await expect(readout(page)).toContainText('Source 1200×800 · crop 800×800 at (200, 0)');
  await page.locator('li.file').nth(0).getByRole('button', { name: 'Edit crop' }).click();
  await expect(readout(page)).toContainText('at (0, 0)');
  await crop(page);
  const first = await probe(page, await downloadNth(page, 0), [[0.25, 0.25]]);
  expect(first.pixels[0]).toEqual(RED);

  await page.getByRole('button', { name: 'Use this crop for all' }).click();
  await page.locator('li.file').nth(1).getByRole('button', { name: 'Edit crop' }).click();
  await expect(readout(page)).toContainText(/crop 800×800 at \((0|\d{1,2}), 0\)/);
});

test('free mode: edge handle changes only one side; output has the free shape', async ({ page }) => {
  await page.setInputFiles('input[type=file]', sample('photo.png'));
  await page.getByLabel('Aspect ratio').selectOption('free');
  await expect(readout(page)).toContainText('crop 960×640 at (120, 80)');
  await dragBox(page, -0.1, 0, 'e');
  await expect(readout(page)).toContainText(/crop (8\d\d)×640 at \(120, 80\)/);
  await crop(page);
  await expect(page.locator('li.file')).toContainText(/8\d\d×640/);
});

test('mixed batch: corrupt/empty fail alone, duplicate names, huge image, cancel', async ({ page }) => {
  await page.setInputFiles('input[type=file]', [sample('photo.jpg'), sample('dup/photo.jpg'), sample('corrupt.jpg'), sample('empty.png'), sample('huge.jpg')]);
  await crop(page);
  await expect(page.getByText('5 of 5 finished, 2 failed.')).toBeVisible();
  await expect(page.locator('li.file').nth(4)).toContainText('8000×8000');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all as ZIP/ }).click()]);
  expect(Object.keys(unzip(await bytesOf(dl))).sort()).toEqual(['huge-cropped.jpg', 'photo-cropped-2.jpg', 'photo-cropped.jpg']);

  await page.getByRole('button', { name: /^Crop \d/ }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: /^Crop \d/ })).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('li.file[data-status=cancelled]').first()).toBeVisible();
});
