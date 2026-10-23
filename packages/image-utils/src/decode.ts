import { MAX_PIXELS } from './canvas';

/** Decodes an image with EXIF orientation applied, so width/height are the displayed size. */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  if (file.size === 0) throw new Error('The file is empty.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This file could not be read as an image (unsupported or corrupt).');
  }
  if (bitmap.width * bitmap.height > MAX_PIXELS) {
    bitmap.close();
    throw new Error('This image is too large for the browser to process.');
  }
  return bitmap;
}
