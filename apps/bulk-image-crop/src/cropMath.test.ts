import { describe, expect, it } from 'vitest';
import {
  aspectRect, cropRect, defaultAspectBox, defaultFreeBox, moveAspect, moveFree, outputSizeFor, parseRatio, resizeAspect, resizeFree, toPixels,
} from './cropMath';

describe('aspectRect', () => {
  it('fills the largest box of that ratio, centred', () => {
    expect(aspectRect(1200, 800, 1, defaultAspectBox())).toEqual({ x: 200, y: 0, w: 800, h: 800 });
    expect(aspectRect(800, 1200, 1, defaultAspectBox())).toEqual({ x: 0, y: 200, w: 800, h: 800 });
    expect(aspectRect(1600, 900, 16 / 9, defaultAspectBox())).toEqual({ x: 0, y: 0, w: 1600, h: 900 });
  });
  it('applies the same box to images of different shapes', () => {
    const box = { cx: 0.5, cy: 0.5, zoom: 0.5 };
    const a = aspectRect(1200, 800, 1, box);
    const b = aspectRect(800, 1200, 1, box);
    expect([a.w, a.h]).toEqual([400, 400]);
    expect([b.w, b.h]).toEqual([400, 400]);
  });
  it('keeps the box inside the image', () => {
    const r = aspectRect(1000, 1000, 1, { cx: 0, cy: 1, zoom: 0.5 });
    expect(r).toEqual({ x: 0, y: 500, w: 500, h: 500 });
  });
});

describe('freeRect and toPixels', () => {
  it('maps fractions to pixels', () => {
    expect(cropRect(1000, 500, { kind: 'free' }, { aspect: defaultAspectBox(), free: { x: 0.25, y: 0.2, w: 0.5, h: 0.6 } })).toEqual({ x: 250, y: 100, w: 500, h: 300 });
  });
  it('rounds to whole pixels inside the bounds', () => {
    expect(toPixels({ x: 99.6, y: 0.4, w: 0.2, h: 50.5 }, 100, 100)).toEqual({ x: 99, y: 0, w: 1, h: 51 });
  });
});

describe('moving', () => {
  it('moves an aspect box and stops at the edges', () => {
    const b = moveAspect(1000, 1000, 1, { cx: 0.5, cy: 0.5, zoom: 0.5 }, 0.2, 0);
    expect(b.cx).toBeCloseTo(0.7);
    expect(moveAspect(1000, 1000, 1, b, 0.9, 0).cx).toBeCloseTo(0.75);
  });
  it('moves a free box and stops at the edges', () => {
    expect(moveFree({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 0.9, -0.5)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
  });
});

describe('resizing', () => {
  it('resizes an aspect box from a corner drag', () => {
    const b = resizeAspect(1000, 1000, 1, { x: 0, y: 0 }, { x: 400, y: 300 });
    const r = aspectRect(1000, 1000, 1, b);
    expect(r).toEqual({ x: 0, y: 0, w: 400, h: 400 });
  });
  it('drags toward the top-left too and respects the image edge', () => {
    const r = aspectRect(1000, 1000, 1, resizeAspect(1000, 1000, 1, { x: 600, y: 600 }, { x: 100, y: 300 }));
    expect(r.x + r.w).toBeCloseTo(600);
    expect(r.w).toBeCloseTo(500);
  });
  it('cannot shrink below the minimum nor grow past the image', () => {
    const tiny = aspectRect(1000, 1000, 1, resizeAspect(1000, 1000, 1, { x: 0, y: 0 }, { x: 1, y: 1 }));
    expect(tiny.w).toBeGreaterThanOrEqual(50);
    const huge = aspectRect(1000, 1000, 1, resizeAspect(1000, 1000, 1, { x: 0, y: 0 }, { x: 5000, y: 5000 }));
    expect(huge.w).toBe(1000);
  });
  it('moves single edges of a free box', () => {
    const box = defaultFreeBox();
    expect(resizeFree(box, 'e', 0.1, 0)).toEqual({ x: 0.1, y: 0.1, w: 0.9, h: 0.8 });
    const n = resizeFree(box, 'n', 0, 0.2);
    expect(n.y).toBeCloseTo(0.3);
    expect(n.h).toBeCloseTo(0.6);
  });
  it('clamps free corners to the image and a minimum size', () => {
    const r = resizeFree({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 'se', 5, 5);
    expect(r.x + r.w).toBeCloseTo(1);
    expect(r.y + r.h).toBeCloseTo(1);
    const s = resizeFree({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 'nw', 5, 5);
    expect(s.w).toBeCloseTo(0.02);
  });
});

describe('modes', () => {
  it('reports exact output size or the crop size', () => {
    const crop = { x: 0, y: 0, w: 640, h: 480 };
    expect(outputSizeFor(crop, { kind: 'exact', width: 300, height: 200 })).toEqual({ width: 300, height: 200 });
    expect(outputSizeFor(crop, { kind: 'ratio', ratio: 4 / 3 })).toEqual({ width: 640, height: 480 });
  });
  it('crops to the exact ratio', () => {
    const r = cropRect(1000, 700, { kind: 'exact', width: 300, height: 200 }, { aspect: defaultAspectBox(), free: defaultFreeBox() });
    expect(r.w / r.h).toBeCloseTo(1.5, 2);
  });
});

describe('parseRatio', () => {
  it('parses common forms', () => {
    expect(parseRatio('16:9')).toBeCloseTo(16 / 9);
    expect(parseRatio('3/2')).toBeCloseTo(1.5);
    expect(parseRatio('1.25')).toBe(1.25);
    expect(parseRatio('0:5')).toBeNull();
    expect(parseRatio('abc')).toBeNull();
  });
});
