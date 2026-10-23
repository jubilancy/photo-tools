import { describe, expect, it } from 'vitest';
import {
  cdDue, cdFinish, cdPause, cdRemaining, cdReset, cdStart, formatDuration, formatRemaining, lapRows, newCountdown, newStopwatch,
  parseSaved, settleOnLoad, swElapsed, swLap, swPause, swStart, toMs,
} from './clock';

describe('stopwatch', () => {
  it('derives elapsed from timestamps, however rarely it is polled', () => {
    const s = swStart(newStopwatch(), 1_000);
    expect(swElapsed(s, 1_000)).toBe(0);
    expect(swElapsed(s, 61_234)).toBe(60_234); // one poll after a minute in a throttled tab
  });
  it('accumulates across pauses', () => {
    let s = swStart(newStopwatch(), 0);
    s = swPause(s, 5_000);
    expect(swElapsed(s, 999_999)).toBe(5_000);
    s = swStart(s, 10_000);
    expect(swElapsed(s, 12_500)).toBe(7_500);
  });
  it('ignores start twice and pause while stopped', () => {
    const a = swStart(newStopwatch(), 0);
    expect(swStart(a, 50)).toBe(a);
    const idle = newStopwatch();
    expect(swPause(idle, 10)).toBe(idle);
  });
  it('records laps as cumulative totals with per-lap splits', () => {
    let s = swStart(newStopwatch(), 0);
    s = swLap(s, 1_000);
    s = swLap(s, 3_500);
    expect(lapRows(s)).toEqual([
      { number: 1, split: 1_000, total: 1_000 },
      { number: 2, split: 2_500, total: 3_500 },
    ]);
  });
  it('only laps while running', () => {
    const idle = newStopwatch();
    expect(swLap(idle, 100)).toBe(idle);
  });
});

describe('countdown', () => {
  const base = newCountdown('a', 'Tea', 60_000);
  it('counts down from the end timestamp', () => {
    const c = cdStart(base, 1_000);
    expect(cdRemaining(c, 1_000)).toBe(60_000);
    expect(cdRemaining(c, 31_000)).toBe(30_000);
    expect(cdRemaining(c, 500_000)).toBe(0);
  });
  it('pauses and resumes with the time left', () => {
    let c = cdStart(base, 0);
    c = cdPause(c, 20_000);
    expect(c.status).toBe('paused');
    expect(cdRemaining(c, 900_000)).toBe(40_000);
    c = cdStart(c, 100_000);
    expect(c.endsAt).toBe(140_000);
  });
  it('is due once now reaches endsAt', () => {
    const c = cdStart(base, 0);
    expect(cdDue(c, 59_999)).toBe(false);
    expect(cdDue(c, 60_000)).toBe(true);
    expect(cdDue(cdFinish(c), 70_000)).toBe(false);
  });
  it('restarts a finished timer from the full duration', () => {
    const c = cdStart(cdFinish(cdStart(base, 0)), 5_000);
    expect(c.endsAt).toBe(65_000);
  });
  it('resets to idle with the full duration', () => {
    const c = cdReset(cdPause(cdStart(base, 0), 10_000));
    expect(c).toMatchObject({ status: 'idle', remaining: 60_000, endsAt: null });
  });
  it('settles timers that expired while closed', () => {
    const c = cdStart(base, 0);
    expect(settleOnLoad(c, 120_000).status).toBe('finished');
    expect(settleOnLoad(c, 10_000).status).toBe('running');
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_723_450, true)).toBe('1:02:03.45');
    expect(formatDuration(-5)).toBe('00:00');
  });
  it('rounds countdown display up', () => {
    expect(formatRemaining(1)).toBe('00:01');
    expect(formatRemaining(1_000)).toBe('00:01');
    expect(formatRemaining(1_001)).toBe('00:02');
    expect(formatRemaining(0)).toBe('00:00');
  });
  it('converts h/m/s to ms and ignores junk', () => {
    expect(toMs(1, 2, 3)).toBe(3_723_000);
    expect(toMs(NaN, -4, 2.9)).toBe(2_000);
  });
});

describe('parseSaved', () => {
  it('round-trips valid data', () => {
    const data = { stopwatch: { startedAt: null, accumulated: 5, laps: [1, 2] }, timers: [newCountdown('x', 'T', 1000)], sound: false };
    expect(parseSaved(JSON.stringify(data))).toEqual(data);
  });
  it('rejects garbage', () => {
    expect(parseSaved(null)).toBeNull();
    expect(parseSaved('{')).toBeNull();
    expect(parseSaved('{"stopwatch":1}')).toBeNull();
  });
  it('drops malformed timers but keeps the rest', () => {
    const raw = JSON.stringify({ stopwatch: { startedAt: null, accumulated: 0, laps: [] }, timers: [{ id: 1 }, newCountdown('ok', 'Ok', 1)] });
    expect(parseSaved(raw)!.timers.map((t) => t.id)).toEqual(['ok']);
  });
});
