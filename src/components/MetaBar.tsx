"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { ImageMeta } from "@/lib/types";
import {
  formatAperture,
  formatDateTime,
  formatDimensions,
  formatFocal,
  formatIso,
  formatShutter,
} from "@/lib/util/format";

interface MetaBarProps {
  meta: ImageMeta;
}

interface Field {
  label: string;
  value: string;
}

const MIN_HEIGHT = 96;
const DEFAULT_HEIGHT = 240;

export function MetaBar({ meta }: MetaBarProps) {
  const [showAll, setShowAll] = useState(true);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  const camera = [meta.make, meta.model].filter(Boolean).join(" ").trim();

  const fields: Field[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value) fields.push({ label, value });
  };

  push("Camera", camera);
  push("Lens", meta.lens);
  push("Focal", formatFocal(meta.focalLength));
  push("Aperture", formatAperture(meta.aperture));
  push("Shutter", formatShutter(meta.shutter));
  push("ISO", formatIso(meta.iso));
  push("Dimensions", formatDimensions(meta.width, meta.height));
  push("Orientation", meta.flip ? `flip ${meta.flip}` : "normal");
  push("Date", formatDateTime(meta.dateTime));

  const allEntries = useMemo(
    () => Object.entries(meta.all ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    [meta.all],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { startY: e.clientY, startH: height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.startY;
    const max = Math.round(window.innerHeight * 0.8);
    setHeight(Math.min(max, Math.max(MIN_HEIGHT, drag.current.startH - dy)));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const strip = (
    <div className="flex shrink-0 items-center gap-x-6 px-4 py-2">
      <dl className="flex flex-1 flex-wrap gap-x-6 gap-y-1 text-xs">
        {fields.map((f) => (
          <div key={f.label} className="flex gap-1.5">
            <dt className="text-zinc-500">{f.label}</dt>
            <dd className="tabular-nums text-zinc-200">{f.value}</dd>
          </div>
        ))}
      </dl>
      {allEntries.length > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="shrink-0 text-xs text-blue-400 hover:text-blue-300"
        >
          {showAll ? "Hide" : `All metadata (${allEntries.length})`}
        </button>
      )}
    </div>
  );

  if (!showAll) {
    return <div className="shrink-0 border-t border-zinc-800 bg-zinc-950">{strip}</div>;
  }

  return (
    <div
      className="flex shrink-0 flex-col border-t border-zinc-800 bg-zinc-950"
      style={{ height }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize metadata panel"
        className="h-1.5 shrink-0 cursor-row-resize touch-none bg-zinc-800 transition-colors hover:bg-zinc-600"
      />
      {strip}
      <div className="flex-1 overflow-y-auto border-t border-zinc-900 px-4 py-2">
        <dl className="gap-x-8 text-[11px] sm:columns-2 lg:columns-3">
          {allEntries.map(([key, value]) => (
            <div key={key} className="flex break-inside-avoid justify-between gap-3 py-px">
              <dt className="truncate text-zinc-500" title={key}>{key}</dt>
              <dd className="max-w-[55%] truncate text-right tabular-nums text-zinc-300" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
