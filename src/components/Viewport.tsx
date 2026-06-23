"use client";

import { useEditorStore } from "@/state/editorStore";
import { MetaBar } from "@/components/MetaBar";

interface ViewportProps {
  setCanvas: (canvas: HTMLCanvasElement | null) => void;
  rendererError: string | null;
}

export function Viewport({ setCanvas, rendererError }: ViewportProps) {
  const status = useEditorStore((s) => s.status);
  const selectedId = useEditorStore((s) => s.selectedId);
  const meta = useEditorStore((s) => (s.selectedId ? s.catalog[s.selectedId]?.meta : undefined));

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-900 p-4">
        <canvas
          ref={setCanvas}
          className="max-h-full max-w-full object-contain"
          style={{ display: selectedId ? "block" : "none" }}
        />

        {!selectedId && !rendererError && (
          <p className="text-sm text-zinc-600">Select an image to begin editing.</p>
        )}

        {rendererError && (
          <div className="max-w-md rounded border border-red-900 bg-red-950 p-4 text-sm text-red-300">
            {rendererError}
          </div>
        )}

        {status.kind === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-zinc-200">
            {status.message}
          </div>
        )}

        {status.kind === "error" && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-red-900 px-3 py-1.5 text-xs text-red-100">
            {status.message}
          </div>
        )}
      </div>

      {selectedId && meta && <MetaBar meta={meta} />}
    </main>
  );
}
