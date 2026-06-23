// JPEG export. Encodes RGBA8 pixels at quality 100 using mozjpeg (jSquash),
// loaded as a precompiled WebAssembly.Module served from public/. Falls back to
// the browser's built-in canvas encoder if mozjpeg fails to initialize.

import type { ExportResult } from "@/lib/pipeline/renderer";

let mozjpegReady: Promise<boolean> | null = null;

async function initMozjpeg(): Promise<boolean> {
  if (!mozjpegReady) {
    mozjpegReady = (async () => {
      try {
        const { init } = await import("@jsquash/jpeg/encode");
        const res = await fetch("/mozjpeg/mozjpeg_enc.wasm");
        const wasmModule = await WebAssembly.compile(await res.arrayBuffer());
        // init also accepts a precompiled WebAssembly.Module as its first arg
        // (not reflected in the published types).
        await (init as unknown as (m: WebAssembly.Module) => Promise<void>)(wasmModule);
        return true;
      } catch (err) {
        console.warn("mozjpeg unavailable, falling back to canvas encoder:", err);
        return false;
      }
    })();
  }
  return mozjpegReady;
}

async function encodeWithMozjpeg(result: ExportResult): Promise<Blob> {
  const encode = (await import("@jsquash/jpeg/encode")).default;
  const pixels = new Uint8ClampedArray(result.pixels);
  const imageData = {
    data: pixels,
    width: result.width,
    height: result.height,
    colorSpace: "srgb" as const,
  } as ImageData;
  const buffer = await encode(imageData, { quality: 100 });
  return new Blob([buffer], { type: "image/jpeg" });
}

async function encodeWithCanvas(result: ExportResult): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for JPEG fallback");
  const imageData = new ImageData(
    new Uint8ClampedArray(result.pixels),
    result.width,
    result.height,
  );
  ctx.putImageData(imageData, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      1.0,
    );
  });
}

export async function encodeJpeg(result: ExportResult): Promise<Blob> {
  if (await initMozjpeg()) {
    try {
      return await encodeWithMozjpeg(result);
    } catch (err) {
      console.warn("mozjpeg encode failed, using canvas fallback:", err);
    }
  }
  return encodeWithCanvas(result);
}

/** Replace a RAW filename's extension with .jpg. */
export function toJpegFileName(rawName: string): string {
  const dot = rawName.lastIndexOf(".");
  const base = dot === -1 ? rawName : rawName.slice(0, dot);
  return `${base}.jpg`;
}
