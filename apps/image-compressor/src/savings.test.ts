import { describe, expect, it } from 'vitest';
import { savedPercent, totals } from './savings';

describe('savings', () => {
  it('computes percentage saved', () => {
    expect(savedPercent(1000, 250)).toBe(75);
    expect(savedPercent(1000, 1000)).toBe(0);
    expect(savedPercent(1000, 1500)).toBe(-50);
    expect(savedPercent(0, 0)).toBe(0);
  });
  it('sums files', () => {
    expect(totals([{ originalSize: 600, newSize: 300 }, { originalSize: 400, newSize: 100 }])).toEqual({ original: 1000, now: 400, percent: 60 });
    expect(totals([])).toEqual({ original: 0, now: 0, percent: 0 });
  });
});
