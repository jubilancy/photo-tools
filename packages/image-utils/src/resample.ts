import { createCanvas, get2d, type AnyCanvas } from './canvas';

export type Drawable = ImageBitmap | AnyCanvas;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Draws `src` (or a region of it) into a new canvas of the given size.
 * Large reductions are done in successive halvings, which keeps detail much better than one big jump.
 */
export function resample(source: Drawable, width: number, height: number, region?: Rect, dest?: Rect): AnyCanvas {
  let cur: Drawable = source;
  let r: Rect = region ?? { x: 0, y: 0, w: source.width, h: source.height };
  const target = dest ?? { x: 0, y: 0, w: width, h: height };
  while (r.w > target.w * 2 || r.h > target.h * 2) {
    const nw = Math.max(Math.ceil(target.w), Math.ceil(r.w / 2));
    const nh = Math.max(Math.ceil(target.h), Math.ceil(r.h / 2));
    const step = createCanvas(nw, nh);
    const sctx = get2d(step);
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(cur, r.x, r.y, r.w, r.h, 0, 0, nw, nh);
    cur = step;
    r = { x: 0, y: 0, w: nw, h: nh };
  }
  const out = createCanvas(width, height);
  const ctx = get2d(out);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, r.x, r.y, r.w, r.h, target.x, target.y, target.w, target.h);
  return out;
}
