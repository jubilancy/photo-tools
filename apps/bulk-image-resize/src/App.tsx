import { createRunner, formatBytes, IMAGE_FORMATS, type ImageFormat } from '@tools/image-utils';
import { AppShell, BatchBar, Checkbox, ColorField, Dropzone, FileList, NumberField, Segmented, Select, Slider, useBatch } from '@tools/ui';
import { useState } from 'react';
import { processResize, type ResizeRequest, type ResizeResult } from './process';
import { validateSpec, type Fit, type ResizeMode, type ResizeSpec } from './resize';

const runner = createRunner<ResizeRequest, ResizeResult>(
  () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  processResize,
);

type FormatChoice = 'same' | ImageFormat;
const FORMATS: { value: FormatChoice; label: string }[] = [
  { value: 'same', label: 'Same as input' },
  ...(Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((value) => ({ value, label: IMAGE_FORMATS[value].label })),
];
const FITS: { value: Fit; label: string }[] = [
  { value: 'inside', label: 'Fit inside the box (no cropping)' },
  { value: 'cover', label: 'Fill the box (crop the overflow)' },
  { value: 'pad', label: 'Fit and pad to the exact box size' },
];

export function App() {
  const batch = useBatch<ResizeResult>(3);
  const [mode, setMode] = useState<ResizeMode>('longest');
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(NaN);
  const [percent, setPercent] = useState(50);
  const [longest, setLongest] = useState(1600);
  const [keepAspect, setKeepAspect] = useState(true);
  const [fit, setFit] = useState<Fit>('inside');
  const [noEnlarge, setNoEnlarge] = useState(true);
  const [transparentPad, setTransparentPad] = useState(false);
  const [padColor, setPadColor] = useState('#ffffff');
  const [format, setFormat] = useState<FormatChoice>('same');
  const [quality, setQuality] = useState(0.9);
  const [keepMetadata, setKeepMetadata] = useState(false);

  const spec: ResizeSpec = { mode, width, height, percent, longest, keepAspect, fit, noEnlarge };
  const problem = validateSpec(spec);
  const lossy = format === 'same' || IMAGE_FORMATS[format].lossy;
  const bothGiven = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  const showPad = mode === 'pixels' && keepAspect && bothGiven && fit === 'pad';

  const run = () =>
    batch.run((file, { signal, report }) =>
      runner.run(
        { file, spec, format: format === 'same' ? null : format, quality, keepMetadata, padColor: transparentPad ? null : padColor },
        { signal, onProgress: report },
      ),
    );

  return (
    <AppShell
      title="Bulk Image Resize"
      tagline="Change the size of many pictures at once."
      howTo={[
        'Drop in your images.',
        'Choose how to size them: by longest side, by percentage, or to exact pixels.',
        'Pick the output format and quality, press resize, and download single files or a ZIP.',
      ]}
    >
      <div className="grid two">
        <section className="card" aria-label="Options">
          <h2>Size</h2>
          <Segmented
            legend="Resize by"
            value={mode}
            options={[
              { value: 'longest', label: 'Longest side' },
              { value: 'percent', label: 'Percent' },
              { value: 'pixels', label: 'Width × height' },
            ]}
            onChange={setMode}
          />
          {mode === 'longest' && (
            <>
              <NumberField label="Longest side (px)" value={longest} min={1} step={1} onChange={setLongest} />
              <Checkbox label="Don't enlarge smaller images" checked={noEnlarge} onChange={setNoEnlarge} />
            </>
          )}
          {mode === 'percent' && <Slider label="Scale" value={Number.isFinite(percent) ? percent : 100} min={1} max={400} onChange={setPercent} format={(v) => `${v}%`} />}
          {mode === 'pixels' && (
            <>
              <div className="row">
                <div style={{ flex: 1, minWidth: 120 }}>
                  <NumberField label="Width (px)" value={width} min={1} onChange={setWidth} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <NumberField label="Height (px)" value={height} min={1} onChange={setHeight} hint="Leave empty to follow the aspect ratio." />
                </div>
              </div>
              <Checkbox label="Keep aspect ratio" checked={keepAspect} onChange={setKeepAspect} />
              {keepAspect && bothGiven && <Select label="When both are set" value={fit} options={FITS} onChange={setFit} />}
              {keepAspect && !bothGiven && <Checkbox label="Don't enlarge smaller images" checked={noEnlarge} onChange={setNoEnlarge} />}
              {showPad && (
                <>
                  <Checkbox label="Transparent padding (PNG/WebP only)" checked={transparentPad} onChange={setTransparentPad} />
                  {!transparentPad && <ColorField label="Padding colour" value={padColor} onChange={setPadColor} />}
                </>
              )}
            </>
          )}
          {problem && (
            <p role="alert" className="small" style={{ color: 'var(--danger)' }}>
              {problem}
            </p>
          )}
          <h2 style={{ marginTop: '1rem' }}>Output</h2>
          <Segmented legend="Format" value={format} options={FORMATS} onChange={setFormat} />
          {lossy && <Slider label="Quality" value={quality} min={0.1} max={1} step={0.01} onChange={setQuality} format={(v) => `${Math.round(v * 100)}%`} />}
          <Checkbox label="Keep EXIF metadata (JPEG output only)" checked={keepMetadata} onChange={setKeepMetadata} disabled={format !== 'same' && format !== 'jpeg'} />
        </section>
        <div>
          <Dropzone accept="image/*" onFiles={batch.addFiles} disabled={batch.running} label="Drop images here or press to choose" />
          <BatchBar
            items={batch.items}
            running={batch.running}
            onRun={run}
            onCancel={batch.cancel}
            onClear={batch.clear}
            runLabel="Resize"
            zipName="resized-images.zip"
            disabled={problem !== null}
          />
          <FileList
            items={batch.items}
            onRemove={batch.remove}
            describe={(it) => `${it.result!.fromWidth}×${it.result!.fromHeight} → ${it.result!.width}×${it.result!.height} · ${formatBytes(it.result!.blob.size)}`}
          />
        </div>
      </div>
    </AppShell>
  );
}
