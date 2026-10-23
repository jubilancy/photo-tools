import { describe, expect, it } from 'vitest';
import { normalizeAngle, outputSize, transformMatrix, type Matrix, type TransformOptions } from './transform';

const o = (change: Partial<TransformOptions> = {}): TransformOptions => ({ flipH: false, flipV: false, angle: 0, expand: true, ...change });
const apply = (m: Matrix, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

describe('normalizeAngle', () => {
  it('wraps into [0, 360)', () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(360)).toBe(0);
  });
});

describe('outputSize', () => {
  it('swaps sides for 90° and 270° exactly', () => {
    expect(outputSize(5, 3, o({ angle: 90 }))).toEqual({ width: 3, height: 5 });
    expect(outputSize(5, 3, o({ angle: 270 }))).toEqual({ width: 3, height: 5 });
    expect(outputSize(5, 3, o({ angle: -90 }))).toEqual({ width: 3, height: 5 });
  });
  it('keeps the size for 180°', () => {
    expect(outputSize(5, 3, o({ angle: 180 }))).toEqual({ width: 5, height: 3 });
  });
  it('expands to fit an arbitrary angle', () => {
    const s = outputSize(100, 100, o({ angle: 45 }));
    expect(s).toEqual({ width: 142, height: 142 });
  });
  it('keeps the original size when not expanding', () => {
    expect(outputSize(100, 50, o({ angle: 30, expand: false }))).toEqual({ width: 100, height: 50 });
    expect(outputSize(100, 50, o({ angle: 90, expand: false }))).toEqual({ width: 50, height: 100 });
  });
});

describe('transformMatrix', () => {
  it('is the identity when nothing is requested', () => {
    expect(transformMatrix(4, 2, o()).matrix).toEqual([1, 0, 0, 1, 0, 0]);
  });
  it('rotates 90° clockwise: top-left goes to top-right', () => {
    const { matrix, width, height } = transformMatrix(5, 3, o({ angle: 90 }));
    expect([width, height]).toEqual([3, 5]);
    expect(apply(matrix, 0, 0)).toEqual([3, 0]);
    expect(apply(matrix, 5, 3)).toEqual([0, 5]);
  });
  it('rotates 180°: corners swap', () => {
    const { matrix } = transformMatrix(5, 3, o({ angle: 180 }));
    expect(apply(matrix, 0, 0)).toEqual([5, 3]);
  });
  it('flips horizontally', () => {
    const { matrix } = transformMatrix(5, 3, o({ flipH: true }));
    expect(apply(matrix, 0, 0)).toEqual([5, 0]);
    expect(apply(matrix, 5, 3)).toEqual([0, 3]);
  });
  it('flips before rotating', () => {
    const { matrix } = transformMatrix(5, 3, o({ flipH: true, angle: 90 }));
    // flip: (0,0)→(5,0); rotate 90 cw about centre: (5,0)→(3,5)
    expect(apply(matrix, 0, 0)).toEqual([3, 5]);
  });
  it('uses exact integers for right angles', () => {
    for (const angle of [90, 180, 270]) {
      const { matrix } = transformMatrix(7, 5, o({ angle }));
      for (const v of matrix) expect(Number.isInteger(v)).toBe(true);
    }
  });
});
