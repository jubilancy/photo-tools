interface GuardScope {
  location: { origin: string; href: string };
  fetch?: (input: unknown, init?: unknown) => Promise<unknown>;
  XMLHttpRequest?: { prototype: { open: (...args: unknown[]) => unknown } };
  navigator?: { sendBeacon?: (url: string, data?: unknown) => boolean };
}

/**
 * Defence in depth for tools that promise "no network calls": third-party libraries can ship their own telemetry
 * (MediaPipe posts usage stats to Google after about a minute). This makes `fetch`, XHR and `sendBeacon` refuse
 * any URL outside this site's origin, plus `allowedHosts`. Call it first thing in the page and in every worker.
 */
export function blockExternalRequests(allowedHosts: readonly string[] = [], scope: GuardScope = globalThis as unknown as GuardScope): void {
  const allowed = (input: unknown): boolean => {
    try {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : ((input as { url?: string }).url ?? String(input));
      const url = new URL(raw, scope.location.href);
      return url.origin === scope.location.origin || url.protocol === 'blob:' || url.protocol === 'data:' || allowedHosts.includes(url.hostname);
    } catch {
      return false;
    }
  };
  const refuse = () => new TypeError('Blocked: this tool does not make requests to other sites.');

  const realFetch = scope.fetch;
  if (realFetch) scope.fetch = (input, init) => (allowed(input) ? realFetch.call(scope, input, init) : Promise.reject(refuse()));

  const proto = scope.XMLHttpRequest?.prototype;
  if (proto) {
    const realOpen = proto.open;
    proto.open = function (this: unknown, ...args: unknown[]) {
      if (!allowed(args[1])) throw refuse();
      return realOpen.apply(this, args);
    };
  }

  const nav = scope.navigator;
  if (nav?.sendBeacon) {
    const realBeacon = nav.sendBeacon;
    nav.sendBeacon = (url, data) => allowed(url) && realBeacon.call(nav, url, data);
  }
}
