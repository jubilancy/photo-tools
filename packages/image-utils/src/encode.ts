import { canvasToBlob, type AnyCanvas } from './canvas';
import { copyExif } from './jpegExif';
import { IMAGE_FORMATS, type ImageFormat } from './names';

export interface EncodeOptions {
  format: ImageFormat;
  /** 0–1; ignored for PNG. */
  quality?: number;
  /** For JPEG output only: the original file whose EXIF block should be carried over. */
  keepMetadataFrom?: Blob | null;
}

/** Encodes a canvas, verifying the browser honoured the requested type. */
export async function encodeCanvas(canvas: AnyCanvas, opts: EncodeOptions): Promise<Blob> {
  const spec = IMAGE_FORMATS[opts.format];
  let blob = await canvasToBlob(canvas, spec.mime, spec.lossy ? opts.quality : undefined);
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
