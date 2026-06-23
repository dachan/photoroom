// Flattens LibRaw's nested metadata object into a flat map of readable
// key -> value strings, so the UI can show every available field. Binary blobs
// are summarized rather than dumped, and nested vendor blocks get dotted keys.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    const len = value instanceof Uint8Array ? value.byteLength : value.byteLength;
    return `<${len} bytes>`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    // Arrays of primitives -> compact list; arrays of arrays -> JSON.
    if (value.every((v) => typeof v === "number" || typeof v === "string")) {
      return `[${value.join(", ")}]`;
    }
    return JSON.stringify(value);
  }
  return null;
}

export function flattenMeta(
  obj: Record<string, unknown>,
  prefix = "",
  out: Record<string, string> = {},
): Record<string, string> {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      flattenMeta(value, path, out);
    } else {
      const formatted = formatValue(value);
      if (formatted !== null) out[path] = formatted;
    }
  }
  return out;
}
