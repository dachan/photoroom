"use client";

import { useEditorStore } from "@/state/editorStore";
import { Slider } from "@/components/Slider";

interface AdjustPanelProps {
  onExport: () => void;
}

export function AdjustPanel({ onExport }: AdjustPanelProps) {
  const edit = useEditorStore((s) => s.edit);
  const patchEdit = useEditorStore((s) => s.patchEdit);
  const patchLens = useEditorStore((s) => s.patchLens);
  const resetEdit = useEditorStore((s) => s.resetEdit);
  const selectedId = useEditorStore((s) => s.selectedId);
  const status = useEditorStore((s) => s.status);
  const correctionSource = useEditorStore((s) =>
    s.selectedId ? s.catalog[s.selectedId]?.meta?.lensCorrectionSource ?? "none" : "none",
  );
  const matchedLensName = useEditorStore((s) =>
    s.selectedId ? s.catalog[s.selectedId]?.meta?.matchedLensName ?? null : null,
  );
  const hasAuto = correctionSource !== "none";
  const autoLabel =
    correctionSource === "embedded"
      ? "Use in-camera profile (embedded)"
      : `Use Lensfun profile${matchedLensName ? ` — ${matchedLensName}` : ""}`;

  const disabled = !selectedId;
  const busy = status.kind === "loading" || status.kind === "exporting";

  return (
    <aside className="flex w-72 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 p-3">
        <h2 className="text-sm font-medium text-zinc-200">Develop</h2>
        <button
          onClick={resetEdit}
          disabled={disabled}
          className="text-xs text-zinc-400 hover:text-white disabled:opacity-40"
        >
          Reset
        </button>
      </div>

      <div className={`flex-1 space-y-5 overflow-y-auto p-4 ${disabled ? "pointer-events-none opacity-40" : ""}`}>
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tone</h3>
          <Slider label="Exposure" min={-5} max={5} step={0.01} value={edit.exposure} onChange={(v) => patchEdit({ exposure: v })} />
          <Slider label="Contrast" min={-100} max={100} value={edit.contrast} onChange={(v) => patchEdit({ contrast: v })} />
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">White Balance</h3>
          <Slider label="Temperature" min={-100} max={100} value={edit.temperature} onChange={(v) => patchEdit({ temperature: v })} />
          <Slider label="Tint" min={-100} max={100} value={edit.tint} onChange={(v) => patchEdit({ tint: v })} />
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Color</h3>
          <Slider label="Saturation" min={-100} max={100} value={edit.saturation} onChange={(v) => patchEdit({ saturation: v })} />
          <Slider label="Vibrance" min={-100} max={100} value={edit.vibrance} onChange={(v) => patchEdit({ vibrance: v })} />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Lens Correction</h3>
            <label className="flex items-center gap-1.5 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={edit.lens.enabled}
                onChange={(e) => patchLens({ enabled: e.target.checked })}
                className="accent-blue-500"
              />
              On
            </label>
          </div>
          {hasAuto && (
            <label className="flex items-start gap-1.5 text-[11px] text-emerald-500">
              <input
                type="checkbox"
                checked={edit.lens.useEmbedded}
                onChange={(e) => patchLens({ useEmbedded: e.target.checked })}
                disabled={!edit.lens.enabled}
                className="mt-0.5 accent-emerald-500"
              />
              <span>{autoLabel}</span>
            </label>
          )}
          {edit.lens.fromProfile && (
            <p className="text-[11px] text-emerald-500">Profile matched from lens metadata.</p>
          )}
          {!(hasAuto && edit.lens.useEmbedded) && (
            <div className={edit.lens.enabled ? "space-y-3" : "space-y-3 opacity-40 pointer-events-none"}>
              <Slider label="Distortion k1" min={-0.5} max={0.5} step={0.005} value={edit.lens.k1} onChange={(v) => patchLens({ k1: v, fromProfile: false })} />
              <Slider label="Distortion k2" min={-0.2} max={0.2} step={0.005} value={edit.lens.k2} onChange={(v) => patchLens({ k2: v, fromProfile: false })} />
              <Slider label="Vignette" min={-1} max={1} step={0.01} value={edit.lens.vignette} onChange={(v) => patchLens({ vignette: v, fromProfile: false })} />
            </div>
          )}
        </section>
      </div>

      <div className="border-t border-zinc-800 p-3">
        <button
          onClick={onExport}
          disabled={disabled || busy}
          className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {status.kind === "exporting" ? "Exporting…" : "Export JPEG (Q100)"}
        </button>
      </div>
    </aside>
  );
}
