# photo-tools

Small single-purpose web tools that run entirely in the browser: no uploads, no accounts, no analytics. One pnpm workspace, one app per tool in `apps/<slug>`, published as a single GitHub Pages site with each tool at `/<slug>/`.

## Status

| Tool | Status | Notes |
| --- | --- | --- |
| grayscale-images | done | WebGL2 shader with Canvas 2D fallback |
| bulk-watermark | done | Text or image mark, position grid, tiling, rotation, live preview |
| bulk-flip-rotate | done | Pixel-exact quarter turns; custom angles |
| time-taker | done | Timestamp-based timing, alerts, localStorage |
| bulk-image-resize | done | Pixels, percent, longest side; fit / fill / pad |
| image-compressor | done | MozJPEG, OxiPNG and libwebp (WASM) |
| bulk-image-crop | done | Draggable box, shared or per-image crops, exact size |
| bulk-blur-faces | done | MediaPipe BlazeFace on-device, manual regions |
| bulk-background-remover | in progress | Not deployed yet |
| passport-photo-maker | not started | |
| auto-jump-cutter | not started | |
| query-csv | not started | |

## Develop

```sh
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm site          # build every app into ./site and check for absolute asset paths
pnpm serve         # serve ./site under /photo-tools/ like GitHub Pages does
```

Browser tests (Playwright) need sample files and a browser:

```sh
uv run --with pillow python e2e/make-samples.py
CHROMIUM_PATH=/path/to/chromium pnpm e2e   # CHROMIUM_PATH is optional
```

Vite uses a relative `base`, so a build works at `/<repo>/<slug>/` and on a custom domain alike.

## Libraries and models

| Package | Version | License | Used by |
| --- | --- | --- | --- |
| React / React DOM | 19.3.1 | MIT | all apps |
| Vite | 8.3.5 | MIT | build |
| fflate | 0.8.3 | MIT | ZIP downloads |
| @jsquash/jpeg (MozJPEG) | 1.6.0 | Apache-2.0 | image-compressor |
| @jsquash/oxipng | 2.3.0 | Apache-2.0 | image-compressor |
| @jsquash/webp (libwebp) | 1.5.0 | Apache-2.0 | image-compressor |
| @mediapipe/tasks-vision | 1.1.1 | Apache-2.0 | bulk-blur-faces |
| BlazeFace short- and full-range models | float16 v1 | Apache-2.0 ([model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf)) | bulk-blur-faces (bundled in the site) |

### Image compressor: WebAssembly vs the browser's encoder

Both are available in the UI. On a 1600×1200 photo-like JPEG at quality 75, MozJPEG produced 296 KB and the browser's canvas encoder 452 KB; OxiPNG saved 28% on a noisy PNG with every pixel identical. The WebAssembly encoders are the default for that reason. PNG is lossless only, and JPEG has no lossless mode here.

## External hosts contacted at runtime

None for the tools listed as done. All code, WebAssembly and model files are served from this site. MediaPipe ships a usage-statistics logger that posts to `odml.pa.googleapis.com`; `blockExternalRequests()` in `packages/image-utils` refuses every request outside the site's own origin, and a browser test waits past the logger's 60-second flush to prove nothing is sent.

## Limits worth knowing

- GitHub Pages cannot set COOP/COEP headers, so WebAssembly runs single-threaded.
- Output is limited by the browser's canvas size (about 268 megapixels in Chromium). A 10000×8000 JPEG was processed by every image tool.
- Face detection can miss very small or turned-away faces; add those regions by hand.
- Browser tests that need a face photo download MediaPipe's public sample image and skip themselves when offline.

## Deployment

`.github/workflows/ci.yml` runs on pull requests and branch pushes: locked install, type-check, lint, tests, full build and the absolute-path check. `.github/workflows/deploy.yml` runs on pushes to `main`: the same checks, then publishes `site/` with the official Pages actions (`pages: write`, `id-token: write`, pinned by commit SHA, concurrency group, pnpm cache). In the repository settings, Pages must use **GitHub Actions** as its source.
