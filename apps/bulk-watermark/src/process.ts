import {
  createCanvas,
  decodeImage,
  encodeCanvas,
  get2d,
  IMAGE_FORMATS,
  outputName,
  type HostContext,
  type ImageFormat,
} from '@tools/image-utils';
import { drawWatermark, type WatermarkOptions } from './draw';

export interface WatermarkRequest {
  file: File;
  /** Required when `options.kind === 'image'`. */
  watermark: File | null;
  options: WatermarkOptions;
  format: ImageFormat;
  quality: number;
  keepMetadata: boolean;
}

export interface WatermarkResult {
  blob: Blob;
  name: string;
  width: number;
  height: number;
}

export async function processWatermark(req: WatermarkRequest, ctx: HostContext): Promise<WatermarkResult> {
  if (req.options.kind === 'image' && !req.watermark) throw new Error('Choose a watermark image first.');
  const bitmap = await decodeImage(req.file);
  const mark = req.options.kind === 'image' && req.watermark ? await decodeImage(req.watermark) : null;
  try {
    ctx.progress(0.3);
    const canvas = createCanvas(bitmap.width, bitmap.height);
    const c = get2d(canvas);
    c.drawImage(bitmap, 0, 0);
    drawWatermark(c, canvas.width, canvas.height, req.options, mark);
    ctx.progress(0.7);
    const blob = await encodeCanvas(canvas, {
      format: req.format,
      quality: req.quality,
      keepMetadataFrom: req.keepMetadata ? req.file : null,
    });
    return { blob, name: outputName(req.file.name, IMAGE_FORMATS[req.format].ext, '-watermarked'), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
    mark?.close();
  }
}
