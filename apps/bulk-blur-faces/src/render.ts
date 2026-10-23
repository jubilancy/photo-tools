import { createCanvas, get2d, type AnyCanvas, type Ctx2D } from '@tools/image-utils';
import { blurRadius, boxBlur, pixelBlock, regionToPixels, type Region } from './regions';

export type Shape = 'ellipse' | 'rect';
export type Style = 'blur' | 'pixelate';

export interface HideOptions {
  shape: Shape;
  style: Style;
  /** 1–100 */
  strength: number;
}

type Source = ImageBitmap | AnyCanvas;

function obscure(source: Source, x: number, y: number, w: number, h: number, o: HideOptions): AnyCanvas {
  const work = createCanvas(w, h);
  const wctx = get2d(work, { willReadFrequently: true });
  if (o.style === 'pixelate') {
    const block = pixelBlock(o.strength, Math.min(w, h));
    const small = createCanvas(Math.ceil(w / block), Math.ceil(h / block));
    const sctx = get2d(small);
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(source, x, y, w, h, 0, 0, small.width, small.height);
    wctx.imageSmoothingEnabled = false;
    wctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, w, h);
    return work;
  }
  wctx.drawImage(source, x, y, w, h, 0, 0, w, h);
  const pixels = wctx.getImageData(0, 0, w, h);
  boxBlur(pixels.data, w, h, blurRadius(o.strength, Math.min(w, h)));
  wctx.putImageData(pixels, 0, 0);
  return work;
}

/** Paints the obscured regions onto `target`, which must already contain `source` drawn at W×H. */
export function hideRegions(target: Ctx2D, source: Source, W: number, H: number, regions: readonly Region[], o: HideOptions): void {
  for (const region of regions) {
    const r = regionToPixels(region, W, H);
    const patch = obscure(source, r.x, r.y, r.w, r.h, o);
    target.save();
    target.beginPath();
    if (o.shape === 'ellipse') target.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    else target.rect(r.x, r.y, r.w, r.h);
    target.clip();
    target.drawImage(patch, r.x, r.y);
    target.restore();
  }
}
