import { createRunner, formatBytes, IMAGE_FORMATS, type ImageFormat } from '@tools/image-utils';
import { AppShell, BatchBar, Checkbox, Dropzone, FileList, NumberField, Segmented, Select, Slider, TextField, useBatch } from '@tools/ui';
import { useState } from 'react';
import { CropEditor } from './CropEditor';
import { defaultAspectBox, defaultFreeBox, parseRatio, PRESETS, type CropBoxes, type CropMode } from './cropMath';
import { processCrop, type CropRequest, type CropResult } from './process';

const runner = createRunner<CropRequest, CropResult>(
  () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  processCrop,
);

type FormatChoice = 'same' | ImageFormat;
const FORMATS: { value: FormatChoice; label: string }[] = [
  { value: 'same', label: 'Same as input' },
  ...(Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((value) => ({ value, label: IMAGE_FORMATS[value].label })),
];
const SHAPES = [
  ...PRESETS.map((p) => ({ value: p.id, label: p.label })),
  { value: 'custom', label: 'Custom ratio…' },
  { value: 'exact', label: 'Exact size in pixels…' },
];

const fresh = (): CropBoxes => ({ aspect: defaultAspectBox(), free: defaultFreeBox() });

export function App() {
  const batch = useBatch<CropResult>(3);
  const [shape, setShape] = useState('1:1');
  const [customText, setCustomText] = useState('7:5');
  const [exactW, setExactW] = useState(800);
  const [exactH, setExactH] = useState(600);
  const [portraitFlip, setPortraitFlip] = useState(false);
  const [applyAll, setApplyAll] = useState(true);
  const [shared, setShared] = useState<CropBoxes>(fresh);
  const [perImage, setPerImage] = useState<Record<number, CropBoxes>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [format, setFormat] = useState<FormatChoice>('same');
  const [quality, setQuality] = useState(0.92);
  const [keepMetadata, setKeepMetadata] = useState(false);

  const customRatio = parseRatio(customText);
  let problem: string | null = null;
  let mode: CropMode = { kind: 'free' };
  if (shape === 'custom') {
    if (customRatio === null) problem = 'Enter a ratio like 16:9 or 1.5.';
    else mode = { kind: 'ratio', ratio: portraitFlip ? 1 / customRatio : customRatio };
  } else if (shape === 'exact') {
    if (!(exactW >= 1 && exactH >= 1 && exactW <= 16384 && exactH <= 16384)) problem = 'Enter a width and height between 1 and 16384 px.';
    else mode = portraitFlip ? { kind: 'exact', width: exactH, height: exactW } : { kind: 'exact', width: exactW, height: exactH };
  } else {
    const preset = PRESETS.find((p) => p.id === shape);
    if (preset?.ratio) mode = { kind: 'ratio', ratio: portraitFlip ? 1 / preset.ratio : preset.ratio };
  }

  const selected = batch.items.find((i) => i.id === selectedId) ?? batch.items[0];
  const boxesFor = (id: number): CropBoxes => (applyAll ? shared : (perImage[id] ?? shared));

  const edit = (boxes: CropBoxes) => {
    if (!selected) return;
    if (applyAll) setShared(boxes);
    else setPerImage((m) => ({ ...m, [selected.id]: boxes }));
  };

  const run = () => {
    const byFile = new Map(batch.items.map((i) => [i.file, boxesFor(i.id)]));
    return batch.run((file, { signal, report }) =>
      runner.run({ file, mode, boxes: byFile.get(file) ?? shared, format: format === 'same' ? null : format, quality, keepMetadata }, { signal, onProgress: report }),
    );
  };

  return (
    <AppShell
      title="Bulk Image Crop"
      tagline="Crop a whole batch to the same shape or exact size."
      howTo={[
        'Drop in your images and choose a shape: an aspect ratio, a free crop, or an exact size in pixels.',
        'Drag the crop box (or use the arrow keys, + and −) over the picture. By default the same crop is applied to every image; switch to “adjust each image” to set them one by one.',
        'Press crop, then download single files or a ZIP.',
      ]}
    >
      <div className="grid two">
        <section className="card" aria-label="Options">
          <h2>Shape</h2>
          <Select label="Aspect ratio" value={shape} options={SHAPES} onChange={setShape} />
          {shape === 'custom' && <TextField label="Ratio (width:height)" value={customText} onChange={setCustomText} />}
          {shape === 'exact' && (
            <div className="row">
              <div style={{ flex: 1, minWidth: 110 }}>
                <NumberField label="Width (px)" value={exactW} min={1} onChange={setExactW} />
              </div>
              <div style={{ flex: 1, minWidth: 110 }}>
                <NumberField label="Height (px)" value={exactH} min={1} onChange={setExactH} />
              </div>
            </div>
          )}
          {shape !== 'free' && shape !== '1:1' && <Checkbox label="Swap landscape / portrait" checked={portraitFlip} onChange={setPortraitFlip} />}
          {problem && <p role="alert" className="small" style={{ color: 'var(--danger)' }}>{problem}</p>}
          <Segmented
            legend="Crop position"
            value={applyAll ? 'all' : 'each'}
            options={[
              { value: 'all', label: 'Same crop for all' },
              { value: 'each', label: 'Adjust each image' },
            ]}
            onChange={(v) => setApplyAll(v === 'all')}
          />
          <div className="row">
            <button
              type="button"
              className="btn small"
              onClick={() => (applyAll ? setShared(fresh()) : selected && setPerImage((m) => ({ ...m, [selected.id]: fresh() })))}
              disabled={!selected}
            >
              Reset crop
            </button>
            {!applyAll && (
              <button
                type="button"
                className="btn small"
                disabled={!selected}
                onClick={() => {
                  if (selected) setShared(boxesFor(selected.id));
                  setPerImage({});
                }}
              >
                Use this crop for all
              </button>
            )}
          </div>
          <h2 style={{ marginTop: '1rem' }}>Output</h2>
          <Segmented legend="Format" value={format} options={FORMATS} onChange={setFormat} />
          {(format === 'same' || IMAGE_FORMATS[format].lossy) && <Slider label="Quality" value={quality} min={0.1} max={1} step={0.01} onChange={setQuality} format={(v) => `${Math.round(v * 100)}%`} />}
          <Checkbox label="Keep EXIF metadata (JPEG output only)" checked={keepMetadata} onChange={setKeepMetadata} disabled={format !== 'same' && format !== 'jpeg'} />
        </section>
        <div>
          <Dropzone accept="image/*" onFiles={batch.addFiles} disabled={batch.running} label="Drop images here or press to choose" />
          {selected && (
            <div className="card">
              <h2>Crop: {selected.file.name}</h2>
              <CropEditor file={selected.file} mode={mode} boxes={boxesFor(selected.id)} onChange={edit} />
            </div>
          )}
          <BatchBar items={batch.items} running={batch.running} onRun={run} onCancel={batch.cancel} onClear={batch.clear} runLabel="Crop" zipName="cropped-images.zip" disabled={problem !== null} />
          <FileList
            items={batch.items}
            onRemove={batch.remove}
            describe={(it) => `${it.result!.width}×${it.result!.height} · ${formatBytes(it.result!.blob.size)}`}
            actions={(it) => (
              <button type="button" className="btn small" aria-pressed={selected?.id === it.id} onClick={() => setSelectedId(it.id)}>
                {selected?.id === it.id ? 'Editing' : 'Edit crop'}
              </button>
            )}
          />
        </div>
      </div>
    </AppShell>
  );
}
