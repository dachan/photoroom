<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Photoroom — agent notes

- Browser-only RAW developer (Chromium + File System Access API). No backend/API routes in the core flow.
- Primary RAW target: Sony ARW; other formats wired but less tested.
- Pipeline: LibRaw wasm decode → WebGL2 float develop → mozjpeg export. State in Zustand; catalog/edits in IndexedDB (`idb`).
- `libraw-wasm` needs SharedArrayBuffer: `next.config.ts` sets COOP/COEP. Wasm runtimes live under `public/` via `scripts/copy-libraw.mjs` (postinstall/predev/prebuild).
- Key dirs: `src/lib/fs/`, `decode/`, `pipeline/`, `lens/`, `export/`, `db/`, `src/state/`.
- Do not remove cross-origin isolation headers; do not move wasm loading into the bundler without verifying SAB still works.
- Verify in Chromium. Prefer extending existing pipeline modules over new frameworks.
