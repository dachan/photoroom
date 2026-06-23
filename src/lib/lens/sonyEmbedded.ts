// Reads Sony's embedded lens-correction data from an ARW (or Sony DNG) and
// builds per-knot correction factors for the GPU pipeline.
//
// The data lives as plain TIFF tags in the first SubIFD ("SubImage1"), not in
// the encrypted maker-note blocks:
//   0x7037 DistortionCorrParams        int16s, [0]=nc, then nc knots
//   0x7032 VignettingCorrParams        int16s, [0]=nc, then nc knots
//   0x7035 ChromaticAberrationCorrParams int16s, [0]=2*nc, then nc red + nc blue
//
// Decode (per darktable's built-in module, https://github.com/darktable-org/darktable):
//   distortion factor = distortion[i] * 2^-14 + 1
//   CA red/blue       = ca[i]        * 2^-21 + 1
//   vignette gain     = (2^(0.5 - 2^(vignetting[i] * 2^-13 - 1)))^2
// Knots are spaced evenly from frame center (rn=0) to corner (rn=1).

import type { EmbeddedLensFactors } from "@/lib/types";

const TAG_VIGNETTING = 0x7032;
const TAG_CA = 0x7035;
const TAG_DISTORTION = 0x7037;
const TAG_SUBIFDS = 0x014a;
const MAX_KNOTS = 16;

const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_SSHORT = 8;

interface RawParams {
  distortion: number[];
  vignetting: number[];
  ca: number[];
}

interface IfdEntry {
  type: number;
  count: number;
  valueOffset: number; // file offset of value (or where the inline value sits)
}

function readEntries(view: DataView, ifdOffset: number, le: boolean): Map<number, IfdEntry> {
  const entries = new Map<number, IfdEntry>();
  if (ifdOffset <= 0 || ifdOffset + 2 > view.byteLength) return entries;
  const count = view.getUint16(ifdOffset, le);
  for (let i = 0; i < count; i++) {
    const e = ifdOffset + 2 + i * 12;
    if (e + 12 > view.byteLength) break;
    const tag = view.getUint16(e, le);
    const type = view.getUint16(e + 2, le);
    const cnt = view.getUint32(e + 4, le);
    entries.set(tag, { type, count: cnt, valueOffset: e + 8 });
  }
  return entries;
}

function typeSize(type: number): number {
  if (type === TYPE_SHORT || type === TYPE_SSHORT) return 2;
  if (type === TYPE_LONG) return 4;
  return 1;
}

/** Resolve the file offset where an entry's values actually start. */
function valueStart(view: DataView, entry: IfdEntry, le: boolean): number {
  const bytes = typeSize(entry.type) * entry.count;
  return bytes <= 4 ? entry.valueOffset : view.getUint32(entry.valueOffset, le);
}

function readInt16Array(view: DataView, entry: IfdEntry, le: boolean): number[] {
  const start = valueStart(view, entry, le);
  const out: number[] = [];
  for (let i = 0; i < entry.count; i++) {
    const o = start + i * 2;
    if (o + 2 > view.byteLength) break;
    out.push(view.getInt16(o, le));
  }
  return out;
}

function readUint32Array(view: DataView, entry: IfdEntry, le: boolean): number[] {
  const start = valueStart(view, entry, le);
  const out: number[] = [];
  for (let i = 0; i < entry.count; i++) {
    const o = start + i * 4;
    if (o + 4 > view.byteLength) break;
    out.push(view.getUint32(o, le));
  }
  return out;
}

/** Find the three correction tags by scanning IFD0 and all of its SubIFDs. */
function findRawParams(view: DataView, le: boolean, ifd0: number): RawParams | null {
  const candidates: number[] = [ifd0];
  const ifd0Entries = readEntries(view, ifd0, le);
  const subIfds = ifd0Entries.get(TAG_SUBIFDS);
  if (subIfds) candidates.push(...readUint32Array(view, subIfds, le));

  for (const offset of candidates) {
    const entries = readEntries(view, offset, le);
    const d = entries.get(TAG_DISTORTION);
    const v = entries.get(TAG_VIGNETTING);
    const c = entries.get(TAG_CA);
    if (d && v && c) {
      return {
        distortion: readInt16Array(view, d, le),
        vignetting: readInt16Array(view, v, le),
        ca: readInt16Array(view, c, le),
      };
    }
  }
  return null;
}

function buildFactors(raw: RawParams): EmbeddedLensFactors | null {
  const nc = raw.distortion[0];
  if (!Number.isInteger(nc) || nc < 2 || nc > MAX_KNOTS) return null;
  if (raw.vignetting[0] !== nc) return null;
  if (raw.ca[0] !== 2 * nc) return null;
  if (raw.distortion.length < nc + 1 || raw.ca.length < 2 * nc + 1) return null;

  const distFactor = new Float32Array(MAX_KNOTS);
  const caRFactor = new Float32Array(MAX_KNOTS);
  const caBFactor = new Float32Array(MAX_KNOTS);
  const vigGain = new Float32Array(MAX_KNOTS);

  for (let i = 0; i < nc; i++) {
    distFactor[i] = raw.distortion[1 + i] * 2 ** -14 + 1;
    caRFactor[i] = raw.ca[1 + i] * 2 ** -21 + 1;
    caBFactor[i] = raw.ca[1 + nc + i] * 2 ** -21 + 1;
    const v = 2 ** (0.5 - 2 ** (raw.vignetting[1 + i] * 2 ** -13 - 1));
    vigGain[i] = v * v;
  }

  // Normalize so the corner knot maps corner→corner (fills the frame).
  const cornerFactor = distFactor[nc - 1];
  const scale = cornerFactor > 0 ? 1 / cornerFactor : 1;

  return { nc, distFactor, caRFactor, caBFactor, vigGain, scale };
}

/**
 * Parse embedded Sony lens-correction factors from RAW bytes. Returns null when
 * the file has no such data or isn't a parseable TIFF/ARW.
 */
export function parseSonyEmbeddedCorrection(bytes: ArrayBuffer): EmbeddedLensFactors | null {
  try {
    const view = new DataView(bytes);
    if (view.byteLength < 8) return null;
    const byteOrder = view.getUint16(0, false);
    let le: boolean;
    if (byteOrder === 0x4949) le = true; // "II"
    else if (byteOrder === 0x4d4d) le = false; // "MM"
    else return null;
    if (view.getUint16(2, le) !== 42) return null;

    const ifd0 = view.getUint32(4, le);
    const raw = findRawParams(view, le, ifd0);
    if (!raw) return null;
    return buildFactors(raw);
  } catch {
    return null;
  }
}
