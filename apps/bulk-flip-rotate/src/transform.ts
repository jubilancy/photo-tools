/** 2D affine matrix in canvas `setTransform(a, b, c, d, e, f)` order. */
export type Matrix = readonly [number, number, number, number, number, number];

export interface TransformOptions {
  flipH: boolean;
  flipV: boolean;
  /** Clockwise degrees. */
  angle: number;
  /** Grow the canvas so rotated corners are kept; otherwise keep the original size and crop. */
  expand: boolean;
}

/** Maps any angle to [0, 360). */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** cos/sin that are exact at multiples of 90° so right-angle turns never resample pixels. */
function trig(deg: number): { cos: number; sin: number } {
  const a = normalizeAngle(deg);
  if (a === 0) return { cos: 1, sin: 0 };
  if (a === 90) return { cos: 0, sin: 1 };
  if (a === 180) return { cos: -1, sin: 0 };
  if (a === 270) return { cos: 0, sin: -1 };
  const r = (a * Math.PI) / 180;
  return { cos: Math.cos(r), sin: Math.sin(r) };
}

function multiply(m: Matrix, n: Matrix): Matrix {
  // m * n: apply n first, then m.
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** Output canvas size for a w×h source. */
export function outputSize(w: number, h: number, o: TransformOptions): { width: number; height: number } {
  if (!o.expand) {
    const a = normalizeAngle(o.angle);
    return a === 90 || a === 270 ? { width: h, height: w } : { width: w, height: h };
  }
  const { cos, sin } = trig(o.angle);
  // Trim float noise (e.g. 3.0000000000000004) so exact turns don't gain a pixel.
  const clean = (v: number) => Math.ceil(Math.round(v * 1e6) / 1e6);
  return { width: clean(w * Math.abs(cos) + h * Math.abs(sin)), height: clean(w * Math.abs(sin) + h * Math.abs(cos)) };
}

/**
 * Matrix that draws the source at (0,0) into the output: flips first, then rotates clockwise about the centre.
 * With `expand` off at a non-right angle the output keeps the source size, so corners are cropped.
 */
export function transformMatrix(w: number, h: number, o: TransformOptions): { matrix: Matrix; width: number; height: number } {
  const { width, height } = outputSize(w, h, o);
  const { cos, sin } = trig(o.angle);
  const toCentre: Matrix = [1, 0, 0, 1, -w / 2, -h / 2];
  const flip: Matrix = [o.flipH ? -1 : 1, 0, 0, o.flipV ? -1 : 1, 0, 0];
  const rotate: Matrix = [cos, sin, -sin, cos, 0, 0];
  const toOutput: Matrix = [1, 0, 0, 1, width / 2, height / 2];
  return { matrix: multiply(toOutput, multiply(rotate, multiply(flip, toCentre))), width, height };
}
