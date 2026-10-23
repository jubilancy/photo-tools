import { expect, type Download, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SAMPLES = join(import.meta.dirname, '..', '.e2e-samples');
export const sample = (name: string) => join(SAMPLES, name);

export async function bytesOf(download: Download): Promise<Buffer> {
  const path = await download.path();
  return readFileSync(path);
}

export function sniff(buf: Uint8Array): 'jpeg' | 'png' | 'webp' | 'zip' | 'unknown' {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57) return 'webp';
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 'zip';
  return 'unknown';
}

export function unzip(buf: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(buf);
}

export interface Probe {
  width: number;
  height: number;
  /** RGBA at the requested points, given as fractions of width/height. */
  pixels: number[][];
}

/** Decodes image bytes in a scratch page and samples pixels (the browser is the reference decoder). */
export async function probe(page: Page, bytes: Uint8Array, points: [number, number][] = []): Promise<Probe> {
  return page.evaluate(
    async ({ data, pts }) => {
      const bmp = await createImageBitmap(new Blob([new Uint8Array(data)]), { imageOrientation: 'from-image' });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const pixels = pts.map(([fx, fy]) => [...ctx.getImageData(Math.min(bmp.width - 1, Math.floor(fx * bmp.width)), Math.min(bmp.height - 1, Math.floor(fy * bmp.height)), 1, 1).data]);
      return { width: bmp.width, height: bmp.height, pixels };
    },
    { data: [...bytes], pts: points },
  );
}

export interface RequestLog {
  urls: string[];
  bodies: number;
  failed: string[];
}

export async function trackRequests(page: Page): Promise<RequestLog> {
  const log: RequestLog = { urls: [], bodies: 0, failed: [] };
  page.on('response', (res) => {
    if (res.status() >= 400) log.failed.push(`${res.status()} ${res.url()}`);
  });
  page.on('request', (req) => {
    log.urls.push(req.url());
    if (req.postData()) log.bodies++;
  });
  return log;
}

export function expectNoUserDataRequests(log: RequestLog, allowedHosts: string[] = []) {
  expect(log.failed, 'failed requests').toEqual([]);
  const external = log.urls.filter((u) => {
    const url = new URL(u);
    return !['localhost', '127.0.0.1'].includes(url.hostname) && !allowedHosts.includes(url.hostname) && url.protocol.startsWith('http');
  });
  expect(external, 'unexpected external requests').toEqual([]);
  expect(log.bodies, 'requests with bodies').toBe(0);
}
