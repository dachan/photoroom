// Pure helpers mapping EditParams -> shader uniforms. Backend-agnostic so a
// future WebGPU renderer can reuse them.

import type { EditParams } from "@/lib/types";

/** Convert temperature/tint sliders (-100..100) to linear per-channel gains. */
export function whiteBalanceGain(
  temperature: number,
  tint: number,
): [number, number, number] {
  const t = temperature / 100;
  const g = tint / 100;
  const r = 1 + 0.4 * t;
  const b = 1 - 0.4 * t;
  // Positive tint shifts toward magenta (reduce green).
  const green = 1 - 0.3 * g;
  return [r, green, b];
}

export interface DevelopUniforms {
  exposure: number;
  contrast: number;
  wbGain: [number, number, number];
  saturation: number;
  vibrance: number;
  lensEnabled: boolean;
  k1: number;
  k2: number;
  vignette: number;
}

export function toDevelopUniforms(p: EditParams): DevelopUniforms {
  return {
    exposure: p.exposure,
    contrast: p.contrast / 100,
    wbGain: whiteBalanceGain(p.temperature, p.tint),
    saturation: p.saturation / 100,
    vibrance: p.vibrance / 100,
    lensEnabled: p.lens.enabled,
    k1: p.lens.k1,
    k2: p.lens.k2,
    vignette: p.lens.vignette,
  };
}

/** Fit (w,h) within a max long-edge while preserving aspect ratio. */
export function fitWithin(
  w: number,
  h: number,
  maxLongEdge: number,
): { width: number; height: number } {
  const long = Math.max(w, h);
  if (long <= maxLongEdge) return { width: w, height: h };
  const scale = maxLongEdge / long;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}
