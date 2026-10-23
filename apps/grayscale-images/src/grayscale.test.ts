import { describe, expect, it } from 'vitest';
import { grayscalePixels } from './grayscale';

const px = (...v: number[]) => new Uint8ClampedArray(v);

describe('grayscalePixels', () => {
  it('leaves pixels unchanged at intensity 0', () => {
    const d = px(200, 100, 50, 255);
    grayscalePixels(d, 0);
    expect([...d]).toEqual([200, 100, 50, 255]);
  });
  it('makes channels equal at intensity 1 and keeps alpha', () => {
    const d = px(255, 0, 0, 128, 0, 255, 0, 255);
    grayscalePixels(d, 1);
    expect([...d]).toEqual([54, 54, 54, 128, 182, 182, 182, 255]);
  });
  it('blends halfway at 0.5', () => {
    const d = px(255, 0, 0, 255);
    grayscalePixels(d, 0.5);
    expect([...d]).toEqual([155, 27, 27, 255]);
  });
  it('clamps out-of-range intensity', () => {
    const a = px(10, 20, 30, 255);
    const b = px(10, 20, 30, 255);
    grayscalePixels(a, 5);
    grayscalePixels(b, 1);
    expect([...a]).toEqual([...b]);
  });
  it('keeps white and black fixed', () => {
    const d = px(255, 255, 255, 255, 0, 0, 0, 255);
    grayscalePixels(d, 1);
    expect([...d]).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
  });
});
