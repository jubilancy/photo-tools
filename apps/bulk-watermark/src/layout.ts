export interface Anchor {
  /** 0 = left, 1 = centre, 2 = right */
  col: 0 | 1 | 2;
  /** 0 = top, 1 = middle, 2 = bottom */
  row: 0 | 1 | 2;
}

export interface Placement {
  cx: number;
  cy: number;
}

export interface LayoutOptions {
  anchor: Anchor;
  /** Edge margin as a percentage of the image's shorter side. */
  marginPct: number;
  rotation: number;
  tile: boolean;
  /** Gap between tiles as a percentage of the watermark's size. */
  tileGapPct: number;
}

/** Axis-aligned size of a w×h box after rotating by `degrees`. */
export function rotatedSize(w: number, h: number, degrees: number): { w: number; h: number } {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  return { w: w * cos + h * sin, h: w * sin + h * cos };
}

function anchored(index: number, size: number, box: number, margin: number): number {
  if (index === 0) return margin + box / 2;
  if (index === 2) return size - margin - box / 2;
  return size / 2;
}

/**
 * Centre points for each copy of a wm×wh watermark on a W×H image.
 * Without tiling there is one placement; with tiling the grid is centred on the image and extends past the edges.
 */
export function placements(W: number, H: number, wmW: number, wmH: number, opts: LayoutOptions): Placement[] {
  const box = rotatedSize(wmW, wmH, opts.rotation);
  if (!opts.tile) {
    const margin = (opts.marginPct / 100) * Math.min(W, H);
    return [{ cx: anchored(opts.anchor.col, W, box.w, margin), cy: anchored(opts.anchor.row, H, box.h, margin) }];
  }
  const stepX = box.w + (opts.tileGapPct / 100) * wmW;
  const stepY = box.h + (opts.tileGapPct / 100) * wmH;
  const cols = Math.ceil(W / 2 / stepX) + 1;
  const rows = Math.ceil(H / 2 / stepY) + 1;
  const out: Placement[] = [];
  for (let r = -rows; r <= rows; r++) {
    for (let c = -cols; c <= cols; c++) out.push({ cx: W / 2 + c * stepX, cy: H / 2 + r * stepY });
  }
  return out;
}
