export interface ToolInfo {
  slug: string;
  name: string;
  summary: string;
  group: 'Images' | 'Time' | 'Media' | 'Data';
}

/** Tools shown on the landing page. Rename a tool by editing `name` here and in the app. */
export const TOOLS: readonly ToolInfo[] = [
  { slug: 'grayscale-images', name: 'Grayscale Images', summary: 'Turn photos black and white with an adjustable intensity.', group: 'Images' },
  { slug: 'bulk-watermark', name: 'Bulk Watermark', summary: 'Stamp a text or image watermark on many pictures at once.', group: 'Images' },
  { slug: 'bulk-flip-rotate', name: 'Bulk Flip & Rotate', summary: 'Mirror or turn a whole batch of images.', group: 'Images' },
  { slug: 'time-taker', name: 'Time Taker', summary: 'Stopwatch, laps and countdown timers that survive a reload.', group: 'Time' },
  { slug: 'bulk-image-resize', name: 'Bulk Image Resize', summary: 'Resize by pixels, percent or longest side.', group: 'Images' },
  { slug: 'image-compressor', name: 'Image Compressor', summary: 'Shrink JPEG, PNG and WebP files and see the savings.', group: 'Images' },
  { slug: 'bulk-image-crop', name: 'Bulk Image Crop', summary: 'Crop many images to one aspect ratio or exact size.', group: 'Images' },
  { slug: 'bulk-blur-faces', name: 'Bulk Blur Faces', summary: 'Find faces on-device and blur or pixelate them.', group: 'Media' },
];
