/**
 * Time model. Every value is derived from wall-clock timestamps (`Date.now()` epoch ms),
 * never from counting ticks, so throttled or suspended background tabs stay correct.
 */

export interface Stopwatch {
  /** Epoch ms when the current run began; null unless running. */
  startedAt: number | null;
  /** Elapsed ms from earlier runs. */
  accumulated: number;
  /** Cumulative elapsed ms at each lap press. */
  laps: number[];
}

export const newStopwatch = (): Stopwatch => ({ startedAt: null, accumulated: 0, laps: [] });

export const swElapsed = (s: Stopwatch, now: number): number => s.accumulated + (s.startedAt === null ? 0 : Math.max(0, now - s.startedAt));
export const swRunning = (s: Stopwatch): boolean => s.startedAt !== null;

export function swStart(s: Stopwatch, now: number): Stopwatch {
  return swRunning(s) ? s : { ...s, startedAt: now };
}

export function swPause(s: Stopwatch, now: number): Stopwatch {
  return swRunning(s) ? { ...s, accumulated: swElapsed(s, now), startedAt: null } : s;
}

export function swLap(s: Stopwatch, now: number): Stopwatch {
  return swRunning(s) ? { ...s, laps: [...s.laps, swElapsed(s, now)] } : s;
}

export const swReset = (): Stopwatch => newStopwatch();

export interface LapRow {
  number: number;
  split: number;
  total: number;
}

export function lapRows(s: Stopwatch): LapRow[] {
  return s.laps.map((total, i) => ({ number: i + 1, total, split: total - (s.laps[i - 1] ?? 0) }));
}

export type CountdownStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface Countdown {
  id: string;
  label: string;
  /** Full length in ms. */
  duration: number;
  status: CountdownStatus;
  /** Epoch ms when it reaches zero; set while running. */
  endsAt: number | null;
  /** Ms left while idle or paused. */
  remaining: number;
}

export function newCountdown(id: string, label: string, duration: number): Countdown {
  return { id, label, duration, status: 'idle', endsAt: null, remaining: duration };
}

export function cdRemaining(c: Countdown, now: number): number {
  if (c.status === 'running' && c.endsAt !== null) return Math.max(0, c.endsAt - now);
  return c.status === 'finished' ? 0 : c.remaining;
}

export function cdStart(c: Countdown, now: number): Countdown {
  if (c.status === 'running') return c;
  const left = c.status === 'finished' || c.remaining <= 0 ? c.duration : c.remaining;
  return { ...c, status: 'running', endsAt: now + left, remaining: left };
}

export function cdPause(c: Countdown, now: number): Countdown {
  return c.status === 'running' ? { ...c, status: 'paused', endsAt: null, remaining: cdRemaining(c, now) } : c;
}

export function cdReset(c: Countdown): Countdown {
  return { ...c, status: 'idle', endsAt: null, remaining: c.duration };
}

/** True when a running countdown has reached zero. */
export function cdDue(c: Countdown, now: number): boolean {
  return c.status === 'running' && c.endsAt !== null && now >= c.endsAt;
}

export function cdFinish(c: Countdown): Countdown {
  return { ...c, status: 'finished', endsAt: null, remaining: 0 };
}

/** Treat timers that expired while the page was closed as finished, without alerting. */
export function settleOnLoad(c: Countdown, now: number): Countdown {
  return cdDue(c, now) ? cdFinish(c) : c;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `1:02:03` or `02:03`; with `centis` appends `.45`. */
export function formatDuration(ms: number, centis = false): string {
  const total = Math.max(0, Math.floor(ms));
  const cs = Math.floor((total % 1000) / 10);
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return centis ? `${base}.${pad(cs)}` : base;
}

/** Countdowns show whole seconds rounded up, so "00:01" holds until the last moment. */
export function formatRemaining(ms: number): string {
  return formatDuration(Math.ceil(Math.max(0, ms) / 1000) * 1000);
}

export function toMs(hours: number, minutes: number, seconds: number): number {
  const clean = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  return ((clean(hours) * 60 + clean(minutes)) * 60 + clean(seconds)) * 1000;
}

export interface Saved {
  stopwatch: Stopwatch;
  timers: Countdown[];
  sound: boolean;
}

/** Validates data read from storage; anything unexpected yields null so defaults are used. */
export function parseSaved(raw: string | null): Saved | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Saved>;
    const sw = v.stopwatch;
    if (!sw || typeof sw.accumulated !== 'number' || !Array.isArray(sw.laps) || !(sw.startedAt === null || typeof sw.startedAt === 'number')) return null;
    if (!Array.isArray(v.timers)) return null;
    const timers = v.timers.filter(
      (t): t is Countdown =>
        !!t && typeof t.id === 'string' && typeof t.label === 'string' && typeof t.duration === 'number' && typeof t.remaining === 'number' &&
        ['idle', 'running', 'paused', 'finished'].includes(t.status) && (t.endsAt === null || typeof t.endsAt === 'number'),
    );
    return { stopwatch: { startedAt: sw.startedAt, accumulated: sw.accumulated, laps: sw.laps.filter((n) => typeof n === 'number') }, timers, sound: v.sound !== false };
  } catch {
    return null;
  }
}
