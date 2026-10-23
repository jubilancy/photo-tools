/** A region to hide, as fractions of the (EXIF-oriented) image so it is independent of resolution. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Grows a region by `pad` (0.25 = 25% of its size on each axis, split over both sides) and keeps it inside the image. */
export function padRegion(r: Region, pad: number): Region {
  const w = Math.min(1, r.w * (1 + pad));
  const h = Math.min(1, r.h * (1 + pad));
  return { x: clamp(r.x + r.w / 2 - w / 2, 0, 1 - w), y: clamp(r.y + r.h / 2 - h / 2, 0, 1 - h), w, h };
}

export function regionToPixels(r: Region, W: number, H: number): PixelRect {
  // The epsilon keeps float noise (30.000000000000004) from adding a pixel.
  const lo = (v: number) => Math.floor(v + 1e-9);
  const hi = (v: number) => Math.ceil(v - 1e-9);
  const x = clamp(lo(r.x * W), 0, W - 1);
  const y = clamp(lo(r.y * H), 0, H - 1);
  return { x, y, w: clamp(hi((r.x + r.w) * W) - x, 1, W - x), h: clamp(hi((r.y + r.h) * H) - y, 1, H - y) };
}

/** Normalises a drag between two image-fraction points into a region, rejecting accidental tiny drags. */
export function regionFromDrag(a: { x: number; y: number }, b: { x: number; y: number }, min = 0.01): Region | null {
  const x = clamp(Math.min(a.x, b.x), 0, 1);
  const y = clamp(Math.min(a.y, b.y), 0, 1);
  const w = clamp(Math.max(a.x, b.x), 0, 1) - x;
  const h = clamp(Math.max(a.y, b.y), 0, 1) - y;
  return w >= min && h >= min ? { x, y, w, h } : null;
}

export function moveRegion(r: Region, dx: number, dy: number): Region {
  return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) };
}

/** Scales a region about its centre by `factor`, staying inside the image and above a minimum size. */
export function scaleRegion(r: Region, factor: number, min = 0.01): Region {
  const w = clamp(r.w * factor, min, 1);
  const h = clamp(r.h * factor, min, 1);
  return { x: clamp(r.x + r.w / 2 - w / 2, 0, 1 - w), y: clamp(r.y + r.h / 2 - h / 2, 0, 1 - h), w, h };
}

/** Radius of the box-blur passes for a strength of 1–100 on a region whose shorter side is `side` px. */
export function blurRadius(strength: number, side: number): number {
  return Math.max(1, Math.round((clamp(strength, 1, 100) / 100) * 0.35 * side));
}

/** Pixelation block size in px for a strength of 1–100: from ~24 blocks across the face down to ~4. */
export function pixelBlock(strength: number, side: number): number {
  const blocks = 24 - ((clamp(strength, 1, 100) - 1) / 99) * 20;
  return Math.max(2, Math.round(side / blocks));
}

function boxPass(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number, horizontal: boolean): void {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? 4 : w * 4;
  const lineStride = horizontal ? w * 4 : 4;
  const window = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStride;
    for (let c = 0; c < 4; c++) {
      // Sliding-window sum with edge pixels repeated.
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += src[base + clamp(i, 0, len - 1) * stride + c]!;
      for (let i = 0; i < len; i++) {
        dst[base + i * stride + c] = sum / window;
        sum += src[base + clamp(i + r + 1, 0, len - 1) * stride + c]! - src[base + clamp(i - r, 0, len - 1) * stride + c]!;
      }
    }
  }
}

/** In-place approximate Gaussian blur: three box-blur passes in each direction. */
export function boxBlur(data: Uint8ClampedArray, w: number, h: number, radius: number): void {
  if (radius < 1 || w < 1 || h < 1) return;
  const tmp = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < 3; pass++) {
    boxPass(data, tmp, w, h, radius, true);
    boxPass(tmp, data, w, h, radius, false);
  }
}
