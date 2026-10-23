import {
  createCanvas,
  decodeImage,
  encodeCanvas,
  get2d,
  IMAGE_FORMATS,
  outputName,
  type AnyCanvas,
  type HostContext,
  type ImageFormat,
} from '@tools/image-utils';
import { FRAGMENT_SHADER, grayscalePixels, VERTEX_SHADER } from './grayscale';

export interface GrayscaleRequest {
  file: File;
  intensity: number;
  format: ImageFormat;
  quality: number;
  keepMetadata: boolean;
  useGpu: boolean;
}

export interface GrayscaleResult {
  blob: Blob;
  name: string;
  width: number;
  height: number;
  engine: 'webgl' | 'canvas';
}

interface GlRender {
  canvas: OffscreenCanvas;
  release(): void;
}

function renderWebGL(bitmap: ImageBitmap, intensity: number): GlRender | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true });
  if (!gl || Math.max(bitmap.width, bitmap.height) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) return null;

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'pos');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program, 'img'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'intensity'), intensity);

  gl.viewport(0, 0, bitmap.width, bitmap.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const release = () => gl.getExtension('WEBGL_lose_context')?.loseContext();
  if (gl.getError() !== gl.NO_ERROR) {
    release();
    return null;
  }
  return { canvas, release };
}

function renderCanvas2D(bitmap: ImageBitmap, intensity: number): AnyCanvas {
  const canvas = createCanvas(bitmap.width, bitmap.height);
  const ctx = get2d(canvas, { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  grayscalePixels(image.data, intensity);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export async function processGrayscale(req: GrayscaleRequest, ctx: HostContext): Promise<GrayscaleResult> {
  const bitmap = await decodeImage(req.file);
  try {
    ctx.progress(0.25);
    let engine: GrayscaleResult['engine'] = 'webgl';
    const gl = req.useGpu ? renderWebGL(bitmap, req.intensity) : null;
    if (!gl) engine = 'canvas';
    const canvas: AnyCanvas = gl ? gl.canvas : renderCanvas2D(bitmap, req.intensity);
    ctx.progress(0.6);
    let blob: Blob;
    try {
      blob = await encodeCanvas(canvas, {
        format: req.format,
        quality: req.quality,
        keepMetadataFrom: req.keepMetadata ? req.file : null,
      });
    } finally {
      gl?.release();
    }
    return {
      blob,
      name: outputName(req.file.name, IMAGE_FORMATS[req.format].ext, '-gray'),
      width: bitmap.width,
      height: bitmap.height,
      engine,
    };
  } finally {
    bitmap.close();
  }
}
