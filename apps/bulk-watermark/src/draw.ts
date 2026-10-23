import type { Ctx2D } from '@tools/image-utils';
import { placements, type Anchor } from './layout';

export type FontFamily = 'sans-serif' | 'serif' | 'monospace' | 'cursive';

export interface WatermarkOptions {
  kind: 'text' | 'image';
  text: string;
  fontFamily: FontFamily;
  bold: boolean;
  italic: boolean;
  color: string;
  shadow: boolean;
  anchor: Anchor;
  opacity: number;
  /** Watermark width as a percentage of the image width. */
  sizePct: number;
  rotation: number;
  marginPct: number;
  tile: boolean;
  tileGapPct: number;
}

export const DEFAULT_OPTIONS: WatermarkOptions = {
  kind: 'text',
  text: '© Your name',
  fontFamily: 'sans-serif',
  bold: true,
  italic: false,
  color: '#ffffff',
  shadow: true,
  anchor: { col: 2, row: 2 },
  opacity: 0.6,
  sizePct: 25,
  rotation: 0,
  marginPct: 3,
  tile: false,
  tileGapPct: 60,
};

const REFERENCE_PX = 100;

function fontString(o: WatermarkOptions, px: number): string {
  return `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${px}px ${o.fontFamily}`;
}

interface TextBlock {
  lines: string[];
  fontPx: number;
  lineHeight: number;
  width: number;
  height: number;
}

/** Sizes a (possibly multi-line) text so its widest line spans `targetWidth`. */
function layoutText(ctx: Ctx2D, o: WatermarkOptions, targetWidth: number): TextBlock | null {
  const lines = o.text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  ctx.font = fontString(o, REFERENCE_PX);
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (widest <= 0) return null;
  const fontPx = (REFERENCE_PX * targetWidth) / widest;
  const lineHeight = fontPx * 1.2;
  return { lines, fontPx, lineHeight, width: targetWidth, height: lineHeight * lines.length };
}

/**
 * Draws the watermark onto a W×H canvas that already holds the photo.
 * Every dimension is relative to the image, so a preview at any resolution matches the final export.
 */
export function drawWatermark(ctx: Ctx2D, W: number, H: number, o: WatermarkOptions, image: ImageBitmap | null): void {
  const targetWidth = (o.sizePct / 100) * W;
  let wmW = targetWidth;
  let wmH: number;
  let text: TextBlock | null = null;

  if (o.kind === 'image') {
    if (!image) return;
    wmH = (image.height / image.width) * wmW;
  } else {
    text = layoutText(ctx, o, targetWidth);
    if (!text) return;
    wmH = text.height;
    wmW = text.width;
  }

  ctx.save();
  ctx.globalAlpha = o.opacity;
  const rad = (o.rotation * Math.PI) / 180;
  for (const { cx, cy } of placements(W, H, wmW, wmH, o)) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad);
    if (text) {
      ctx.font = fontString(o, text.fontPx);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = o.color;
      if (o.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = text.fontPx * 0.08;
        ctx.shadowOffsetX = text.fontPx * 0.03;
        ctx.shadowOffsetY = text.fontPx * 0.03;
      }
      text.lines.forEach((line, i) => ctx.fillText(line, 0, (i - (text.lines.length - 1) / 2) * text.lineHeight));
    } else if (image) {
      ctx.drawImage(image, -wmW / 2, -wmH / 2, wmW, wmH);
    }
    ctx.restore();
  }
  ctx.restore();
}
