import { createRunner, formatBytes, IMAGE_FORMATS, type ImageFormat } from '@tools/image-utils';
import { AppShell, BatchBar, Checkbox, Dropzone, FileList, Segmented, Slider, useBatch } from '@tools/ui';
import { useMemo, useState } from 'react';
import { processGrayscale, type GrayscaleRequest, type GrayscaleResult } from './process';

const runner = createRunner<GrayscaleRequest, GrayscaleResult>(
  () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  processGrayscale,
);

const FORMAT_OPTIONS = (Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((value) => ({ value, label: IMAGE_FORMATS[value].label }));

function Preview({ file, intensity }: { file: File; intensity: number }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  return (
    <div className="card">
      <h2>Preview</h2>
      <p className="muted small">Approximate preview of the first image. The exported file is rendered by the converter itself.</p>
      <img
        src={url}
        alt={`Preview of ${file.name} at ${Math.round(intensity * 100)}% grayscale`}
        style={{ maxWidth: '100%', maxHeight: 360, filter: `grayscale(${intensity})` }}
      />
    </div>
  );
}

export function App() {
  const batch = useBatch<GrayscaleResult>(3);
  const [intensity, setIntensity] = useState(1);
  const [format, setFormat] = useState<ImageFormat>('jpeg');
  const [quality, setQuality] = useState(0.9);
  const [keepMetadata, setKeepMetadata] = useState(false);
  const [useGpu, setUseGpu] = useState(true);

  const run = () =>
    batch.run((file, { signal, report }) =>
      runner.run({ file, intensity, format, quality, keepMetadata, useGpu }, { signal, onProgress: report }),
    );

  return (
    <AppShell
      title="Grayscale Images"
      tagline="Turn photos black and white, fully or just partly."
      howTo={[
        'Drop in one or many images.',
        'Set how strong the effect is (100% is pure black and white) and pick an output format.',
        'Press the convert button, then download single files or everything as a ZIP.',
      ]}
    >
      <div className="grid two">
        <section className="card" aria-label="Options">
          <h2>Options</h2>
          <Slider label="Intensity" value={intensity} min={0} max={1} step={0.01} onChange={setIntensity} format={(v) => `${Math.round(v * 100)}%`} />
          <Segmented legend="Output format" value={format} options={FORMAT_OPTIONS} onChange={setFormat} />
          {IMAGE_FORMATS[format].lossy && (
            <Slider label="Quality" value={quality} min={0.1} max={1} step={0.01} onChange={setQuality} format={(v) => `${Math.round(v * 100)}%`} />
          )}
          <Checkbox label="Keep EXIF metadata (JPEG output only)" checked={keepMetadata} onChange={setKeepMetadata} disabled={format !== 'jpeg'} />
          <Checkbox label="Use the GPU (WebGL) when available" checked={useGpu} onChange={setUseGpu} />
        </section>
        <div>
          <Dropzone accept="image/*" onFiles={batch.addFiles} disabled={batch.running} label="Drop images here or press to choose" />
          {batch.items[0] && <Preview file={batch.items[0].file} intensity={intensity} />}
          <BatchBar
            items={batch.items}
            running={batch.running}
            onRun={run}
            onCancel={batch.cancel}
            onClear={batch.clear}
            runLabel="Convert"
            zipName="grayscale-images.zip"
          />
          <FileList
            items={batch.items}
            onRemove={batch.remove}
            describe={(it) => (
              <>
                {it.result!.width}×{it.result!.height} · {formatBytes(it.result!.blob.size)} · {it.result!.engine === 'webgl' ? 'GPU' : 'Canvas 2D'}
              </>
            )}
          />
        </div>
      </div>
    </AppShell>
  );
}
