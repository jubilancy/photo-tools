/** Rec. 709 luma weights, applied to sRGB values (the same weights as CSS `grayscale()`). */
export const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;

/** Blends each pixel toward its luma by `intensity` (0 = unchanged, 1 = fully gray). Alpha is untouched. */
export function grayscalePixels(data: Uint8ClampedArray, intensity: number): void {
  const t = Math.min(1, Math.max(0, intensity));
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const y = LUMA.r * r + LUMA.g * g + LUMA.b * b;
    data[i] = r + (y - r) * t;
    data[i + 1] = g + (y - g) * t;
    data[i + 2] = b + (y - b) * t;
  }
}

export const VERTEX_SHADER = `#version 300 es
in vec2 pos;
out vec2 uv;
void main() {
  uv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D img;
uniform float intensity;
in vec2 uv;
out vec4 color;
void main() {
  vec4 c = texture(img, vec2(uv.x, 1.0 - uv.y));
  // Bitmaps upload premultiplied; the output context is straight alpha.
  vec3 rgb = c.a > 0.0 ? c.rgb / c.a : c.rgb;
  float y = dot(rgb, vec3(${LUMA.r}, ${LUMA.g}, ${LUMA.b}));
  color = vec4(mix(rgb, vec3(y), intensity), c.a);
}`;
