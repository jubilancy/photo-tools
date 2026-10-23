import { expect, test, type Page } from '@playwright/test';
import { expectNoUserDataRequests, trackRequests } from './helpers';

/** Records beeps and notifications so alerts can be asserted. */
const SPIES = () => {
  const w = window as unknown as Record<string, unknown>;
  w.__beeps = 0;
  w.__notes = [] as string[];
  const Original = window.AudioContext;
  window.AudioContext = class extends Original {
    createOscillator() {
      (w.__beeps as number)++;
      return super.createOscillator();
    }
  };
  class FakeNotification {
    static permission: NotificationPermission = 'default';
    static requestPermission() {
      FakeNotification.permission = 'granted';
      return Promise.resolve('granted' as NotificationPermission);
    }
    constructor(title: string) {
      (w.__notes as string[]).push(title);
    }
  }
  (window as unknown as { Notification: unknown }).Notification = FakeNotification;
};

const beeps = (page: Page) => page.evaluate(() => (window as unknown as { __beeps: number }).__beeps);
const notes = (page: Page) => page.evaluate(() => (window as unknown as { __notes: string[] }).__notes);

const ms = (text: string) => {
  const m = /^(?:(\d+):)?(\d+):(\d+)\.(\d+)$/.exec(text.trim())!;
  return ((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4]) * 10;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(SPIES);
  await page.goto('time-taker/');
  await expect(page.getByRole('timer', { name: 'Stopwatch' })).toBeVisible();
  await page.waitForTimeout(100); // let React attach the key handler
});

async function addTimer(page: Page, label: string, seconds: number, minutes = 0) {
  await page.getByRole('tab', { name: /^Timers/ }).click();
  await page.getByLabel('Name').fill(label);
  await page.getByLabel('Minutes').fill(String(minutes));
  await page.getByLabel('Seconds').fill(String(seconds));
  await page.getByRole('button', { name: 'Add timer' }).click();
}

test('stopwatch: keyboard, laps, reset, and persistence across reload', async ({ page }) => {
  const log = await trackRequests(page);
  const readout = page.getByRole('timer', { name: 'Stopwatch' });
  await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
  await page.keyboard.press('l');
  await page.waitForTimeout(600);
  await page.keyboard.press('Space'); // pause
  const paused = ms((await readout.textContent())!);
  expect(paused).toBeGreaterThan(1800);
  expect(paused).toBeLessThan(2600);
  await page.waitForTimeout(500);
  expect(ms((await readout.textContent())!)).toBe(paused);
  await expect(page.locator('.laps tbody tr')).toHaveCount(1);

  await page.reload();
  expect(ms((await readout.textContent())!)).toBe(paused);
  await expect(page.locator('.laps tbody tr')).toHaveCount(1);

  await page.keyboard.press('r');
  await expect(readout).toHaveText('00:00.00');
  await expect(page.locator('.laps')).toHaveCount(0);
  expectNoUserDataRequests(log);
});

test('stopwatch stays correct when the page is frozen like a throttled background tab', async ({ page }) => {
  await page.keyboard.press('Space');
  await page.evaluate(() => { const end = Date.now() + 3000; while (Date.now() < end); });
  await page.keyboard.press('Space');
  const t = ms((await page.getByRole('timer', { name: 'Stopwatch' }).textContent())!);
  expect(t).toBeGreaterThan(2900);
  expect(t).toBeLessThan(3600);
});

test('countdown finishes on time, beeps once, notifies, and a frozen page still alerts correctly', async ({ page }) => {
  await addTimer(page, 'Tea', 2);
  await page.getByRole('button', { name: 'Enable notifications' }).click();
  await expect(page.getByText('Notifications are on.')).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('li.timer')).toHaveAttribute('data-status', 'finished', { timeout: 6000 });
  await expect(page).toHaveTitle(/⏰ Tea done/);
  expect(await beeps(page)).toBe(3); // one alert = three oscillator beeps
  expect(await notes(page)).toEqual(['Tea finished']);
  await page.waitForTimeout(600);
  expect(await beeps(page)).toBe(3); // no repeat

  await page.getByRole('button', { name: 'Restart' }).click();
  await page.evaluate(() => { const end = Date.now() + 2600; while (Date.now() < end); });
  await expect(page.locator('li.timer')).toHaveAttribute('data-status', 'finished');
  expect(await beeps(page)).toBe(6);
});

test('timers persist across reloads and one that ended while closed is finished without an alert', async ({ page }) => {
  await addTimer(page, 'Long', 0, 2);
  await addTimer(page, 'Short', 2);
  await page.locator('li.timer', { hasText: 'Long' }).getByRole('button', { name: 'Start' }).click();
  await page.locator('li.timer', { hasText: 'Short' }).getByRole('button', { name: 'Start' }).click();
  await page.goto('about:blank');
  await page.waitForTimeout(2600);
  await page.goto('time-taker/');
  await page.getByRole('tab', { name: /^Timers/ }).click();
  await expect(page.locator('li.timer', { hasText: 'Short' })).toHaveAttribute('data-status', 'finished');
  const long = page.locator('li.timer', { hasText: 'Long' });
  await expect(long).toHaveAttribute('data-status', 'running');
  const left = (await long.getByRole('timer').textContent())!;
  expect(left).toMatch(/^0[12]:\d\d$/);
  expect(await beeps(page)).toBe(0);
  expect(await notes(page)).toEqual([]);

  await long.getByRole('button', { name: 'Pause' }).click();
  await expect(long).toHaveAttribute('data-status', 'paused');
  await long.getByRole('button', { name: 'Reset' }).click();
  await expect(long.getByRole('timer')).toHaveText('02:00');
  await page.getByRole('button', { name: 'Delete Short' }).click();
  await expect(page.locator('li.timer')).toHaveCount(1);
});

test('quick add, validation and the N shortcut', async ({ page }) => {
  await page.getByRole('tab', { name: /^Timers/ }).click();
  await page.getByLabel('Minutes').fill('0');
  await expect(page.getByRole('button', { name: 'Add timer' })).toBeDisabled();
  await page.getByRole('button', { name: '5 min', exact: true }).click();
  await expect(page.locator('li.timer')).toContainText('05:00');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('n');
  await expect(page.getByLabel('Name')).toBeFocused();
});

test('corrupt saved data falls back to a clean state', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('time-taker:v1', '{"stopwatch": 7}'));
  await page.reload();
  await expect(page.getByRole('timer', { name: 'Stopwatch' })).toHaveText('00:00.00');
});
