import { describe, expect, it } from 'vitest';
import { blockExternalRequests } from './netGuard';

const guard = (hosts: string[], scope: unknown) => blockExternalRequests(hosts, scope as Parameters<typeof blockExternalRequests>[1]);

function fakeScope() {
  const calls: string[] = [];
  class XHR {
    open(_method: string, url: string) {
      calls.push(`xhr ${url}`);
    }
  }
  const scope = {
    location: { origin: 'https://user.github.io', href: 'https://user.github.io/tools/blur/' },
    fetch: (input: unknown) => {
      calls.push(`fetch ${String(input)}`);
      return Promise.resolve('ok');
    },
    XMLHttpRequest: XHR,
    navigator: {
      sendBeacon: (url: string) => {
        calls.push(`beacon ${url}`);
        return true;
      },
    },
  };
  return { scope, calls, XHR };
}

describe('blockExternalRequests', () => {
  it('lets same-origin, relative, blob and data URLs through', async () => {
    const { scope, calls } = fakeScope();
    guard([], scope);
    await scope.fetch('https://user.github.io/tools/x.wasm');
    await scope.fetch('./model.tflite');
    await scope.fetch('blob:https://user.github.io/abc');
    await scope.fetch('data:text/plain;base64,AA==');
    expect(calls).toHaveLength(4);
  });
  it('rejects other hosts for fetch, XHR and sendBeacon', async () => {
    const { scope, calls, XHR } = fakeScope();
    guard([], scope);
    await expect(scope.fetch('https://odml.pa.googleapis.com/v1/log')).rejects.toThrow(/Blocked/);
    expect(() => new XHR().open('POST', 'https://example.com/x')).toThrow(/Blocked/);
    expect(scope.navigator.sendBeacon('https://example.com/b')).toBe(false);
    expect(calls).toEqual([]);
  });
  it('allows listed hosts only', async () => {
    const { scope, calls } = fakeScope();
    guard(['huggingface.co'], scope);
    await scope.fetch('https://huggingface.co/a/b');
    await expect(scope.fetch('https://cdn.example.com/a')).rejects.toThrow();
    expect(calls).toEqual(['fetch https://huggingface.co/a/b']);
  });
  it('treats unparseable input as blocked', async () => {
    const { scope } = fakeScope();
    guard([], scope);
    await expect(scope.fetch('http://')).rejects.toThrow();
  });
});
