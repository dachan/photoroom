// Copies the libraw-wasm runtime (ESM glue + worker + wasm) into public/libraw
// so the browser can load it natively via import.meta.url resolution, bypassing
// the Next.js bundler (which mishandles its nested worker/wasm asset graph).
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const librawSrc = join(root, "node_modules", "libraw-wasm", "dist");
const librawDest = join(root, "public", "libraw");
const librawFiles = ["index.js", "worker.js", "libraw.js", "libraw.wasm"];

await mkdir(librawDest, { recursive: true });
await Promise.all(
  librawFiles.map((f) => copyFile(join(librawSrc, f), join(librawDest, f))),
);

// mozjpeg encoder wasm, loaded as a precompiled module (bundler-safe).
const mozjpegSrc = join(root, "node_modules", "@jsquash", "jpeg", "codec", "enc");
const mozjpegDest = join(root, "public", "mozjpeg");
await mkdir(mozjpegDest, { recursive: true });
await copyFile(
  join(mozjpegSrc, "mozjpeg_enc.wasm"),
  join(mozjpegDest, "mozjpeg_enc.wasm"),
);

console.log("Copied libraw-wasm + mozjpeg runtime files into public/");
