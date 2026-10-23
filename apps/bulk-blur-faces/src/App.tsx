import { createRunner, formatBytes, IMAGE_FORMATS, isAbort, type ImageFormat } from '@tools/image-utils';
import { AppShell, BatchBar, Checkbox, Dropzone, FileList, Segmented, Slider, useBatch } from '@tools/ui';
import { useEffect, useRef, useState } from 'react';
import { handle, type Range, type Request, type Response } from './process';
import { RegionEditor } from './RegionEditor';
import type { Shape, Style } from './render';
import type { Region } from './regions';

const runner = createRunner<Request, Response>(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), handle, 2);

interface Entry {
  status: 'detecting' | 'ready' | 'error';
  regions: Region[];
  error?: string;
}

interface Result {
  blob: Blob;
  name: string;
  width: number;
  height: number;
  count: number;
}

const FORMATS = (Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((value) => ({ value, label: IMAGE_FORMATS[value].label }));

export function App() {
  const batch = useBatch<Result>(2);
  const [entries, setEntries] = useState<Map<File, Entry>>(new Map());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [range, setRange] = useState<Range>('full');
  const [minScore, setMinScore] = useState(0.5);
  const [padding, setPadding] = useState(0.3);
  const [shape, setShape] = useState<Shape>('ellipse');
  const [style, setStyle] = useState<Style>('blur');
  const [strength, setStrength] = useState(80);
  const [showEffect, setShowEffect] = useState(true);
  const [format, setFormat] = useState<ImageFormat>('jpeg');
  const [quality, setQuality] = useState(0.92);
  const [keepMetadata, setKeepMetadata] = useState(false);
  const detection = useRef<AbortController | null>(null);

  useEffect(() => () => detection.current?.abort(), []);

  const detect = (files: File[]) => {
    const controller = detection.current ?? new AbortController();
    detection.current = controller;
    for (const file of files) {
      setEntries((m) => new Map(m).set(file, { status: 'detecting', regions: [] }));
      runner.run({ op: 'detect', file, range, minScore, padding }, { signal: controller.signal }).then(
        (res) => res.op === 'detect' && setEntries((m) => new Map(m).set(file, { status: 'ready', regions: res.regions })),
        (err: unknown) => {
          if (!isAbort(err)) setEntries((m) => new Map(m).set(file, { status: 'error', regions: [], error: err instanceof Error ? err.message : String(err) }));
        },
      );
    }
  };

  const onFiles = (files: File[]) => {
    batch.addFiles(files);
    detect(files);
  };
  const redetect = () => {
    detection.current?.abort();
    detection.current = new AbortController();
    detect(batch.items.map((i) => i.file));
  };
  const clear = () => {
    detection.current?.abort();
    detection.current = null;
    setEntries(new Map());
    batch.clear();
  };

  const selected = batch.items.find((i) => i.id === selectedId) ?? batch.items[0];
  const entry = selected ? entries.get(selected.file) : undefined;
  const detecting = batch.items.some((i) => entries.get(i.file)?.status === 'detecting');
  const hide = { shape, style, strength };

  const setRegions = (file: File, regions: Region[]) => setEntries((m) => new Map(m).set(file, { status: 'ready', regions }));

  const run = () =>
    batch.run(async (file, { signal, report }) => {
      const e = entries.get(file);
      if (!e || e.status === 'error') throw new Error(e?.error ?? 'Face detection did not finish for this file.');
      const res = await runner.run({ op: 'hide', file, regions: e.regions, format, quality, keepMetadata, ...hide }, { signal, onProgress: report });
      if (res.op !== 'hide') throw new Error('Unexpected worker reply.');
      return res;
    });

  return (
    <AppShell
      title="Bulk Blur Faces"
      tagline="Find faces on your own device and hide them in a whole batch of photos."
      howTo={[
        'Drop in your photos. A face detector built into this page marks each face; nothing leaves your browser.',
        'Check each photo: drag on the picture to add a region the detector missed, or remove a wrong one with its × button.',
        'Choose the blur strength and shape, press the blur button, then download files or a ZIP.',
      ]}
    >
      <div className="grid two">
        <section className="card" aria-label="Options">
          <h2>Hiding</h2>
          <Segmented
            legend="Effect"
            value={style}
            options={[
              { value: 'blur', label: 'Blur' },
              { value: 'pixelate', label: 'Pixelate' },
            ]}
            onChange={setStyle}
          />
          <Slider label="Strength" value={strength} min={1} max={100} onChange={setStrength} format={(v) => `${v}%`} />
          <Segmented
            legend="Shape"
            value={shape}
            options={[
              { value: 'ellipse', label: 'Oval' },
              { value: 'rect', label: 'Rectangle' },
            ]}
            onChange={setShape}
          />
          <Checkbox label="Show the effect in the preview" checked={showEffect} onChange={setShowEffect} />
          <h2 style={{ marginTop: '1rem' }}>Detection</h2>
          <Segmented
            legend="Model"
            value={range}
            options={[
              { value: 'full', label: 'Groups and distant faces' },
              { value: 'short', label: 'Close-ups and selfies' },
            ]}
            onChange={setRange}
          />
          <Slider label="Minimum confidence" value={minScore} min={0.1} max={0.95} step={0.05} onChange={setMinScore} format={(v) => `${Math.round(v * 100)}%`} hint="Lower finds more faces and more false alarms." />
          <Slider label="Padding around faces" value={padding} min={0} max={1} step={0.05} onChange={setPadding} format={(v) => `${Math.round(v * 100)}%`} />
          <button type="button" className="btn small" onClick={redetect} disabled={batch.items.length === 0 || detecting}>
            Detect faces again
          </button>
          <p className="hint">Detecting again replaces any regions you edited. Very small or turned-away faces can be missed; add those by hand.</p>
          <h2 style={{ marginTop: '1rem' }}>Output</h2>
          <Segmented legend="Format" value={format} options={FORMATS} onChange={setFormat} />
          {IMAGE_FORMATS[format].lossy && <Slider label="Quality" value={quality} min={0.1} max={1} step={0.01} onChange={setQuality} format={(v) => `${Math.round(v * 100)}%`} />}
          <Checkbox label="Keep EXIF metadata (JPEG output only)" checked={keepMetadata} onChange={setKeepMetadata} disabled={format !== 'jpeg'} />
        </section>
        <div>
          <Dropzone accept="image/*" onFiles={onFiles} disabled={batch.running} label="Drop photos here or press to choose" />
          {selected && entry && (
            <div className="card">
              <h2>Regions: {selected.file.name}</h2>
              {entry.status === 'detecting' && <p role="status">Looking for faces…</p>}
              {entry.status === 'error' && <p role="alert" style={{ color: 'var(--danger)' }}>{entry.error}</p>}
              {entry.status !== 'error' && (
                <RegionEditor file={selected.file} regions={entry.regions} onChange={(r) => setRegions(selected.file, r)} hide={hide} showEffect={showEffect} />
              )}
            </div>
          )}
          <BatchBar items={batch.items} running={batch.running} onRun={run} onCancel={batch.cancel} onClear={clear} runLabel="Blur faces in" zipName="blurred-faces.zip" disabled={detecting || batch.items.length === 0} />
          <FileList
            items={batch.items}
            onRemove={batch.remove}
            describe={(it) => `${it.result!.count} region${it.result!.count === 1 ? '' : 's'} hidden · ${formatBytes(it.result!.blob.size)}`}
            actions={(it) => {
              const e = entries.get(it.file);
              return (
                <>
                  <span className="small muted" data-testid="face-count">
                    {!e || e.status === 'detecting' ? 'Detecting…' : e.status === 'error' ? 'Detection failed' : `${e.regions.length} found`}
                  </span>
                  <button type="button" className="btn small" aria-pressed={selected?.id === it.id} onClick={() => setSelectedId(it.id)}>
                    {selected?.id === it.id ? 'Editing' : 'Edit regions'}
                  </button>
                </>
              );
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
