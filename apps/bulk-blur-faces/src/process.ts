import { FaceDetector } from '@mediapipe/tasks-vision';
import loaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';
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
import fullRangeModel from './models/blaze_face_full_range.tflite?url';
import shortRangeModel from './models/blaze_face_short_range.tflite?url';
import { hideRegions, type HideOptions } from './render';
import { padRegion, type Region } from './regions';

export type Range = 'full' | 'short';

export type Request =
  | { op: 'detect'; file: File; range: Range; minScore: number; padding: number }
  | ({ op: 'hide'; file: File; regions: Region[]; format: ImageFormat; quality: number; keepMetadata: boolean } & HideOptions);

export type Response =
  | { op: 'detect'; regions: Region[] }
  | { op: 'hide'; blob: Blob; name: string; width: number; height: number; count: number };

/** Faces smaller than this many pixels in the detector's input are unreliable, so large photos are scaled to this side. */
const DETECT_SIDE = 1600;

const absolute = (url: string) => new URL(url, import.meta.url).href;
const detectors = new Map<Range, Promise<FaceDetector>>();

function detectorFor(range: Range): Promise<FaceDetector> {
  let pending = detectors.get(range);
  if (!pending) {
    pending = FaceDetector.createFromOptions(
      { wasmLoaderPath: absolute(loaderUrl), wasmBinaryPath: absolute(wasmUrl) },
      {
        baseOptions: { modelAssetPath: absolute(range === 'full' ? fullRangeModel : shortRangeModel), delegate: 'CPU' },
        runningMode: 'IMAGE',
      },
    );
    detectors.set(range, pending);
    pending.catch(() => detectors.delete(range));
  }
  return pending;
}

async function detect(req: Extract<Request, { op: 'detect' }>, ctx: HostContext): Promise<Response> {
  const bitmap = await decodeImage(req.file);
  try {
    ctx.progress(0.2);
    const scale = Math.min(1, DETECT_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const input = createCanvas(w, h);
    const ictx = get2d(input);
    ictx.imageSmoothingQuality = 'high';
    ictx.drawImage(bitmap, 0, 0, w, h);
    const detector = await detectorFor(req.range);
    await detector.setOptions({ minDetectionConfidence: req.minScore });
    ctx.progress(0.6);
    const { detections } = detector.detect(input as HTMLCanvasElement);
    const regions = detections.flatMap((d) => {
      const b = d.boundingBox;
      return b ? [padRegion({ x: b.originX / w, y: b.originY / h, w: b.width / w, h: b.height / h }, req.padding)] : [];
    });
    return { op: 'detect', regions: regions.sort((a, b) => a.x - b.x) };
  } finally {
    bitmap.close();
  }
}

async function hide(req: Extract<Request, { op: 'hide' }>, ctx: HostContext): Promise<Response> {
  const bitmap = await decodeImage(req.file);
  try {
    const canvas = createCanvas(bitmap.width, bitmap.height);
    const c = get2d(canvas);
    c.drawImage(bitmap, 0, 0);
    ctx.progress(0.3);
    hideRegions(c, bitmap, canvas.width, canvas.height, req.regions, req);
    ctx.progress(0.7);
    const blob = await encodeCanvas(canvas, { format: req.format, quality: req.quality, keepMetadataFrom: req.keepMetadata ? req.file : null });
    return {
      op: 'hide',
      blob,
      name: outputName(req.file.name, IMAGE_FORMATS[req.format].ext, '-blurred'),
      width: canvas.width,
      height: canvas.height,
      count: req.regions.length,
    };
  } finally {
    bitmap.close();
  }
}

export function handle(req: Request, ctx: HostContext): Promise<Response> {
  return req.op === 'detect' ? detect(req, ctx) : hide(req, ctx);
}
