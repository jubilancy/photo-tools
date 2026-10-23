import {
  createCanvas,
  decodeImage,
  encodeCanvas,
  formatOf,
  get2d,
  IMAGE_FORMATS,
  outputName,
  type HostContext,
  type ImageFormat,
} from '@tools/image-utils';
import { transformMatrix, type TransformOptions } from './transform';

export interface FlipRotateRequest {
  file: File;
  transform: TransformOptions;
  /** `null` keeps the input's format (PNG for types browsers cannot encode). */
  format: ImageFormat | null;
  quality: number;
  keepMetadata: boolean;
  /** CSS colour for areas exposed by rotation; `null` leaves them transparent (white when exporting JPEG). */
  fill: string | null;
}

export interface FlipRotateResult {
  blob: Blob;
  name: string;
  width: number;
  height: number;
}

export async function processFlipRotate(req: FlipRotateRequest, ctx: HostContext): Promise<FlipRotateResult> {
  const bitmap = await decodeImage(req.file);
  try {
    const { matrix, width, height } = transformMatrix(bitmap.width, bitmap.height, req.transform);
    const canvas = createCanvas(width, height);
    const c = get2d(canvas);
    if (req.fill) {
      c.fillStyle = req.fill;
      c.fillRect(0, 0, width, height);
    }
    c.imageSmoothingQuality = 'high';
    c.setTransform(...matrix);
    c.drawImage(bitmap, 0, 0);
    ctx.progress(0.6);
    const format = req.format ?? formatOf(req.file.type);
    const blob = await encodeCanvas(canvas, {
      format,
      quality: req.quality,
      keepMetadataFrom: req.keepMetadata ? req.file : null,
      background: req.fill ?? '#ffffff',
    });
    return { blob, name: outputName(req.file.name, IMAGE_FORMATS[format].ext, '-edited'), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}
