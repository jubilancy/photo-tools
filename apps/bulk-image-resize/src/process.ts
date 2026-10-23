import {
  decodeImage,
  encodeCanvas,
  formatOf,
  get2d,
  createCanvas,
  IMAGE_FORMATS,
  outputName,
  resample,
  type HostContext,
  type ImageFormat,
} from '@tools/image-utils';
import { computeResize, validateSpec, type ResizeSpec } from './resize';

export interface ResizeRequest {
  file: File;
  spec: ResizeSpec;
  /** `null` keeps the input's format (PNG for types browsers cannot encode). */
  format: ImageFormat | null;
  quality: number;
  keepMetadata: boolean;
  /** Fill for "pad" mode; `null` leaves it transparent (white for JPEG). */
  padColor: string | null;
}

export interface ResizeResult {
  blob: Blob;
  name: string;
  fromWidth: number;
  fromHeight: number;
  width: number;
  height: number;
}

export async function processResize(req: ResizeRequest, ctx: HostContext): Promise<ResizeResult> {
  const problem = validateSpec(req.spec);
  if (problem) throw new Error(problem);
  const bitmap = await decodeImage(req.file);
  try {
    const plan = computeResize(bitmap.width, bitmap.height, req.spec);
    ctx.progress(0.3);
    let canvas = resample(bitmap, plan.width, plan.height, plan.src, plan.dest);
    if (req.spec.fit === 'pad' && req.padColor && (plan.dest.w < plan.width || plan.dest.h < plan.height)) {
      // Paint the colour first, then the resized picture on top.
      const framed = createCanvas(plan.width, plan.height);
      const c = get2d(framed);
      c.fillStyle = req.padColor;
      c.fillRect(0, 0, plan.width, plan.height);
      c.drawImage(canvas, 0, 0);
      canvas = framed;
    }
    ctx.progress(0.7);
    const format = req.format ?? formatOf(req.file.type);
    const blob = await encodeCanvas(canvas, {
      format,
      quality: req.quality,
      keepMetadataFrom: req.keepMetadata ? req.file : null,
      background: req.padColor ?? '#ffffff',
    });
    return {
      blob,
      name: outputName(req.file.name, IMAGE_FORMATS[format].ext, `-${plan.width}x${plan.height}`),
      fromWidth: bitmap.width,
      fromHeight: bitmap.height,
      width: plan.width,
      height: plan.height,
    };
  } finally {
    bitmap.close();
  }
}
