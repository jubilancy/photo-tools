import encodeJpeg from '@jsquash/jpeg/encode';
import optimisePng from '@jsquash/oxipng/optimise';
import encodeWebp from '@jsquash/webp/encode';
import {
  copyExif,
  createCanvas,
  decodeImage,
  encodeCanvas,
  flatten,
  formatOf,
  get2d,
  IMAGE_FORMATS,
  outputName,
  type HostContext,
  type ImageFormat,
} from '@tools/image-utils';

export interface CompressRequest {
  file: File;
  /** `null` keeps the input's format (PNG for types browsers cannot encode). */
  format: ImageFormat | null;
  /** Only meaningful for WebP; JPEG is always lossy and PNG always lossless. */
  mode: 'lossy' | 'lossless';
  /** 1–100, for JPEG and lossy WebP. */
  quality: number;
  /** OxiPNG effort 1–6. */
  pngLevel: number;
  engine: 'wasm' | 'native';
  keepMetadata: boolean;
}

export interface CompressResult {
  blob: Blob;
  name: string;
  originalSize: number;
  newSize: number;
  /** The input was returned unchanged because re-encoding would not make it smaller. */
  keptOriginal: boolean;
}

const copy = (b: ArrayBuffer | Uint8Array) => new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b));

async function encodeWasm(image: ImageData, format: ImageFormat, req: CompressRequest): Promise<Uint8Array> {
  if (format === 'jpeg') return copy(await encodeJpeg(image, { quality: req.quality }));
  if (format === 'webp') return copy(await encodeWebp(image, { quality: req.quality, lossless: req.mode === 'lossless' ? 1 : 0 }));
  return copy(await optimisePng(image, { level: req.pngLevel }));
}

export async function processCompress(req: CompressRequest, ctx: HostContext): Promise<CompressResult> {
  const original = req.file;
  const sourceFormat = formatOf(original.type);
  const target = req.format ?? sourceFormat;
  const ext = IMAGE_FORMATS[target].ext;
  const name = outputName(original.name, ext, '-compressed');
  const sameType = target === sourceFormat && IMAGE_FORMATS[sourceFormat].mime === original.type;

  let bytes: Uint8Array | Blob;
  if (req.engine === 'wasm' && sameType && target === 'png') {
    // Optimise the PNG bytes directly: keeps every pixel (and bit depth) exactly as it was.
    if (original.size === 0) throw new Error('The file is empty.');
    ctx.progress(0.2);
    try {
      bytes = copy(await optimisePng(await original.arrayBuffer(), { level: req.pngLevel }));
    } catch {
      throw new Error('This file could not be read as a PNG (unsupported or corrupt).');
    }
  } else {
    const bitmap = await decodeImage(original);
    try {
      ctx.progress(0.2);
      let canvas = createCanvas(bitmap.width, bitmap.height);
      get2d(canvas).drawImage(bitmap, 0, 0);
      if (target === 'jpeg') canvas = flatten(canvas, '#ffffff');
      ctx.progress(0.4);
      if (req.engine === 'wasm') {
        const image = get2d(canvas, { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
        bytes = await encodeWasm(image, target, req);
      } else {
        bytes = await encodeCanvas(canvas, { format: target, quality: req.quality / 100 });
      }
    } finally {
      bitmap.close();
    }
  }
  ctx.progress(0.85);

  if (req.keepMetadata && target === 'jpeg' && sourceFormat === 'jpeg') {
    const merged = copyExif(new Uint8Array(await original.arrayBuffer()), bytes instanceof Blob ? new Uint8Array(await bytes.arrayBuffer()) : bytes);
    bytes = merged;
  }
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: IMAGE_FORMATS[target].mime });
  if (sameType && blob.size >= original.size) {
    return { blob: original, name, originalSize: original.size, newSize: original.size, keptOriginal: true };
  }
  return { blob, name, originalSize: original.size, newSize: blob.size, keptOriginal: false };
}
