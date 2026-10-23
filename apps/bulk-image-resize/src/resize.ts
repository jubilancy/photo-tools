export type ResizeMode = 'pixels' | 'percent' | 'longest';
/** How a width×height box is filled when the aspect ratio is kept. */
export type Fit = 'inside' | 'cover' | 'pad';

export interface ResizeSpec {
  mode: ResizeMode;
  /** Either may be NaN/undefined to leave it free. */
  width?: number;
  height?: number;
  percent: number;
  longest: number;
  keepAspect: boolean;
  fit: Fit;
  /** Applies to "inside" and "longest side": smaller images are left at their size. */
  noEnlarge: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResizePlan {
  width: number;
  height: number;
  /** Region of the source to draw. */
  src: Rect;
  /** Where it lands on the output canvas. */
  dest: Rect;
}

const MAX_SIDE = 65535;
const given = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const px = (n: number) => Math.max(1, Math.round(n));

/** Human-readable problem with the options, or null when they are usable. */
export function validateSpec(spec: ResizeSpec): string | null {
  switch (spec.mode) {
    case 'pixels':
      if (!given(spec.width) && !given(spec.height)) return 'Enter a width, a height, or both.';
      if (!spec.keepAspect && (!given(spec.width) || !given(spec.height))) return 'Enter both width and height, or keep the aspect ratio.';
      if ((given(spec.width) && spec.width > MAX_SIDE) || (given(spec.height) && spec.height > MAX_SIDE)) return `Sizes above ${MAX_SIDE} px are not supported.`;
      return null;
    case 'percent':
      return given(spec.percent) && spec.percent <= 1000 ? null : 'Enter a percentage between 1 and 1000.';
    case 'longest':
      return given(spec.longest) && spec.longest <= MAX_SIDE ? null : 'Enter a longest-side size in pixels.';
  }
}

function plain(srcW: number, srcH: number, width: number, height: number): ResizePlan {
  return { width, height, src: { x: 0, y: 0, w: srcW, h: srcH }, dest: { x: 0, y: 0, w: width, h: height } };
}

export function computeResize(srcW: number, srcH: number, spec: ResizeSpec): ResizePlan {
  if (spec.mode === 'percent') {
    const s = spec.percent / 100;
    return plain(srcW, srcH, px(srcW * s), px(srcH * s));
  }
  if (spec.mode === 'longest') {
    let s = spec.longest / Math.max(srcW, srcH);
    if (spec.noEnlarge) s = Math.min(1, s);
    return plain(srcW, srcH, px(srcW * s), px(srcH * s));
  }

  const w = given(spec.width) ? spec.width : undefined;
  const h = given(spec.height) ? spec.height : undefined;

  if (!spec.keepAspect) return plain(srcW, srcH, px(w ?? srcW), px(h ?? srcH));

  if (w === undefined || h === undefined) {
    // One side given: the other follows the aspect ratio.
    let s = w !== undefined ? w / srcW : h! / srcH;
    if (spec.noEnlarge) s = Math.min(1, s);
    return plain(srcW, srcH, px(srcW * s), px(srcH * s));
  }

  if (spec.fit === 'cover') {
    const s = Math.max(w / srcW, h / srcH);
    const cw = w / s;
    const ch = h / s;
    return { width: px(w), height: px(h), src: { x: (srcW - cw) / 2, y: (srcH - ch) / 2, w: cw, h: ch }, dest: { x: 0, y: 0, w: px(w), h: px(h) } };
  }

  let s = Math.min(w / srcW, h / srcH);
  if (spec.fit === 'inside') {
    if (spec.noEnlarge) s = Math.min(1, s);
    return plain(srcW, srcH, px(srcW * s), px(srcH * s));
  }
  // pad: exact box, image centred
  const dw = px(srcW * s);
  const dh = px(srcH * s);
  return {
    width: px(w),
    height: px(h),
    src: { x: 0, y: 0, w: srcW, h: srcH },
    dest: { x: Math.round((px(w) - dw) / 2), y: Math.round((px(h) - dh) / 2), w: dw, h: dh },
  };
}
