// Human-readable formatting for EXIF/metadata values.

export function formatAperture(f: number): string | null {
  return f > 0 ? `f/${f % 1 === 0 ? f.toFixed(0) : f.toFixed(1)}` : null;
}

export function formatShutter(seconds: number): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds >= 1) return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
  return `1/${Math.round(1 / seconds)}s`;
}

export function formatFocal(mm: number): string | null {
  return mm > 0 ? `${Math.round(mm)} mm` : null;
}

export function formatIso(iso: number): string | null {
  return iso > 0 ? `ISO ${Math.round(iso)}` : null;
}

export function formatDimensions(w: number, h: number): string | null {
  if (w <= 0 || h <= 0) return null;
  const mp = (w * h) / 1_000_000;
  return `${w} × ${h} (${mp.toFixed(1)} MP)`;
}

export function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}
