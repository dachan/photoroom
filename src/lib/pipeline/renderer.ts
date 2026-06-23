// Renderer abstraction. This is the single seam for a future WebGPU backend:
// the WebGL2 implementation lives behind this interface, and only the shaders +
// backend class change when swapping. UI, state, and the develop math that maps
// EditParams -> uniforms stay the same.

import type { DecodedImage, EditParams } from "@/lib/types";

export interface ExportResult {
  width: number;
  height: number;
  /** RGBA8 pixels, top-left origin. */
  pixels: Uint8ClampedArray;
}

export interface Renderer {
  /** Upload a decoded image to the GPU. Replaces any previously loaded image. */
  loadImage(image: DecodedImage): void;
  /** Render the loaded image with the given edits into the preview canvas. */
  renderPreview(params: EditParams): void;
  /** Render at full resolution and read back RGBA8 pixels for export. */
  renderForExport(params: EditParams): ExportResult;
  /** Release GPU resources. */
  dispose(): void;
}
