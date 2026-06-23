// File System Access API helpers: pick a folder, scan for RAW files,
// read bytes, and write exported JPEGs back into an /exports subfolder.

const RAW_EXTENSIONS = [
  ".arw", // Sony (primary target)
  ".cr2",
  ".cr3",
  ".nef",
  ".dng",
  ".raf",
  ".rw2",
];

export interface RawFileEntry {
  /** Relative path from the picked directory root, used as a stable id. */
  id: string;
  name: string;
  handle: FileSystemFileHandle;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function hasRawExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return RAW_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Prompt the user to pick a directory (read/write). */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  return window.showDirectoryPicker({ mode: "readwrite", id: "photoroom-library" });
}

/** Recursively walk a directory collecting RAW files. */
export async function scanForRawFiles(
  dir: FileSystemDirectoryHandle,
  prefix = "",
): Promise<RawFileEntry[]> {
  const results: RawFileEntry[] = [];
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      if (hasRawExtension(name)) {
        results.push({ id: path, name, handle: handle as FileSystemFileHandle });
      }
    } else if (handle.kind === "directory" && name !== "exports") {
      const nested = await scanForRawFiles(handle as FileSystemDirectoryHandle, path);
      results.push(...nested);
    }
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

/** Read a RAW file's raw bytes. */
export async function readFileBytes(handle: FileSystemFileHandle): Promise<ArrayBuffer> {
  const file = await handle.getFile();
  return file.arrayBuffer();
}

/** Write a blob into an `exports/` subfolder of the picked directory. */
export async function writeToExports(
  dir: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
): Promise<void> {
  const exportsDir = await dir.getDirectoryHandle("exports", { create: true });
  const fileHandle = await exportsDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * Re-verify (and if needed re-request) read/write permission on a handle that
 * was restored from IndexedDB in a later session.
 */
export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}
