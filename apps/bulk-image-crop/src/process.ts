import {
  decodeImage,
  encodeCanvas,
  formatOf,
  IMAGE_FORMATS,
  outputName,
  resample,
  type HostContext,
  type ImageFormat,
} from '@tools/image-utils';
import { cropRect, outputSizeFor, type CropBoxes, type CropMode } from './cropMath';

export interface CropRequest {
  file: File;
  mode: CropMode;
  boxes: CropBoxes;
  /** `null` keeps the input's format (PNG for types browsers cannot encode). */
  format: ImageFormat | null;
  quality: number;
  keepMetadata: boolean;
}

export interface CropResult {
  blob: Blob;
  name: string;
  width: number;
  height: number;
}

export async function processCrop(req: CropRequest, ctx: HostContext): Promise<CropResult> {
  const bitmap = await decodeImage(req.file);
  try {
    const rect = cropRect(bitmap.width, bitmap.height, req.mode, req.boxes);
    const size = outputSizeFor(rect, req.mode);
    ctx.progress(0.4);
    const canvas = resample(bitmap, size.width, size.height, rect);
    const format = req.format ?? formatOf(req.file.type);
    const blob = await encodeCanvas(canvas, { format, quality: req.quality, keepMetadataFrom: req.keepMetadata ? req.file : null });
    return { blob, name: outputName(req.file.name, IMAGE_FORMATS[format].ext, '-cropped'), width: size.width, height: size.height };
  } finally {
    bitmap.close();
  }
}
