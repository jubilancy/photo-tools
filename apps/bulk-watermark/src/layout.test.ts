import { describe, expect, it } from 'vitest';
import { placements, rotatedSize, type LayoutOptions } from './layout';

const base: LayoutOptions = { anchor: { col: 0, row: 0 }, marginPct: 5, rotation: 0, tile: false, tileGapPct: 50 };

describe('rotatedSize', () => {
  it('swaps sides at 90°', () => {
    const s = rotatedSize(200, 50, 90);
    expect(s.w).toBeCloseTo(50);
    expect(s.h).toBeCloseTo(200);
  });
  it('grows the box at 45°', () => {
    const s = rotatedSize(100, 100, 45);
    expect(s.w).toBeCloseTo(141.42, 1);
  });
});

describe('placements (single)', () => {
  it('top-left respects margin of the shorter side', () => {
    const [p] = placements(1000, 500, 200, 100, base);
    expect(p).toEqual({ cx: 25 + 100, cy: 25 + 50 });
  });
  it('bottom-right mirrors it', () => {
    const [p] = placements(1000, 500, 200, 100, { ...base, anchor: { col: 2, row: 2 } });
    expect(p).toEqual({ cx: 1000 - 25 - 100, cy: 500 - 25 - 50 });
  });
  it('centre ignores margin', () => {
    const [p] = placements(1000, 500, 200, 100, { ...base, anchor: { col: 1, row: 1 } });
    expect(p).toEqual({ cx: 500, cy: 250 });
  });
  it('uses the rotated bounding box for edge alignment', () => {
    const [p] = placements(1000, 1000, 200, 100, { ...base, rotation: 90, marginPct: 0 });
    expect(p!.cx).toBeCloseTo(50);
    expect(p!.cy).toBeCloseTo(100);
  });
});

describe('placements (tiled)', () => {
  const tiled: LayoutOptions = { ...base, tile: true };
  it('includes the centre and covers every corner', () => {
    const W = 800;
    const H = 600;
    const ps = placements(W, H, 100, 50, tiled);
    expect(ps).toContainEqual({ cx: 400, cy: 300 });
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]] as const) {
      expect(ps.some((p) => Math.abs(p.cx - x) <= 100 && Math.abs(p.cy - y) <= 50)).toBe(true);
    }
  });
  it('spaces tiles by size plus gap', () => {
    const ps = placements(400, 400, 100, 40, { ...tiled, tileGapPct: 100 });
    const xs = [...new Set(ps.map((p) => p.cx))].sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeCloseTo(200);
  });
});
