import { describe, expect, it } from 'vitest';
import { copyExif, extractExifSegment, injectExif, resetOrientation } from './jpegExif';

/** SOI + APP1(Exif, little-endian, one IFD entry: Orientation=6) + SOS stub + EOI. */
function jpegWithExif(orientation: number): Uint8Array {
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // header, IFD at 8
    0x01, 0x00, // 1 entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // next IFD
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...payload, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
}
const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);

describe('jpegExif', () => {
  it('extracts the Exif segment', () => {
    const seg = extractExifSegment(jpegWithExif(6));
    expect(seg).not.toBeNull();
    expect(seg![0]).toBe(0xff);
    expect(seg![1]).toBe(0xe1);
  });
  it('returns null without Exif or for non-JPEG', () => {
    expect(extractExifSegment(plain)).toBeNull();
    expect(extractExifSegment(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it('resets orientation to 1', () => {
    const seg = extractExifSegment(jpegWithExif(6))!;
    expect(resetOrientation(seg)).toBe(true);
    expect(seg[10 + 8 + 2 + 8]).toBe(1);
  });
  it('copies Exif into an output JPEG with orientation reset', () => {
    const out = copyExif(jpegWithExif(8), plain);
    const seg = extractExifSegment(out)!;
    expect(seg).not.toBeNull();
    expect(seg[10 + 8 + 2 + 8]).toBe(1);
    expect(out.slice(-2)).toEqual(new Uint8Array([0xff, 0xd9]));
  });
  it('replaces an existing Exif segment instead of duplicating it', () => {
    const out = injectExif(jpegWithExif(3), extractExifSegment(jpegWithExif(6))!);
    const count = [...out].reduce((n, b, i) => (b === 0xff && out[i + 1] === 0xe1 ? n + 1 : n), 0);
    expect(count).toBe(1);
  });
  it('leaves output untouched when the source has no Exif', () => {
    expect(copyExif(plain, plain)).toBe(plain);
  });
});
