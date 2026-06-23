// Shared domain types for the RAW developer.

/** Non-destructive develop settings for a single image. */
export interface EditParams {
  /** Exposure in stops (EV), applied in linear light. */
  exposure: number; // -5..5
  /** Contrast around mid-gray, applied in display space. */
  contrast: number; // -100..100
  /** White-balance warmth shift (negative = cooler/blue, positive = warmer/amber). */
  temperature: number; // -100..100
  /** White-balance green/magenta shift. */
  tint: number; // -100..100
  /** Global saturation. */
  saturation: number; // -100..100
  /** Vibrance: saturation weighted toward less-saturated pixels. */
  vibrance: number; // -100..100
  /** Lens correction settings. */
  lens: LensCorrection;
}

/** Geometric + vignette lens correction parameters. */
export interface LensCorrection {
  enabled: boolean;
  /** When the image carries embedded (in-camera) correction data, use it. */
  useEmbedded: boolean;
  /** Radial distortion coefficients (Brown model, normalized radius). */
  k1: number;
  k2: number;
  /** Vignette correction strength (0 = none, 1 = full inverse falloff). */
  vignette: number;
  /** Whether the current values came from a matched lens profile. */
  fromProfile: boolean;
}

/**
 * Per-knot correction factors decoded from a camera's embedded lens-correction
 * data (e.g. Sony ARW). Arrays are padded to 16; only the first `nc` are used.
 * Knots are spaced evenly from frame center (rn=0) to corner (rn=1).
 */
export interface EmbeddedLensFactors {
  nc: number;
  /** Radial magnification (corrected→distorted) for the green/reference channel. */
  distFactor: Float32Array;
  /** Extra per-channel radial scaling for red and blue (lateral CA). */
  caRFactor: Float32Array;
  caBFactor: Float32Array;
  /** Brightness gain multiplier to undo vignetting. */
  vigGain: Float32Array;
  /** Global scale so the corrected image fills the frame (corner→corner). */
  scale: number;
}

export const DEFAULT_EDIT: EditParams = {
  exposure: 0,
  contrast: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  lens: { enabled: false, useEmbedded: true, k1: 0, k2: 0, vignette: 0, fromProfile: false },
};

/** EXIF/metadata extracted from a RAW, persisted in the catalog. */
export interface ImageMeta {
  width: number;
  height: number;
  make: string;
  model: string;
  lens: string;
  focalLength: number;
  aperture: number;
  iso: number;
  shutter: number;
  /** EXIF orientation flag (LibRaw `flip`, 0..7). */
  flip: number;
  dateTime: string | null;
  /** True if the RAW carries embedded in-camera lens-correction data. */
  hasEmbeddedLens: boolean;
  /** Full LibRaw metadata, flattened to readable key → value strings. */
  all: Record<string, string>;
}

/** A catalog entry: one RAW file the app knows about. */
export interface CatalogImage {
  /** Stable id = relative path within the picked directory. */
  id: string;
  name: string;
  meta: ImageMeta;
  /** Small JPEG preview for the filmstrip, as a blob. */
  thumbnail: Blob | null;
  addedAt: number;
}

/** Decoded RAW pixel data, ready to upload to the GPU. */
export interface DecodedImage {
  width: number;
  height: number;
  /** Linear-light RGB, 16-bit, 3 channels interleaved. */
  rgb: Uint16Array;
  /** Channels per pixel (always 3 after our decode settings). */
  channels: number;
  meta: ImageMeta;
  /** Embedded lens-correction factors, if present in the RAW. */
  lensCorrection: EmbeddedLensFactors | null;
}
