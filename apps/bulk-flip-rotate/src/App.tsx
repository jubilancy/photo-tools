import { createRunner, formatBytes, IMAGE_FORMATS, type ImageFormat } from '@tools/image-utils';
import { AppShell, BatchBar, Checkbox, ColorField, Dropzone, FileList, NumberField, Segmented, Slider, useBatch } from '@tools/ui';
import { useMemo, useState } from 'react';
import { processFlipRotate, type FlipRotateRequest, type FlipRotateResult } from './process';

const runner = createRunner<FlipRotateRequest, FlipRotateResult>(
  () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  processFlipRotate,
);

type Turn = '0' | '90' | '180' | '270' | 'custom';
type FormatChoice = 'same' | ImageFormat;

const FORMATS: { value: FormatChoice; label: string }[] = [
  { value: 'same', label: 'Same as input' },
  ...(Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((value) => ({ value, label: IMAGE_FORMATS[value].label })),
];

function Preview({ file, angle, flipH, flipV }: { file: File; angle: number; flipH: boolean; flipV: boolean }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  return (
    <div className="card">
      <h2>Preview</h2>
      <p className="muted small">First image, approximate. Rotated corners may be clipped here but are kept in the export when “expand” is on.</p>
      <div style={{ height: 320, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        <img
          src={url}
          alt={`${file.name} preview`}
          style={{ maxWidth: '60%', maxHeight: 220, transform: `rotate(${angle}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})` }}
        />
      </div>
    </div>
  );
}

export function App() {
  const batch = useBatch<FlipRotateResult>(3);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [turn, setTurn] = useState<Turn>('90');
  const [custom, setCustom] = useState(15);
  const [expand, setExpand] = useState(true);
  const [transparent, setTransparent] = useState(true);
  const [fill, setFill] = useState('#ffffff');
  const [format, setFormat] = useState<FormatChoice>('same');
  const [quality, setQuality] = useState(0.92);
  const [keepMetadata, setKeepMetadata] = useState(false);

  const angle = turn === 'custom' ? (Number.isFinite(custom) ? custom : 0) : Number(turn);
  const rightAngle = angle % 90 === 0;
  const lossy = format === 'same' || IMAGE_FORMATS[format].lossy;
  const nothing = !flipH && !flipV && angle % 360 === 0;

  const run = () =>
    batch.run((file, { signal, report }) =>
      runner.run(
        {
          file,
          transform: { flipH, flipV, angle, expand },
          format: format === 'same' ? null : format,
          quality,
          keepMetadata,
          fill: rightAngle || transparent ? null : fill,
        },
        { signal, onProgress: report },
      ),
    );

  return (
    <AppShell
      title="Bulk Flip & Rotate"
      tagline="Mirror or turn a whole batch of images in one go."
      howTo={[
        'Drop in your images.',
        'Choose a flip, a quarter turn or a custom angle. Flips are applied first, then the rotation.',
        'Press the apply button, then download single files or a ZIP.',
      ]}
    >
      <div className="grid two">
        <section className="card" aria-label="Options">
          <h2>Transform</h2>
          <Checkbox label="Flip horizontally (mirror left–right)" checked={flipH} onChange={setFlipH} />
          <Checkbox label="Flip vertically (mirror top–bottom)" checked={flipV} onChange={setFlipV} />
          <Segmented
            legend="Rotate clockwise"
            value={turn}
            options={[
              { value: '0', label: 'None' },
              { value: '90', label: '90°' },
              { value: '180', label: '180°' },
              { value: '270', label: '270°' },
              { value: 'custom', label: 'Custom' },
            ]}
            onChange={setTurn}
          />
          {turn === 'custom' && (
            <>
              <Slider label="Angle" value={Number.isFinite(custom) ? custom : 0} min={-180} max={180} step={0.5} onChange={setCustom} format={(v) => `${v}°`} />
              <NumberField label="Exact angle (degrees)" value={custom} min={-360} max={360} step={0.1} onChange={setCustom} />
            </>
          )}
          {!rightAngle && (
            <>
              <Checkbox label="Expand canvas to keep the corners" checked={expand} onChange={setExpand} />
              <Checkbox label="Transparent background" checked={transparent} onChange={setTransparent} />
              {!transparent && <ColorField label="Background colour" value={fill} onChange={setFill} />}
              <p className="hint">JPEG cannot be transparent, so empty corners are white unless you pick a colour.</p>
            </>
          )}
          <h2 style={{ marginTop: '1rem' }}>Output</h2>
          <Segmented legend="Format" value={format} options={FORMATS} onChange={setFormat} />
          {lossy && <Slider label="Quality" value={quality} min={0.1} max={1} step={0.01} onChange={setQuality} format={(v) => `${Math.round(v * 100)}%`} />}
          <Checkbox label="Keep EXIF metadata (JPEG output only)" checked={keepMetadata} onChange={setKeepMetadata} disabled={format !== 'same' && format !== 'jpeg'} />
        </section>
        <div>
          <Dropzone accept="image/*" onFiles={batch.addFiles} disabled={batch.running} label="Drop images here or press to choose" />
          {batch.items[0] && <Preview file={batch.items[0].file} angle={angle} flipH={flipH} flipV={flipV} />}
          <BatchBar
            items={batch.items}
            running={batch.running}
            onRun={run}
            onCancel={batch.cancel}
            onClear={batch.clear}
            runLabel="Apply to"
            zipName="flipped-rotated-images.zip"
            disabled={nothing}
          />
          {nothing && batch.items.length > 0 && <p className="small muted">Choose a flip or a rotation to continue.</p>}
          <FileList items={batch.items} onRemove={batch.remove} describe={(it) => `${it.result!.width}×${it.result!.height} · ${formatBytes(it.result!.blob.size)}`} />
        </div>
      </div>
    </AppShell>
  );
}
