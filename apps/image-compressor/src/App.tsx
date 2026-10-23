import { createRunner, formatBytes, formatOf, IMAGE_FORMATS, type ImageFormat } from '@tools/image-utils';
import { AppShell, BatchBar, Checkbox, Dropzone, FileList, Segmented, Slider, useBatch } from '@tools/ui';
import { useState } from 'react';
import { processCompress, type CompressRequest, type CompressResult } from './compress';
import { savedPercent, totals } from './savings';

const runner = createRunner<CompressRequest, CompressResult>(
  () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  processCompress,
);

type FormatChoice = 'same' | ImageFormat;
const FORMATS: { value: FormatChoice; label: string }[] = [
  { value: 'same', label: 'Same as input' },
  ...(Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((value) => ({ value, label: IMAGE_FORMATS[value].label })),
];

const signed = (p: number) => (p > 0 ? `−${p}%` : p < 0 ? `+${-p}%` : '0%');

export function App() {
  const batch = useBatch<CompressResult>(2);
  const [format, setFormat] = useState<FormatChoice>('same');
  const [mode, setMode] = useState<'lossy' | 'lossless'>('lossy');
  const [quality, setQuality] = useState(75);
  const [pngLevel, setPngLevel] = useState(3);
  const [engine, setEngine] = useState<'wasm' | 'native'>('wasm');
  const [keepMetadata, setKeepMetadata] = useState(false);

  // "Same as input" resolves per file, so the visible controls follow the formats actually queued.
  const queued = new Set<ImageFormat>(batch.items.map((i) => formatOf(i.file.type)));
  const targets = format === 'same' ? (queued.size ? queued : new Set<ImageFormat>(['jpeg', 'png', 'webp'])) : new Set<ImageFormat>([format]);
  const hasWebp = targets.has('webp');
  const hasJpeg = targets.has('jpeg');
  const hasPng = targets.has('png');
  const showQuality = hasJpeg || (hasWebp && mode === 'lossy');

  const run = () =>
    batch.run((file, { signal, report }) =>
      runner.run({ file, format: format === 'same' ? null : format, mode, quality, pngLevel, engine, keepMetadata }, { signal, onProgress: report }),
    );

  const done = batch.items.flatMap((i) => (i.result ? [i.result] : []));
  const sum = totals(done);

  return (
    <AppShell
      title="Image Compressor"
      tagline="Make JPEG, PNG and WebP files smaller and see exactly how much you saved."
      howTo={[
        'Drop in your images.',
        'Pick the output format and quality. PNG is always compressed losslessly; JPEG and WebP use the quality slider.',
        'Press compress. Each file shows its size before and after; download one by one or as a ZIP.',
      ]}
    >
      <div className="grid two">
        <section className="card" aria-label="Options">
          <h2>Compression</h2>
          <Segmented legend="Output format" value={format} options={FORMATS} onChange={setFormat} />
          {hasWebp && (
            <Segmented
              legend="WebP mode"
              value={mode}
              options={[
                { value: 'lossy', label: 'Lossy' },
                { value: 'lossless', label: 'Lossless' },
              ]}
              onChange={setMode}
            />
          )}
          {showQuality && <Slider label="Quality" value={quality} min={1} max={100} onChange={setQuality} hint="Lower is smaller. 70–80 is usually hard to tell apart from the original." />}
          {hasPng && <Slider label="PNG effort" value={pngLevel} min={1} max={6} onChange={setPngLevel} hint="Higher is slower and a little smaller. PNG is always lossless." />}
          <Segmented
            legend="Encoder"
            value={engine}
            options={[
              { value: 'wasm', label: 'Best compression (WebAssembly)' },
              { value: 'native', label: 'Browser built-in (faster, larger)' },
            ]}
            onChange={setEngine}
          />
          <Checkbox label="Keep EXIF metadata (JPEG to JPEG only)" checked={keepMetadata} onChange={setKeepMetadata} />
          <p className="hint">
            WebAssembly mode uses MozJPEG, OxiPNG and libwebp. If re-encoding would not make a file smaller, the original is kept.
          </p>
        </section>
        <div>
          <Dropzone accept="image/*" onFiles={batch.addFiles} disabled={batch.running} label="Drop images here or press to choose" />
          <BatchBar items={batch.items} running={batch.running} onRun={run} onCancel={batch.cancel} onClear={batch.clear} runLabel="Compress" zipName="compressed-images.zip" />
          {done.length > 0 && (
            <p className="card" role="status">
              <strong>Total:</strong> {formatBytes(sum.original)} → {formatBytes(sum.now)} ({signed(sum.percent)}) across {done.length} file{done.length > 1 ? 's' : ''}.
            </p>
          )}
          <FileList
            items={batch.items}
            onRemove={batch.remove}
            describe={(it) => {
              const r = it.result!;
              return r.keptOriginal
                ? `${formatBytes(r.originalSize)} · already as small as it gets, original kept`
                : `${formatBytes(r.originalSize)} → ${formatBytes(r.newSize)} (${signed(savedPercent(r.originalSize, r.newSize))})`;
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
