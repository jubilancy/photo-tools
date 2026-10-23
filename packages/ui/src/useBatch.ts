import { isAbort } from '@tools/image-utils';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ItemStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

/** What a processor must return so the item can be downloaded and zipped. */
export interface BatchOutput {
  blob: Blob;
  name: string;
}

export interface BatchItem<R extends BatchOutput> {
  id: number;
  file: File;
  status: ItemStatus;
  progress: number;
  error?: string;
  result?: R;
}

export interface ProcessContext {
  signal: AbortSignal;
  report: (fraction: number) => void;
}

let nextId = 1;

/**
 * File queue with per-file status. A failing file never stops the others;
 * `cancel()` aborts in-flight work and marks the unfinished files as cancelled.
 */
export function useBatch<R extends BatchOutput>(concurrency = 3) {
  const [items, setItemsState] = useState<BatchItem<R>[]>([]);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  // Mirror of state so `run` can read the current list synchronously.
  const latest = useRef<BatchItem<R>[]>([]);
  const setItems = useCallback((update: (list: BatchItem<R>[]) => BatchItem<R>[]) => {
    latest.current = update(latest.current);
    setItemsState(latest.current);
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  const patch = useCallback((id: number, change: Partial<BatchItem<R>>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...change } : it)));
  }, [setItems]);

  const addFiles = useCallback((files: File[]) => {
    setItems((list) => [...list, ...files.map((file): BatchItem<R> => ({ id: nextId++, file, status: 'queued', progress: 0 }))]);
  }, [setItems]);

  const remove = useCallback((id: number) => setItems((list) => list.filter((it) => it.id !== id)), [setItems]);

  const clear = useCallback(() => {
    abort.current?.abort();
    setItems(() => []);
  }, [setItems]);

  const cancel = useCallback(() => abort.current?.abort(), []);

  /** Processes every non-running file (re-running finished ones with the current options). */
  const run = useCallback(
    async (process: (file: File, ctx: ProcessContext) => Promise<R>, only?: readonly number[]) => {
      const controller = new AbortController();
      abort.current = controller;
      setRunning(true);
      const targets = latest.current.filter((it) => !only || only.includes(it.id));
      const ids = new Set(targets.map((t) => t.id));
      setItems((list) => list.map((it) => (ids.has(it.id) ? { ...it, status: 'queued', progress: 0, error: undefined, result: undefined } : it)));
      const queue = [...targets];
      const worker = async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          if (controller.signal.aborted) {
            patch(item.id, { status: 'cancelled' });
            continue;
          }
          patch(item.id, { status: 'running', progress: 0 });
          try {
            const result = await process(item.file, {
              signal: controller.signal,
              report: (progress) => patch(item.id, { progress }),
            });
            patch(item.id, { status: 'done', progress: 1, result });
          } catch (err) {
            if (isAbort(err) || controller.signal.aborted) patch(item.id, { status: 'cancelled' });
            else patch(item.id, { status: 'error', error: err instanceof Error ? err.message : String(err) });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
      setRunning(false);
    },
    [concurrency, patch, setItems],
  );

  return { items, running, addFiles, remove, clear, cancel, run };
}
