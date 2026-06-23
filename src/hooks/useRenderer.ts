// Owns the WebGL2 renderer instance bound to a canvas, batches preview renders
// to animation frames, and exposes load/export. Disposes GPU resources on
// unmount.

import { useCallback, useEffect, useRef, useState } from "react";
import { WebGL2Renderer } from "@/lib/pipeline/webgl2/renderer";
import type { ExportResult } from "@/lib/pipeline/renderer";
import type { DecodedImage, EditParams } from "@/lib/types";

export function useRenderer() {
  const rendererRef = useRef<WebGL2Renderer | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingParams = useRef<EditParams | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (canvas && !rendererRef.current) {
      try {
        rendererRef.current = new WebGL2Renderer(canvas);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  const loadImage = useCallback((image: DecodedImage) => {
    rendererRef.current?.loadImage(image);
  }, []);

  const scheduleRender = useCallback((params: EditParams) => {
    pendingParams.current = params;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const p = pendingParams.current;
      if (p && rendererRef.current) rendererRef.current.renderPreview(p);
    });
  }, []);

  const exportImage = useCallback((params: EditParams): ExportResult => {
    if (!rendererRef.current) throw new Error("Renderer not ready");
    return rendererRef.current.renderForExport(params);
  }, []);

  return { setCanvas, loadImage, scheduleRender, exportImage, error };
}
