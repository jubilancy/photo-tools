import { downloadBlob, formatBytes } from '@tools/image-utils';
import { useCallback, type ReactNode } from 'react';
import { ProgressBar } from './Progress';
import type { BatchItem, BatchOutput } from './useBatch';

const STATUS_LABEL = { queued: 'Waiting', running: 'Working…', done: 'Done', error: 'Failed', cancelled: 'Cancelled' } as const;

function Thumb({ file }: { file: File }) {
  const attach = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return;
      const url = URL.createObjectURL(file);
      img.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [file],
  );
  if (!file.type.startsWith('image/')) return <span className="thumb" aria-hidden="true" />;
  return <img ref={attach} className="thumb" alt="" loading="lazy" decoding="async" />;
}

export interface FileListProps<R extends BatchOutput> {
  items: readonly BatchItem<R>[];
  onRemove: (id: number) => void;
  /** Extra text under the file name once processing has finished. */
  describe?: (item: BatchItem<R>) => ReactNode;
  /** Extra per-file buttons (e.g. "Adjust"). */
  actions?: (item: BatchItem<R>) => ReactNode;
  thumbnails?: boolean;
}

export function FileList<R extends BatchOutput>({ items, onRemove, describe, actions, thumbnails = true }: FileListProps<R>) {
  if (items.length === 0) return null;
  return (
    <ul className="files" aria-label="Files">
      {items.map((it) => (
        <li className="file" key={it.id} data-status={it.status}>
          {thumbnails ? <Thumb file={it.file} /> : <span className="thumb" aria-hidden="true" />}
          <div style={{ minWidth: 0 }}>
            <div className="name" title={it.file.name}>
              {it.file.name}
            </div>
            <div className="meta">
              {formatBytes(it.file.size)} · <span className={it.status === 'done' ? 'ok' : undefined}>{STATUS_LABEL[it.status]}</span>
              {it.status === 'done' && describe ? <> · {describe(it)}</> : null}
            </div>
            {it.status === 'running' && <ProgressBar value={it.progress} label={`Progress for ${it.file.name}`} />}
            {it.status === 'error' && (
              <div className="err" role="alert">
                {it.error}
              </div>
            )}
          </div>
          <div className="actions">
            {actions?.(it)}
            {it.status === 'done' && it.result && (
              <button type="button" className="btn small" onClick={() => downloadBlob(it.result!.blob, it.result!.name)}>
                Download
              </button>
            )}
            <button type="button" className="btn small" onClick={() => onRemove(it.id)} aria-label={`Remove ${it.file.name}`}>
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
