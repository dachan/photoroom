// RAW decoding via libraw-wasm. The runtime is loaded from /libraw (served from
// public/) using a bundler-escaping dynamic import, because libraw-wasm resolves
// its own worker + wasm relative to import.meta.url and must not be processed by
// the Next.js bundler. See scripts/copy-libraw.mjs.

import type LibRaw from "libraw-wasm";
import type { LibRawSettings, Metadata } from "libraw-wasm";
import type { DecodedImage, ImageMeta } from "@/lib/types";
import { flattenMeta } from "@/lib/util/flattenMeta";
import { parseSonyEmbeddedCorrection } from "@/lib/lens/sonyEmbedded";

type LibRawCtor = new () => LibRaw;

// Escape both webpack and turbopack so the URL is fetched natively at runtime.
const nativeImport = new Function("u", "return import(u)") as (
  u: string,
) => Promise<{ default: LibRawCtor }>;

let ctorPromise: Promise<LibRawCtor> | null = null;

function loadLibRawCtor(): Promise<LibRawCtor> {
  if (!ctorPromise) {
    ctorPromise = nativeImport("/libraw/index.js").then((m) => m.default);
  }
  return ctorPromise;
}

// Decode settings: linear-light 16-bit sRGB-primaries output with the camera's
// white balance and no auto-brightness, so our GPU pipeline controls tone.
const DECODE_SETTINGS: LibRawSettings = {
  outputBps: 16,
  outputColor: 1, // sRGB primaries
  gamm: [1, 1], // linear (no gamma) — we encode sRGB at the end of the GPU pipeline
  useCameraWb: true,
  noAutoBright: true,
  userQual: 3, // AHD demosaic
};

function toImageMeta(m: Metadata | undefined, fallbackW: number, fallbackH: number): ImageMeta {
  return {
    width: m?.width ?? fallbackW,
    height: m?.height ?? fallbackH,
    make: m?.camera_make?.trim() ?? "",
    model: m?.camera_model?.trim() ?? "",
    lens: m?.lens?.Lens?.trim() ?? "",
    focalLength: m?.focal_len ?? 0,
    aperture: m?.aperture ?? 0,
    iso: m?.iso_speed ?? 0,
    shutter: m?.shutter ?? 0,
    flip: m?.flip ?? 0,
    dateTime: m?.timestamp instanceof Date ? m.timestamp.toISOString() : null,
    hasEmbeddedLens: false,
    all: m ? flattenMeta(m as unknown as Record<string, unknown>) : {},
  };
}

export interface RawDecodeResult {
  image: DecodedImage;
  /** Embedded JPEG thumbnail bytes, if LibRaw exposed one. */
  thumbnail: Uint8Array | null;
}

/**
 * Lightweight catalog path: extract metadata and the embedded JPEG thumbnail
 * without running the full demosaic (used to populate the filmstrip cheaply).
 */
export async function decodeMetaAndThumb(
  bytes: ArrayBuffer,
): Promise<{ meta: ImageMeta; thumbnail: Uint8Array | null }> {
  const Ctor = await loadLibRawCtor();
  const decoder = new Ctor();
  try {
    await decoder.open(new Uint8Array(bytes), DECODE_SETTINGS);
    const meta = await decoder.metadata(true);
    let thumbnail: Uint8Array | null = null;
    try {
      const thumb = await decoder.thumbnailData();
      if (thumb && thumb.format === "jpeg") thumbnail = thumb.data;
    } catch {
      // best-effort
    }
    const imageMeta = toImageMeta(meta, meta?.width ?? 0, meta?.height ?? 0);
    imageMeta.hasEmbeddedLens = parseSonyEmbeddedCorrection(bytes) !== null;
    return { meta: imageMeta, thumbnail };
  } finally {
    decoder.dispose();
  }
}

/**
 * Decode a RAW file into linear 16-bit RGB plus metadata and (when available)
 * the embedded JPEG thumbnail.
 */
export async function decodeRaw(bytes: ArrayBuffer): Promise<RawDecodeResult> {
  const Ctor = await loadLibRawCtor();
  const decoder = new Ctor();
  try {
    await decoder.open(new Uint8Array(bytes), DECODE_SETTINGS);
    const meta = await decoder.metadata(true);
    const img = await decoder.imageData();
    if (!img) throw new Error("LibRaw returned no image data");
    if (!(img.data instanceof Uint16Array)) {
      throw new Error(`Expected 16-bit output, got ${img.bits}-bit`);
    }

    let thumbnail: Uint8Array | null = null;
    try {
      const thumb = await decoder.thumbnailData();
      if (thumb && thumb.format === "jpeg") thumbnail = thumb.data;
    } catch {
      // Thumbnail extraction is best-effort.
    }

    const lensCorrection = parseSonyEmbeddedCorrection(bytes);
    const imageMeta = toImageMeta(meta, img.width, img.height);
    imageMeta.hasEmbeddedLens = lensCorrection !== null;

    const image: DecodedImage = {
      width: img.width,
      height: img.height,
      rgb: img.data,
      channels: img.colors,
      meta: imageMeta,
      lensCorrection,
    };
    return { image, thumbnail };
  } finally {
    decoder.dispose();
  }
}
