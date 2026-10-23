import { decodeImage } from '@tools/image-utils';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  aspectRect, cropRect, freeRect, modeRatio, moveAspect, moveFree, normalizeAspectBox, resizeAspect, resizeFree,
  type CropBoxes, type CropMode, type Handle, type Rect,
} from './cropMath';

const PREVIEW_WIDTH = 1000;
const CORNERS: Handle[] = ['nw', 'ne', 'sw', 'se'];
const ALL_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_POS: Record<Handle, { left: string; top: string; cursor: string }> = {
  nw: { left: '0%', top: '0%', cursor: 'nwse-resize' },
  n: { left: '50%', top: '0%', cursor: 'ns-resize' },
  ne: { left: '100%', top: '0%', cursor: 'nesw-resize' },
  e: { left: '100%', top: '50%', cursor: 'ew-resize' },
  se: { left: '100%', top: '100%', cursor: 'nwse-resize' },
  s: { left: '50%', top: '100%', cursor: 'ns-resize' },
  sw: { left: '0%', top: '100%', cursor: 'nesw-resize' },
  w: { left: '0%', top: '50%', cursor: 'ew-resize' },
};

interface Loaded {
  file: File;
  bitmap: ImageBitmap;
  W: number;
  H: number;
}

interface Drag {
  handle: Handle | 'move';
  startX: number;
  startY: number;
  boxes: CropBoxes;
  rect: Rect;
}

export function CropEditor({ file, mode, boxes, onChange }: { file: File; mode: CropMode; boxes: CropBoxes; onChange: (b: CropBoxes) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ file: File; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const full = await decodeImage(file);
      const scale = Math.min(1, PREVIEW_WIDTH / full.width);
      const small = await createImageBitmap(full, { resizeWidth: Math.max(1, Math.round(full.width * scale)), resizeHeight: Math.max(1, Math.round(full.height * scale)), resizeQuality: 'high' });
      const next = { file, bitmap: small, W: full.width, H: full.height };
      full.close();
      return next;
    })().then(
      (next) => (cancelled ? next.bitmap.close() : setLoaded(next)),
      (e: unknown) => !cancelled && setError({ file, message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [file]);

  const current = loaded?.file === file ? loaded : null;
  useEffect(() => {
    const el = canvas.current;
    if (!el || !current) return;
    el.width = current.bitmap.width;
    el.height = current.bitmap.height;
    el.getContext('2d')!.drawImage(current.bitmap, 0, 0);
  }, [current]);

  if (error?.file === file) return <p role="alert" style={{ color: 'var(--danger)' }}>{error.message}</p>;
  if (!current) return <p className="muted">Loading preview…</p>;

  const { W, H } = current;
  const ratio = modeRatio(mode);
  const rect: Rect = ratio === null ? freeRect(W, H, boxes.free) : aspectRect(W, H, ratio, boxes.aspect);
  const px = cropRect(W, H, mode, boxes);

  const imagePoint = (e: PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const begin = (handle: Drag['handle'], e: PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, startX: e.clientX, startY: e.clientY, boxes, rect };
  };

  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const bounds = stage.current!.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / bounds.width;
    const dy = (e.clientY - d.startY) / bounds.height;
    if (d.handle === 'move') {
      onChange(ratio === null ? { ...d.boxes, free: moveFree(d.boxes.free, dx, dy) } : { ...d.boxes, aspect: moveAspect(W, H, ratio, d.boxes.aspect, dx, dy) });
    } else if (ratio === null) {
      onChange({ ...d.boxes, free: resizeFree(d.boxes.free, d.handle, dx, dy) });
    } else {
      const { x, y, w, h } = d.rect;
      const anchor = { x: d.handle.includes('w') ? x + w : x, y: d.handle.includes('n') ? y + h : y };
      onChange({ ...d.boxes, aspect: resizeAspect(W, H, ratio, anchor, imagePoint(e)) });
    }
  };

  const end = () => {
    drag.current = null;
  };

  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    const grow = e.key === '+' || e.key === '=' ? step : e.key === '-' ? -step : 0;
    if (!dir && !grow) return;
    e.preventDefault();
    if (dir) {
      onChange(ratio === null ? { ...boxes, free: moveFree(boxes.free, dir[0]!, dir[1]!) } : { ...boxes, aspect: moveAspect(W, H, ratio, boxes.aspect, dir[0]!, dir[1]!) });
    } else if (ratio === null) {
      const f = boxes.free;
      onChange({ ...boxes, free: resizeFree(resizeFree(f, 'nw', -grow / 2, -grow / 2), 'se', grow / 2, grow / 2) });
    } else {
      onChange({ ...boxes, aspect: normalizeAspectBox(W, H, ratio, { ...boxes.aspect, zoom: boxes.aspect.zoom + grow }) });
    }
  };

  const handles = ratio === null ? ALL_HANDLES : CORNERS;
  return (
    <div>
      <div ref={stage} className="crop-stage" style={{ aspectRatio: `${W} / ${H}`, width: '100%', maxWidth: Math.max(480, Math.min(W, PREVIEW_WIDTH)) }}>
        <canvas ref={canvas} role="img" aria-label={`Preview of ${file.name}`} style={{ width: '100%', height: '100%', display: 'block' }} />
        <div
          className="crop-box"
          tabIndex={0}
          role="group"
          aria-label="Crop box. Arrow keys move it; plus and minus resize it. Hold Shift for bigger steps."
          style={{ left: `${(rect.x / W) * 100}%`, top: `${(rect.y / H) * 100}%`, width: `${(rect.w / W) * 100}%`, height: `${(rect.h / H) * 100}%` }}
          onPointerDown={(e) => begin('move', e)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onKeyDown={key}
        >
          {handles.map((h) => (
            <span
              key={h}
              className="crop-handle"
              data-handle={h}
              style={{ ...HANDLE_POS[h] }}
              onPointerDown={(e) => begin(h, e)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
          ))}
        </div>
      </div>
      <p className="small muted" aria-live="polite" data-testid="crop-readout">
        Source {W}×{H} · crop {px.w}×{px.h} at ({px.x}, {px.y}){mode.kind === 'exact' ? ` · output ${mode.width}×${mode.height}` : ''}
      </p>
    </div>
  );
}
