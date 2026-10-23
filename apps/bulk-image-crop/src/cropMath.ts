export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Crop box for a fixed aspect ratio. Independent of image size, so one box can apply to images of any shape. */
export interface AspectBox {
  /** Box centre as a fraction of the image width/height. */
  cx: number;
  cy: number;
  /** Box size as a fraction of the largest box of that ratio that fits the image (0–1]. */
  zoom: number;
}

/** Free-form crop box, as fractions of the image. */
export type FreeBox = Rect;

export const MIN_ZOOM = 0.05;
export const MIN_FREE = 0.02;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const defaultAspectBox = (): AspectBox => ({ cx: 0.5, cy: 0.5, zoom: 1 });
export const defaultFreeBox = (): FreeBox => ({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });

/** Pixel rect (fractional) of an aspect box on a W×H image. */
export function aspectRect(W: number, H: number, aspect: number, box: AspectBox): Rect {
  const maxW = Math.min(W, H * aspect);
  const w = maxW * clamp(box.zoom, MIN_ZOOM, 1);
  const h = w / aspect;
  return { x: clamp(box.cx * W - w / 2, 0, W - w), y: clamp(box.cy * H - h / 2, 0, H - h), w, h };
}

export function freeRect(W: number, H: number, box: FreeBox): Rect {
  const w = clamp(box.w, MIN_FREE, 1);
  const h = clamp(box.h, MIN_FREE, 1);
  return { x: clamp(box.x, 0, 1 - w) * W, y: clamp(box.y, 0, 1 - h) * H, w: w * W, h: h * H };
}

/** Whole-pixel rect that stays inside the image. */
export function toPixels(r: Rect, W: number, H: number): Rect {
  const w = clamp(Math.round(r.w), 1, W);
  const h = clamp(Math.round(r.h), 1, H);
  return { x: clamp(Math.round(r.x), 0, W - w), y: clamp(Math.round(r.y), 0, H - h), w, h };
}

/** Re-centres an aspect box so it stays inside the image after a zoom change. */
export function normalizeAspectBox(W: number, H: number, aspect: number, box: AspectBox): AspectBox {
  const zoom = clamp(box.zoom, MIN_ZOOM, 1);
  const r = aspectRect(W, H, aspect, { ...box, zoom });
  return { cx: (r.x + r.w / 2) / W, cy: (r.y + r.h / 2) / H, zoom };
}

export function moveAspect(W: number, H: number, aspect: number, box: AspectBox, dx: number, dy: number): AspectBox {
  return normalizeAspectBox(W, H, aspect, { ...box, cx: box.cx + dx, cy: box.cy + dy });
}

/** Resize by dragging a corner: `anchor` is the opposite corner in image pixels, `pointer` the dragged one. */
export function resizeAspect(W: number, H: number, aspect: number, anchor: { x: number; y: number }, pointer: { x: number; y: number }): AspectBox {
  const sx = pointer.x >= anchor.x ? 1 : -1;
  const sy = pointer.y >= anchor.y ? 1 : -1;
  // Largest box that fits between the anchor and the image edge in the drag direction.
  const room = { w: sx > 0 ? W - anchor.x : anchor.x, h: sy > 0 ? H - anchor.y : anchor.y };
  const maxW = Math.min(room.w, room.h * aspect);
  const wanted = Math.max(Math.abs(pointer.x - anchor.x), Math.abs(pointer.y - anchor.y) * aspect);
  const w = clamp(wanted, Math.min(maxW, Math.min(W, H * aspect) * MIN_ZOOM), maxW);
  const h = w / aspect;
  const cx = anchor.x + (sx * w) / 2;
  const cy = anchor.y + (sy * h) / 2;
  return normalizeAspectBox(W, H, aspect, { cx: cx / W, cy: cy / H, zoom: w / Math.min(W, H * aspect) });
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export function moveFree(box: FreeBox, dx: number, dy: number): FreeBox {
  return { ...box, x: clamp(box.x + dx, 0, 1 - box.w), y: clamp(box.y + dy, 0, 1 - box.h) };
}

/** Drags one edge or corner of a free box by (dx, dy) image fractions. */
export function resizeFree(box: FreeBox, handle: Handle, dx: number, dy: number): FreeBox {
  let { x, y } = box;
  let right = box.x + box.w;
  let bottom = box.y + box.h;
  if (handle.includes('w')) x = clamp(box.x + dx, 0, right - MIN_FREE);
  if (handle.includes('e')) right = clamp(right + dx, x + MIN_FREE, 1);
  if (handle.includes('n')) y = clamp(box.y + dy, 0, bottom - MIN_FREE);
  if (handle.includes('s')) bottom = clamp(bottom + dy, y + MIN_FREE, 1);
  return { x, y, w: right - x, h: bottom - y };
}

export interface AspectPreset {
  id: string;
  label: string;
  /** width / height; null = free. */
  ratio: number | null;
}

export const PRESETS: readonly AspectPreset[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: '1:1 square', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '5:4', label: '5:4', ratio: 5 / 4 },
  { id: '4:5', label: '4:5 portrait', ratio: 4 / 5 },
  { id: '2:3', label: '2:3 portrait', ratio: 2 / 3 },
  { id: '9:16', label: '9:16 portrait', ratio: 9 / 16 },
];

export type CropMode =
  | { kind: 'free' }
  | { kind: 'ratio'; ratio: number }
  /** Crop to this ratio, then scale the result to exactly width × height. */
  | { kind: 'exact'; width: number; height: number };

export function modeRatio(mode: CropMode): number | null {
  if (mode.kind === 'ratio') return mode.ratio;
  if (mode.kind === 'exact') return mode.width / mode.height;
  return null;
}

export interface CropBoxes {
  aspect: AspectBox;
  free: FreeBox;
}

/** Source rect in whole pixels for an image of W×H. */
export function cropRect(W: number, H: number, mode: CropMode, boxes: CropBoxes): Rect {
  const ratio = modeRatio(mode);
  return toPixels(ratio === null ? freeRect(W, H, boxes.free) : aspectRect(W, H, ratio, boxes.aspect), W, H);
}

/** Output size: exact size when requested, otherwise the cropped pixels as they are. */
export function outputSizeFor(crop: Rect, mode: CropMode): { width: number; height: number } {
  return mode.kind === 'exact' ? { width: mode.width, height: mode.height } : { width: crop.w, height: crop.h };
}

/** Parses "16:9", "1.5" or "3/2" into a ratio, or null if invalid. */
export function parseRatio(text: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)\s*$/.exec(text);
  if (m) {
    const r = Number(m[1]) / Number(m[2]);
    return Number.isFinite(r) && r > 0 ? r : null;
  }
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}
