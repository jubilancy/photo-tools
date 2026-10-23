export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

export function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { stem: name, ext: '' };
  return { stem: name.slice(0, dot), ext: name.slice(dot + 1) };
}

/** `photo.JPG` → `photo-small.webp`. */
export function outputName(name: string, ext: string, suffix = ''): string {
  return `${splitName(name).stem}${suffix}.${ext}`;
}

/** Makes names unique case-insensitively: a.png, a.png → a.png, a-2.png. */
export function uniqueNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    const { stem, ext } = splitName(name);
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
      candidate = ext ? `${stem}-${n}.${ext}` : `${stem}-${n}`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

export const IMAGE_FORMATS = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG', lossy: true },
  png: { mime: 'image/png', ext: 'png', label: 'PNG', lossy: false },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true },
} as const;

export type ImageFormat = keyof typeof IMAGE_FORMATS;

/** Output format that matches a source file's type, falling back to PNG. */
export function formatOf(mime: string): ImageFormat {
  if (mime === 'image/jpeg') return 'jpeg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}
