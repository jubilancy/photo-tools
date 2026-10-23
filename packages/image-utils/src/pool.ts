import type { Handler, HostContext } from './workerHost';
import { Reply } from './workerHost';

export interface RunOptions {
  transfer?: Transferable[];
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export interface Runner<Req, Res> {
  run(req: Req, opts?: RunOptions): Promise<Res>;
  terminate(): void;
}

function abortError(): DOMException {
  return new DOMException('Cancelled', 'AbortError');
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

interface Task<Res> {
  id: number;
  req: unknown;
  opts: RunOptions;
  resolve(v: Res): void;
  reject(e: unknown): void;
  worker?: Worker;
}

/** A small pool of module workers. Aborting a running task terminates its worker; a fresh one is spawned on demand. */
export class WorkerPool<Req, Res> implements Runner<Req, Res> {
  private idle: Worker[] = [];
  private busy = new Map<Worker, Task<Res>>();
  private queue: Task<Res>[] = [];
  private nextId = 1;

  constructor(
    private create: () => Worker,
    private size: number,
  ) {}

  run(req: Req, opts: RunOptions = {}): Promise<Res> {
    if (opts.signal?.aborted) return Promise.reject(abortError());
    return new Promise<Res>((resolve, reject) => {
      const task: Task<Res> = { id: this.nextId++, req, opts, resolve, reject };
      opts.signal?.addEventListener('abort', () => this.abort(task), { once: true });
      this.queue.push(task);
      this.pump();
    });
  }

  terminate(): void {
    for (const w of [...this.idle, ...this.busy.keys()]) w.terminate();
    for (const t of [...this.busy.values(), ...this.queue]) t.reject(abortError());
    this.idle = [];
    this.busy.clear();
    this.queue = [];
  }

  private abort(task: Task<Res>): void {
    const qi = this.queue.indexOf(task);
    if (qi >= 0) this.queue.splice(qi, 1);
    else if (task.worker && this.busy.get(task.worker) === task) {
      task.worker.terminate();
      this.busy.delete(task.worker);
    } else return;
    task.reject(abortError());
    this.pump();
  }

  private pump(): void {
    while (this.queue.length > 0) {
      let worker = this.idle.pop();
      if (!worker) {
        if (this.idle.length + this.busy.size >= this.size) return;
        worker = this.create();
      }
      this.start(worker, this.queue.shift()!);
    }
  }

  private start(worker: Worker, task: Task<Res>): void {
    task.worker = worker;
    this.busy.set(worker, task);
    const finish = (): void => {
      worker.onmessage = null;
      worker.onerror = null;
      this.busy.delete(worker);
    };
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { id: number; type: string; fraction?: number; value?: Res; message?: string };
      if (m.id !== task.id) return;
      if (m.type === 'progress') task.opts.onProgress?.(m.fraction ?? 0);
      else if (m.type === 'result') {
        finish();
        this.idle.push(worker);
        task.resolve(m.value as Res);
        this.pump();
      } else {
        finish();
        this.idle.push(worker);
        task.reject(new Error(m.message ?? 'Worker failed'));
        this.pump();
      }
    };
    worker.onerror = (e) => {
      finish();
      worker.terminate();
      task.reject(new Error(e.message || 'Worker crashed'));
      this.pump();
    };
    worker.postMessage({ id: task.id, payload: task.req }, task.opts.transfer ?? []);
  }
}

/** Runs the handler on the calling thread. Used when workers or OffscreenCanvas are unavailable. */
class InlineRunner<Req, Res> implements Runner<Req, Res> {
  constructor(private handler: Handler<Req, Res>) {}
  async run(req: Req, opts: RunOptions = {}): Promise<Res> {
    if (opts.signal?.aborted) throw abortError();
    const ctx: HostContext = { progress: (f) => opts.onProgress?.(f) };
    const out = await this.handler(req, ctx);
    if (opts.signal?.aborted) throw abortError();
    return out instanceof Reply ? out.value : out;
  }
  terminate(): void {}
}

export function workersSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

/**
 * Picks a worker pool when the browser can do the job off the main thread, otherwise runs `fallback` inline.
 * `create` must contain a literal `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` so the bundler can see it.
 */
export function createRunner<Req, Res>(create: () => Worker, fallback: Handler<Req, Res>, size = defaultConcurrency()): Runner<Req, Res> {
  return workersSupported() ? new WorkerPool<Req, Res>(create, size) : new InlineRunner(fallback);
}

export function defaultConcurrency(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(4, cores - 1));
}
