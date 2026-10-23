/** Wraps a value to send transferables back with it. */
export class Reply<T> {
  constructor(
    readonly value: T,
    readonly transfer: Transferable[] = [],
  ) {}
}

export interface HostContext {
  progress(fraction: number): void;
}

export type Handler<Req, Res> = (req: Req, ctx: HostContext) => Promise<Res | Reply<Res>>;

interface Scope {
  onmessage: ((e: MessageEvent<{ id: number; payload: unknown }>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

/** Call once at the top level of a worker module. */
export function serveWorker<Req, Res>(handler: Handler<Req, Res>): void {
  const scope = self as unknown as Scope;
  scope.onmessage = async ({ data }) => {
    const { id, payload } = data;
    try {
      const out = await handler(payload as Req, { progress: (fraction) => scope.postMessage({ id, type: 'progress', fraction }) });
      if (out instanceof Reply) scope.postMessage({ id, type: 'result', value: out.value }, out.transfer);
      else scope.postMessage({ id, type: 'result', value: out });
    } catch (err) {
      scope.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}
