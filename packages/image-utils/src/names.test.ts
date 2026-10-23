import { describe, expect, it } from 'vitest';
import { formatBytes, formatOf, outputName, splitName, uniqueNames } from './names';

describe('names', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(-1)).toBe('–');
  });
  it('splits and renames', () => {
    expect(splitName('a.b.png')).toEqual({ stem: 'a.b', ext: 'png' });
    expect(splitName('.hidden')).toEqual({ stem: '.hidden', ext: '' });
    expect(outputName('Photo.JPG', 'webp', '-small')).toBe('Photo-small.webp');
  });
  it('de-duplicates case-insensitively', () => {
    expect(uniqueNames(['a.png', 'A.png', 'a.png', 'b'])).toEqual(['a.png', 'A-2.png', 'a-3.png', 'b']);
    expect(uniqueNames(['x', 'x'])).toEqual(['x', 'x-2']);
  });
  it('maps mime to format', () => {
    expect(formatOf('image/jpeg')).toBe('jpeg');
    expect(formatOf('image/gif')).toBe('png');
  });
});
