// Builds the starting edit params for an image:
//   - a saved edit if one exists (normalized for forward-compat),
//   - else embedded in-camera correction enabled automatically if the RAW has it,
//   - else defaults pre-filled from a matched lens profile (correction off).

import { DEFAULT_EDIT, type EditParams, type ImageMeta } from "@/lib/types";
import { matchLensProfile } from "@/lib/lens/profiles";
import type { EditRecord } from "@/lib/db/catalog";

export function buildInitialEdit(meta: ImageMeta, saved?: EditRecord): EditParams {
  if (saved) {
    // Merge over defaults so fields added in newer versions are populated.
    return { ...DEFAULT_EDIT, ...saved.params, lens: { ...DEFAULT_EDIT.lens, ...saved.params.lens } };
  }

  // Embedded (Sony in-camera) or Lensfun match → enable automatic correction.
  if (meta.lensCorrectionSource !== "none") {
    return {
      ...DEFAULT_EDIT,
      lens: { ...DEFAULT_EDIT.lens, enabled: true, useEmbedded: true },
    };
  }

  const profile = matchLensProfile(meta);
  if (!profile) return DEFAULT_EDIT;
  return {
    ...DEFAULT_EDIT,
    lens: {
      enabled: false,
      useEmbedded: false,
      k1: profile.k1,
      k2: profile.k2,
      vignette: profile.vignette,
      fromProfile: true,
    },
  };
}
