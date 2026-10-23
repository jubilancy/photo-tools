import { decodeImage } from '@tools/image-utils';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { hideRegions, type HideOptions } from './render';
import { moveRegion, regionFromDrag, scaleRegion, type Region } from './regions';

const PREVIEW_WIDTH = 1000;

interface Loaded {
  file: File;
  bitmap: ImageBitmap;
  W: number;
  H: number;
}

type Gesture =
  | { kind: 'draw'; start: { x: number; y: number } }
  | { kind: 'move'; index: number; startX: number; startY: number; original: Region };

export interface RegionEditorProps {
  file: File;
  regions: Region[];
  onChange: (regions: Region[]) => void;
  hide: HideOptions;
  showEffect: boolean;
}

export function RegionEditor({ file, regions, onChange, hide, showEffect }: RegionEditorProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ file: File; message: string } | null>(null);
  const [draft, setDraft] = useState<Region | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const full = await decodeImage(file);
      const scale = Math.min(1, PREVIEW_WIDTH / full.width);
      const bitmap = await createImageBitmap(full, { resizeWidth: Math.max(1, Math.round(full.width * scale)), resizeHeight: Math.max(1, Math.round(full.height * scale)), resizeQuality: 'high' });
      const next = { file, bitmap, W: full.width, H: full.height };
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
    const ctx = el.getContext('2d')!;
    ctx.drawImage(current.bitmap, 0, 0);
    if (showEffect) hideRegions(ctx, current.bitmap, el.width, el.height, regions, hide);
  }, [current, regions, hide, showEffect]);

  if (error?.file === file) return <p role="alert" style={{ color: 'var(--danger)' }}>{error.message}</p>;
  if (!current) return <p className="muted">Loading preview…</p>;

  const point = (e: PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const startDraw = (e: PointerEvent) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName !== 'CANVAS') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { kind: 'draw', start: point(e) };
    setSelected(null);
  };
  const startMove = (index: number) => (e: PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { kind: 'move', index, startX: e.clientX, startY: e.clientY, original: regions[index]! };
    setSelected(index);
  };
  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'draw') setDraft(regionFromDrag(g.start, point(e), 0));
    else {
      const b = stage.current!.getBoundingClientRect();
      onChange(regions.map((r, i) => (i === g.index ? moveRegion(g.original, (e.clientX - g.startX) / b.width, (e.clientY - g.startY) / b.height) : r)));
    }
  };
  const onUp = (e: PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === 'draw') {
      const made = regionFromDrag(g.start, point(e));
      setDraft(null);
      if (made) {
        onChange([...regions, made]);
        setSelected(regions.length);
      }
    }
  };
  const remove = (index: number) => {
    onChange(regions.filter((_, i) => i !== index));
    setSelected(null);
  };
  const key = (index: number) => (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const r = regions[index]!;
    let next: Region | null = null;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(index);
      return;
    }
    if (e.key === 'ArrowLeft') next = moveRegion(r, -step, 0);
    else if (e.key === 'ArrowRight') next = moveRegion(r, step, 0);
    else if (e.key === 'ArrowUp') next = moveRegion(r, 0, -step);
    else if (e.key === 'ArrowDown') next = moveRegion(r, 0, step);
    else if (e.key === '+' || e.key === '=') next = scaleRegion(r, 1 + step * 4);
    else if (e.key === '-') next = scaleRegion(r, 1 / (1 + step * 4));
    if (next) {
      e.preventDefault();
      onChange(regions.map((x, i) => (i === index ? next! : x)));
    }
  };

  const box = (r: Region) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, borderRadius: hide.shape === 'ellipse' ? '50%' : 4 });
  return (
    <div>
      <div
        ref={stage}
        className="region-stage"
        style={{ aspectRatio: `${current.W} / ${current.H}`, width: '100%', maxWidth: Math.max(480, Math.min(current.W, PREVIEW_WIDTH)), cursor: 'crosshair' }}
        onPointerDown={startDraw}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          gesture.current = null;
          setDraft(null);
        }}
      >
        <canvas ref={canvas} role="img" aria-label={`Preview of ${file.name}`} style={{ width: '100%', height: '100%', display: 'block' }} />
        {regions.map((r, i) => (
          <div
            key={i}
            className={`region${selected === i ? ' selected' : ''}`}
            data-testid="region"
            tabIndex={0}
            role="group"
            aria-label={`Region ${i + 1}. Arrow keys move it, plus and minus resize it, Delete removes it.`}
            style={box(r)}
            onPointerDown={startMove(i)}
            onKeyDown={key(i)}
            onFocus={() => setSelected(i)}
          >
            <button type="button" className="region-remove" aria-label={`Remove region ${i + 1}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(i)}>
              ×
            </button>
          </div>
        ))}
        {draft && <div className="region draft" style={box(draft)} />}
      </div>
      <div className="row" style={{ marginTop: '.5rem' }}>
        <button type="button" className="btn small" onClick={() => onChange([...regions, { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }])}>
          Add a region
        </button>
        <button type="button" className="btn small" onClick={() => onChange([])} disabled={regions.length === 0}>
          Remove all
        </button>
        <span className="small muted" aria-live="polite">{regions.length} region{regions.length === 1 ? '' : 's'}. Drag on the picture to draw a new one.</span>
      </div>
    </div>
  );
}
