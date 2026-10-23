import { describe, expect, it } from 'vitest';
import { computeResize, validateSpec, type ResizeSpec } from './resize';

const spec = (change: Partial<ResizeSpec> = {}): ResizeSpec => ({
  mode: 'pixels', width: undefined, height: undefined, percent: 50, longest: 1000, keepAspect: true, fit: 'inside', noEnlarge: false, ...change,
});
const size = (p: { width: number; height: number }) => [p.width, p.height];

describe('percent', () => {
  it('scales both sides', () => {
    expect(size(computeResize(1200, 800, spec({ mode: 'percent', percent: 50 })))).toEqual([600, 400]);
    expect(size(computeResize(1200, 800, spec({ mode: 'percent', percent: 150 })))).toEqual([1800, 1200]);
  });
  it('never produces a zero side', () => {
    expect(size(computeResize(3, 3, spec({ mode: 'percent', percent: 1 })))).toEqual([1, 1]);
  });
});

describe('longest side', () => {
  it('scales landscape and portrait by their long edge', () => {
    expect(size(computeResize(4000, 3000, spec({ mode: 'longest', longest: 1000 })))).toEqual([1000, 750]);
    expect(size(computeResize(3000, 4000, spec({ mode: 'longest', longest: 1000 })))).toEqual([750, 1000]);
  });
  it('can refuse to enlarge', () => {
    expect(size(computeResize(400, 300, spec({ mode: 'longest', longest: 1000, noEnlarge: true })))).toEqual([400, 300]);
    expect(size(computeResize(400, 300, spec({ mode: 'longest', longest: 1000 })))).toEqual([1000, 750]);
  });
});

describe('pixels with aspect ratio kept', () => {
  it('derives the missing side', () => {
    expect(size(computeResize(1200, 800, spec({ width: 600 })))).toEqual([600, 400]);
    expect(size(computeResize(1200, 800, spec({ height: 200 })))).toEqual([300, 200]);
  });
  it('fits inside a box', () => {
    expect(size(computeResize(1200, 800, spec({ width: 300, height: 300 })))).toEqual([300, 200]);
    expect(size(computeResize(800, 1200, spec({ width: 300, height: 300 })))).toEqual([200, 300]);
  });
  it('respects noEnlarge when fitting', () => {
    expect(size(computeResize(100, 50, spec({ width: 300, height: 300, noEnlarge: true })))).toEqual([100, 50]);
  });
  it('cover crops the source to the box ratio, centred', () => {
    const p = computeResize(1200, 800, spec({ width: 400, height: 400, fit: 'cover' }));
    expect(size(p)).toEqual([400, 400]);
    expect(p.src).toEqual({ x: 200, y: 0, w: 800, h: 800 });
    expect(p.dest).toEqual({ x: 0, y: 0, w: 400, h: 400 });
  });
  it('pad keeps the box size and centres the image', () => {
    const p = computeResize(1200, 800, spec({ width: 300, height: 300, fit: 'pad' }));
    expect(size(p)).toEqual([300, 300]);
    expect(p.dest).toEqual({ x: 0, y: 50, w: 300, h: 200 });
  });
});

describe('pixels without aspect ratio', () => {
  it('stretches to the exact size', () => {
    const p = computeResize(1200, 800, spec({ width: 100, height: 100, keepAspect: false }));
    expect(size(p)).toEqual([100, 100]);
    expect(p.src).toEqual({ x: 0, y: 0, w: 1200, h: 800 });
  });
});

describe('validateSpec', () => {
  it('asks for a size in pixel mode', () => {
    expect(validateSpec(spec())).toMatch(/width, a height/);
    expect(validateSpec(spec({ width: 100 }))).toBeNull();
    expect(validateSpec(spec({ width: 100, keepAspect: false }))).toMatch(/both/);
    expect(validateSpec(spec({ width: NaN, height: 50 }))).toBeNull();
    expect(validateSpec(spec({ width: 70000 }))).toMatch(/not supported/);
  });
  it('checks percent and longest', () => {
    expect(validateSpec(spec({ mode: 'percent', percent: 0 }))).not.toBeNull();
    expect(validateSpec(spec({ mode: 'percent', percent: 50 }))).toBeNull();
    expect(validateSpec(spec({ mode: 'longest', longest: NaN }))).not.toBeNull();
  });
});
