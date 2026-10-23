import { downloadBlob, zipBlobs } from '@tools/image-utils';
import { useState } from 'react';
import { ProgressBar } from './Progress';
import type { BatchItem, BatchOutput } from './useBatch';

export interface BatchBarProps<R extends BatchOutput> {
  items: readonly BatchItem<R>[];
  running: boolean;
  onRun: () => void;
  onCancel: () => void;
  onClear: () => void;
  runLabel?: string;
  zipName?: string;
  /** Disables the run button, e.g. when options are invalid. */
  disabled?: boolean;
}

export function BatchBar<R extends BatchOutput>({ items, running, onRun, onCancel, onClear, runLabel = 'Process', zipName = 'results.zip', disabled }: BatchBarProps<R>) {
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState<string>();
  const done = items.filter((i) => i.status === 'done' && i.result);
  const failed = items.filter((i) => i.status === 'error').length;
  const finished = items.filter((i) => i.status === 'done' || i.status === 'error' || i.status === 'cancelled').length;

  const zip = async () => {
    setZipping(true);
    setZipError(undefined);
    try {
      downloadBlob(await zipBlobs(done.map((i) => i.result!)), zipName);
    } catch (err) {
      setZipError(err instanceof Error ? err.message : String(err));
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="card">
      <div className="row">
        <button type="button" className="btn primary" onClick={onRun} disabled={running || items.length === 0 || disabled}>
          {running ? 'Working…' : `${runLabel} ${items.length || ''} ${items.length === 1 ? 'file' : 'files'}`.replace('  ', ' ')}
        </button>
        {running && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="btn" onClick={zip} disabled={running || zipping || done.length === 0}>
          {zipping ? 'Zipping…' : `Download all as ZIP${done.length ? ` (${done.length})` : ''}`}
        </button>
        <button type="button" className="btn danger" onClick={onClear} disabled={items.length === 0}>
          Clear all
        </button>
      </div>
      {items.length > 0 && (
        <div style={{ marginTop: '.75rem' }} aria-live="polite">
          <ProgressBar value={finished / items.length} label="Batch progress" />
          <p className="small muted" style={{ margin: '.4rem 0 0' }}>
            {finished} of {items.length} finished{failed > 0 ? `, ${failed} failed` : ''}.
          </p>
        </div>
      )}
      {zipError && (
        <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
          {zipError}
        </p>
      )}
    </div>
  );
}
