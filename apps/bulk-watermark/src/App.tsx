import { createRunner, formatBytes, IMAGE_FORMATS, type ImageFormat } from '@tools/image-utils';
import { AppShell, BatchBar, Checkbox, ColorField, Dropzone, Field, FileList, Segmented, Select, Slider, useBatch } from '@tools/ui';
import { useState } from 'react';
import { DEFAULT_OPTIONS, type FontFamily, type WatermarkOptions } from './draw';
import { PositionGrid } from './PositionGrid';
import { processWatermark, type WatermarkRequest, type WatermarkResult } from './process';
import { Preview } from './Preview';

const runner = createRunner<WatermarkRequest, WatermarkResult>(
  () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  processWatermark,
);

const FORMAT_OPTIONS = (Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((value) => ({ value, label: IMAGE_FORMATS[value].label }));
const FONTS: { value: FontFamily; label: string }[] = [
  { value: 'sans-serif', label: 'Sans-serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Monospace' },
  { value: 'cursive', label: 'Handwriting' },
];
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function App() {
  const batch = useBatch<WatermarkResult>(3);
  const [options, setOptions] = useState<WatermarkOptions>(DEFAULT_OPTIONS);
  const [mark, setMark] = useState<File | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [format, setFormat] = useState<ImageFormat>('jpeg');
  const [quality, setQuality] = useState(0.92);
  const [keepMetadata, setKeepMetadata] = useState(false);

  const set = <K extends keyof WatermarkOptions>(key: K, value: WatermarkOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));
  const previewItem = batch.items.find((i) => i.id === previewId) ?? batch.items[0];
  const missingMark = options.kind === 'image' && !mark;
  const missingText = options.kind === 'text' && options.text.trim() === '';

  const run = () =>
    batch.run((file, { signal, report }) =>
      runner.run({ file, watermark: mark, options, format, quality, keepMetadata }, { signal, onProgress: report }),
    );

  return (
    <AppShell
      title="Bulk Watermark"
      tagline="Stamp text or a logo on a whole folder of pictures."
      howTo={[
        'Drop in your images, then choose a text or image watermark.',
        'Pick a spot on the grid (or tile it across the picture) and tune size, opacity and rotation while watching the preview.',
        'Press the apply button and download single files or a ZIP.',
      ]}
    >
      <div className="grid two">
        <section className="card" aria-label="Watermark options">
          <h2>Watermark</h2>
          <Segmented
            legend="Type"
            value={options.kind}
            options={[
              { value: 'text', label: 'Text' },
              { value: 'image', label: 'Image' },
            ]}
            onChange={(v) => set('kind', v)}
          />
          {options.kind === 'text' ? (
            <>
              <Field label="Text" hint="Use new lines for several lines.">
                {(id) => <textarea id={id} rows={2} value={options.text} onChange={(e) => set('text', e.target.value)} />}
              </Field>
              <Select label="Font" value={options.fontFamily} options={FONTS} onChange={(v) => set('fontFamily', v)} />
              <div className="row">
                <Checkbox label="Bold" checked={options.bold} onChange={(v) => set('bold', v)} />
                <Checkbox label="Italic" checked={options.italic} onChange={(v) => set('italic', v)} />
                <Checkbox label="Shadow" checked={options.shadow} onChange={(v) => set('shadow', v)} />
              </div>
              <ColorField label="Colour" value={options.color} onChange={(v) => set('color', v)} />
            </>
          ) : (
            <Field label="Watermark image" hint={mark ? mark.name : 'PNG with transparency works best.'}>
              {(id) => <input id={id} type="file" accept="image/*" onChange={(e) => setMark(e.target.files?.[0] ?? null)} />}
            </Field>
          )}
          <PositionGrid value={options.anchor} onChange={(a) => set('anchor', a)} disabled={options.tile} />
          <Slider label="Opacity" value={options.opacity} min={0.05} max={1} step={0.01} onChange={(v) => set('opacity', v)} format={pct} />
          <Slider label="Size (of image width)" value={options.sizePct} min={2} max={100} onChange={(v) => set('sizePct', v)} format={(v) => `${v}%`} />
          <Slider label="Rotation" value={options.rotation} min={-180} max={180} onChange={(v) => set('rotation', v)} format={(v) => `${v}°`} />
          {!options.tile && <Slider label="Edge margin" value={options.marginPct} min={0} max={20} step={0.5} onChange={(v) => set('marginPct', v)} format={(v) => `${v}%`} />}
          <Checkbox label="Tile across the whole image" checked={options.tile} onChange={(v) => set('tile', v)} />
          {options.tile && <Slider label="Tile spacing" value={options.tileGapPct} min={0} max={300} step={5} onChange={(v) => set('tileGapPct', v)} format={(v) => `${v}%`} />}
          <h2 style={{ marginTop: '1rem' }}>Output</h2>
          <Segmented legend="Format" value={format} options={FORMAT_OPTIONS} onChange={setFormat} />
          {IMAGE_FORMATS[format].lossy && <Slider label="Quality" value={quality} min={0.1} max={1} step={0.01} onChange={setQuality} format={pct} />}
          <Checkbox label="Keep EXIF metadata (JPEG output only)" checked={keepMetadata} onChange={setKeepMetadata} disabled={format !== 'jpeg'} />
        </section>
        <div>
          <Dropzone accept="image/*" onFiles={batch.addFiles} disabled={batch.running} label="Drop images here or press to choose" />
          {previewItem && <Preview file={previewItem.file} watermark={mark} options={options} />}
          {(missingMark || missingText) && (
            <p role="status" className="small" style={{ color: 'var(--danger)' }}>
              {missingMark ? 'Choose a watermark image to continue.' : 'Enter some watermark text to continue.'}
            </p>
          )}
          <BatchBar
            items={batch.items}
            running={batch.running}
            onRun={run}
            onCancel={batch.cancel}
            onClear={batch.clear}
            runLabel="Apply to"
            zipName="watermarked-images.zip"
            disabled={missingMark || missingText}
          />
          <FileList
            items={batch.items}
            onRemove={batch.remove}
            describe={(it) => `${it.result!.width}×${it.result!.height} · ${formatBytes(it.result!.blob.size)}`}
            actions={(it) => (
              <button type="button" className="btn small" onClick={() => setPreviewId(it.id)} aria-pressed={previewItem?.id === it.id}>
                Preview
              </button>
            )}
          />
        </div>
      </div>
    </AppShell>
  );
}
