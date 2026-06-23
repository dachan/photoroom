# Photoroom — Browser RAW Developer

A Lightroom-style, **non-destructive RAW developer that runs entirely in the browser**.
Open a local folder, decode RAW files, apply tone / white-balance / color / lens
corrections on the GPU, and export full-resolution JPEGs — no uploads, no server.

## Status: working MVP / proof-of-concept

This proves the full pipeline end-to-end. Primary RAW target is **Sony ARW**
(other formats — CR2/CR3/NEF/DNG/RAF/RW2 — are wired up but less tested).

## Requirements

- **A Chromium browser** (Chrome, Edge, Arc). The app uses the File System Access
  API (`showDirectoryPicker`), which Firefox and Safari do not support.
- A desktop GPU (uses WebGL2 with float render targets).

## Run

```bash
npm install      # also copies the wasm runtimes into public/ (postinstall)
npm run dev      # http://localhost:3000
```

Then:

1. **Open Folder** → pick a directory containing RAW files. Grant read/write access.
2. Select an image from the filmstrip → it decodes and previews.
3. Adjust **Exposure / Contrast / Temperature / Tint / Saturation / Vibrance**.
   Toggle **Lens Correction** (auto-filled from a matched lens profile when found,
   or tune distortion/vignette manually).
4. **Export JPEG (Q100)** → writes into an `exports/` subfolder of your directory.
5. Reload the page → the filmstrip and your edits are restored from IndexedDB;
   click **Reopen** to re-link the folder for further editing.

## How it works

| Concern | Implementation |
| --- | --- |
| Local files | File System Access API — `src/lib/fs/` |
| RAW decode | LibRaw → WebAssembly (`libraw-wasm`) in a worker — `src/lib/decode/` |
| Develop pipeline | WebGL2 shader passes on 16-bit float — `src/lib/pipeline/` |
| Lens correction | Brown distortion + vignette shader; profile lookup in `src/lib/lens/` |
| JPEG export | mozjpeg (jSquash) wasm, canvas fallback — `src/lib/export/` |
| Catalog & edits | IndexedDB via `idb` — `src/lib/db/` |
| State | Zustand store — `src/state/` |

### Cross-origin isolation

`libraw-wasm` uses `SharedArrayBuffer`, so every route is served with
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` (see `next.config.ts`). The libraw and
mozjpeg runtimes are served from `public/` and loaded outside the bundler
(`scripts/copy-libraw.mjs` keeps them in sync with the installed packages).

### Future / not yet done

- Swap the WebGL2 backend for WebGPU (isolated behind `src/lib/pipeline/renderer.ts`).
- Full Lensfun database instead of the bundled sample profiles.
- Local adjustments (masks/brushes), better demosaic, denoise.
- On-disk XMP sidecars; Firefox/Safari drag-drop fallback.

Out of scope: Adobe color science / AI denoise, Photoshop layers & clone/heal.
