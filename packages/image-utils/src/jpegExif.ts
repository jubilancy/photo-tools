/**
 * Minimal JPEG EXIF carry-over. Canvas encoders drop metadata; this copies the
 * source APP1 "Exif" segment into the re-encoded JPEG, with Orientation reset
 * to 1 because the pixels have already been rotated.
 */

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

/** Returns the full APP1 segment (marker + length + payload) or null. */
export function extractExifSegment(jpeg: Uint8Array): Uint8Array | null {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 4 <= jpeg.length) {
    if (jpeg[pos] !== 0xff) return null;
    const marker = jpeg[pos + 1]!;
    if (marker === 0xda || marker === 0xd9) return null; // start of scan / end of image
    const length = (jpeg[pos + 2]! << 8) | jpeg[pos + 3]!;
    if (length < 2 || pos + 2 + length > jpeg.length) return null;
    if (marker === 0xe1 && EXIF_HEADER.every((b, i) => jpeg[pos + 4 + i] === b)) {
      return jpeg.slice(pos, pos + 2 + length);
    }
    pos += 2 + length;
  }
  return null;
}

/** Sets the Orientation tag (0x0112) to 1 in place. Returns true if the tag was found. */
export function resetOrientation(segment: Uint8Array): boolean {
  const tiff = 10; // marker(2) + length(2) + "Exif\0\0"(6)
  if (segment.length < tiff + 8) return false;
  const little = segment[tiff] === 0x49;
  const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > segment.length) return false;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > segment.length) return false;
    if (u16(entry) === 0x0112) {
      view.setUint16(entry + 8, 1, little);
      return true;
    }
  }
  return false;
}

/** Inserts an EXIF segment right after SOI, dropping any APP1 Exif already present. */
export function injectExif(jpeg: Uint8Array, segment: Uint8Array): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const existing = extractExifSegment(jpeg);
  let rest = jpeg.subarray(2);
  if (existing) {
    const at = indexOfSegment(jpeg, existing);
    rest = new Uint8Array([...jpeg.subarray(2, at), ...jpeg.subarray(at + existing.length)]);
  }
  const out = new Uint8Array(2 + segment.length + rest.length);
  out.set([0xff, 0xd8]);
  out.set(segment, 2);
  out.set(rest, 2 + segment.length);
  return out;
}

function indexOfSegment(jpeg: Uint8Array, segment: Uint8Array): number {
  let pos = 2;
  while (pos < jpeg.length) {
    const length = (jpeg[pos + 2]! << 8) | jpeg[pos + 3]!;
    if (jpeg[pos + 1] === 0xe1 && length + 2 === segment.length) return pos;
    pos += 2 + length;
  }
  return -1;
}

/** Copies EXIF from `source` into `output` (both JPEG bytes). Returns `output` unchanged when there is nothing to copy. */
export function copyExif(source: Uint8Array, output: Uint8Array): Uint8Array {
  const segment = extractExifSegment(source);
  if (!segment) return output;
  resetOrientation(segment);
  return injectExif(output, segment);
}
