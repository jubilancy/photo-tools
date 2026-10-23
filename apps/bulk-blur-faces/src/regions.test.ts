import { describe, expect, it } from 'vitest';
import { blurRadius, boxBlur, moveRegion, padRegion, pixelBlock, regionFromDrag, regionToPixels, scaleRegion } from './regions';

describe('padRegion', () => {
  it('grows around the centre', () => {
    const r = padRegion({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 0.5);
    expect(r.w).toBeCloseTo(0.3);
    expect(r.x).toBeCloseTo(0.35);
  });
  it('stays inside the image', () => {
    const r = padRegion({ x: 0, y: 0.9, w: 0.2, h: 0.1 }, 1);
    expect(r.x).toBe(0);
    expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('regionToPixels', () => {
  it('covers the fractional box in whole pixels', () => {
    expect(regionToPixels({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 100, 50)).toEqual({ x: 10, y: 10, w: 30, h: 20 });
  });
  it('never leaves the image', () => {
    const p = regionToPixels({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 100, 100);
    expect(p.x + p.w).toBeLessThanOrEqual(100);
    expect(p.y + p.h).toBeLessThanOrEqual(100);
  });
});

describe('regionFromDrag', () => {
  it('orders corners and clamps', () => {
    expect(regionFromDrag({ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.3 })).toEqual({ x: 0.2, y: 0.3, w: 0.6 - 0.2, h: 0.7 - 0.3 });
    expect(regionFromDrag({ x: -1, y: 0.5 }, { x: 0.5, y: 2 })).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 });
  });
  it('ignores tiny drags', () => {
    expect(regionFromDrag({ x: 0.5, y: 0.5 }, { x: 0.502, y: 0.7 })).toBeNull();
  });
});

describe('move and scale', () => {
  it('keeps the region on the image', () => {
    expect(moveRegion({ x: 0.5, y: 0.5, w: 0.3, h: 0.3 }, 0.9, -0.9)).toEqual({ x: 0.7, y: 0, w: 0.3, h: 0.3 });
  });
  it('scales about the centre', () => {
    const r = scaleRegion({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 2);
    expect(r.w).toBeCloseTo(0.4);
    expect(r.x).toBeCloseTo(0.3);
  });
});

describe('strength mapping', () => {
  it('blur radius grows with strength and size', () => {
    expect(blurRadius(100, 200)).toBe(70);
    expect(blurRadius(50, 200)).toBe(35);
    expect(blurRadius(1, 10)).toBe(1);
  });
  it('pixel blocks get larger as strength rises', () => {
    expect(pixelBlock(1, 240)).toBe(10);
    expect(pixelBlock(100, 240)).toBe(60);
  });
});

describe('boxBlur', () => {
  const image = (w: number, h: number, f: (x: number, y: number) => number) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([f(x, y), f(x, y), f(x, y), 255], (y * w + x) * 4);
    return d;
  };
  it('leaves a flat image unchanged', () => {
    const d = image(8, 8, () => 100);
    boxBlur(d, 8, 8, 2);
    expect([...d].filter((_, i) => i % 4 === 0).every((v) => v === 100)).toBe(true);
  });
  it('spreads a bright pixel and conserves overall brightness', () => {
    const w = 15;
    const d = image(w, w, (x, y) => (x === 7 && y === 7 ? 255 : 0));
    const before = d.reduce((s, v, i) => (i % 4 === 0 ? s + v : s), 0);
    boxBlur(d, w, w, 2);
    const centre = d[(7 * w + 7) * 4]!;
    expect(centre).toBeLessThan(40);
    expect(centre).toBeGreaterThan(0);
    expect(d[(7 * w + 9) * 4]).toBeGreaterThan(0);
    const after = d.reduce((s, v, i) => (i % 4 === 0 ? s + v : s), 0);
    expect(Math.abs(after - before)).toBeLessThan(before * 0.1);
  });
  it('keeps alpha opaque', () => {
    const d = image(6, 6, (x) => x * 40);
    boxBlur(d, 6, 6, 1);
    expect([...d].filter((_, i) => i % 4 === 3).every((v) => v === 255)).toBe(true);
  });
  it('does nothing for radius 0', () => {
    const d = image(4, 4, (x) => x * 50);
    const copy = new Uint8ClampedArray(d);
    boxBlur(d, 4, 4, 0);
    expect(d).toEqual(copy);
  });
});
