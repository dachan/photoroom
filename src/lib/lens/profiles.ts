// Minimal lens-profile lookup. This is an illustrative subset to be replaced by
// the full Lensfun database (see plan: deferred). The correction math in the GPU
// pipeline is real; only the coefficient source is a stub here. When no profile
// matches, the UI falls back to manual distortion/vignette sliders.

import type { ImageMeta } from "@/lib/types";

export interface LensProfile {
  /** Case-insensitive substring matched against the camera model. */
  cameraMatch?: string;
  /** Case-insensitive substring matched against the lens name. */
  lensMatch: string;
  /** Radial distortion (Brown model) coefficients. */
  k1: number;
  k2: number;
  /** Vignette correction strength, 0..1. */
  vignette: number;
}

// A few representative Sony E-mount entries. Coefficients are approximate.
const PROFILES: LensProfile[] = [
  { lensMatch: "FE 28-70", k1: -0.12, k2: 0.03, vignette: 0.35 },
  { lensMatch: "FE 24-70", k1: -0.1, k2: 0.025, vignette: 0.3 },
  { lensMatch: "FE 35mm", k1: -0.06, k2: 0.01, vignette: 0.25 },
  { lensMatch: "FE 50mm", k1: -0.02, k2: 0.005, vignette: 0.2 },
  { lensMatch: "E 16-50", k1: -0.18, k2: 0.05, vignette: 0.4 },
];

export function matchLensProfile(meta: ImageMeta): LensProfile | null {
  const lens = meta.lens?.toLowerCase() ?? "";
  const model = meta.model?.toLowerCase() ?? "";
  if (!lens) return null;
  for (const p of PROFILES) {
    if (p.cameraMatch && !model.includes(p.cameraMatch.toLowerCase())) continue;
    if (lens.includes(p.lensMatch.toLowerCase())) return p;
  }
  return null;
}
