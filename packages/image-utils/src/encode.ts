import { canvasToBlob, createCanvas, get2d, type AnyCanvas } from './canvas';
import { copyExif } from './jpegExif';
import { IMAGE_FORMATS, type ImageFormat } from './names';

export interface EncodeOptions {
  format: ImageFormat;
  /** 0–1; ignored for PNG. */
  quality?: number;
  /** For JPEG output only: the original file whose EXIF block should be carried over. */
  keepMetadataFrom?: Blob | null;
  /** Colour placed behind transparent pixels when the format has no alpha channel (JPEG). Default white. */
  background?: string;
}

export function flatten(canvas: AnyCanvas, background: string): AnyCanvas {
  const out = createCanvas(canvas.width, canvas.height);
  const ctx = get2d(out);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/** Encodes a canvas, verifying the browser honoured the requested type. */
export async function encodeCanvas(canvas: AnyCanvas, opts: EncodeOptions): Promise<Blob> {
  const spec = IMAGE_FORMATS[opts.format];
  const source = opts.format === 'jpeg' ? flatten(canvas, opts.background ?? '#ffffff') : canvas;
  let blob = await canvasToBlob(source, spec.mime, spec.lossy ? opts.quality : undefined);
  if (blob.type !== spec.mime) {
    throw new Error(`This browser cannot export ${spec.label}. Pick another output format.`);
  }
  if (opts.format === 'jpeg' && opts.keepMetadataFrom) {
    const [src, out] = await Promise.all([opts.keepMetadataFrom.arrayBuffer(), blob.arrayBuffer()]);
    const merged = copyExif(new Uint8Array(src), new Uint8Array(out));
    blob = new Blob([merged as BlobPart], { type: spec.mime });
  }
  return blob;
}
