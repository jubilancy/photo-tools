import { decodeImage } from '@tools/image-utils';
import { useEffect, useRef, useState } from 'react';
import { drawWatermark, type WatermarkOptions } from './draw';

const MAX_PREVIEW = 900;

/** Scaled-down copy of the photo; the watermark is redrawn on top of it for every option change. */
async function loadBase(file: File): Promise<ImageBitmap> {
  const full = await decodeImage(file);
  try {
    const scale = Math.min(1, MAX_PREVIEW / full.width);
    return await createImageBitmap(full, { resizeWidth: Math.round(full.width * scale), resizeHeight: Math.round(full.height * scale), resizeQuality: 'high' });
  } finally {
    full.close();
  }
}

export function Preview({ file, watermark, options }: { file: File; watermark: File | null; options: WatermarkOptions }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [base, setBase] = useState<{ file: File; bitmap: ImageBitmap } | null>(null);
  const [mark, setMark] = useState<{ file: File; bitmap: ImageBitmap } | null>(null);
  const [error, setError] = useState<{ file: File; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBase(file).then(
      (bitmap) => (cancelled ? bitmap.close() : setBase({ file, bitmap })),
      (e: unknown) => !cancelled && setError({ file, message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    if (!watermark) return;
    let cancelled = false;
    decodeImage(watermark).then(
      (bitmap) => (cancelled ? bitmap.close() : setMark({ file: watermark, bitmap })),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [watermark]);

  const current = base?.file === file ? base.bitmap : null;
  const markBitmap = mark && mark.file === watermark ? mark.bitmap : null;

  useEffect(() => {
    const el = canvas.current;
    if (!el || !current) return;
    el.width = current.width;
    el.height = current.height;
    const ctx = el.getContext('2d')!;
    ctx.drawImage(current, 0, 0);
    drawWatermark(ctx, el.width, el.height, options, markBitmap);
  }, [current, markBitmap, options]);

  const failure = error?.file === file ? error.message : null;
  return (
    <div className="card">
      <h2>Live preview</h2>
      <p className="muted small">Showing {file.name}. The export uses the same drawing code at full resolution.</p>
      {failure ? (
        <p role="alert" style={{ color: 'var(--danger)' }}>{failure}</p>
      ) : (
        <canvas ref={canvas} className="checker" style={{ maxWidth: '100%', height: 'auto' }} role="img" aria-label={`Preview of ${file.name} with watermark`} />
      )}
    </div>
  );
}
