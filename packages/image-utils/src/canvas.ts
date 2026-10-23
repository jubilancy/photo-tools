export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Chromium's canvas area cap; other engines can be stricter, in which case drawing throws and the file is reported as failed. */
export const MAX_PIXELS = 268_435_456;

export function createCanvas(width: number, height: number): AnyCanvas {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w * h > MAX_PIXELS) {
    throw new Error(`Output of ${w}×${h} px is too large for this browser's canvas.`);
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export function get2d(canvas: AnyCanvas, options?: CanvasRenderingContext2DSettings): Ctx2D {
  const ctx = canvas.getContext('2d', options) as Ctx2D | null;
  if (!ctx) throw new Error('Canvas 2D is not available.');
  return ctx;
}

export function canvasToBlob(canvas: AnyCanvas, mime: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: mime, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode this image.'))), mime, quality),
  );
}
