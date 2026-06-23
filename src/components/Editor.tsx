"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderPanel } from "@/components/FolderPanel";
import { Viewport } from "@/components/Viewport";
import { AdjustPanel } from "@/components/AdjustPanel";
import { useRenderer } from "@/hooks/useRenderer";
import { useEditorStore } from "@/state/editorStore";
import {
  ensurePermission,
  isFileSystemAccessSupported,
  pickDirectory,
  readFileBytes,
  scanForRawFiles,
  writeToExports,
  type RawFileEntry,
} from "@/lib/fs/directory";
import { decodeMetaAndThumb, decodeRaw } from "@/lib/decode/libraw";
import { buildInitialEdit } from "@/lib/edit/initialEdit";
import { encodeJpeg, toJpegFileName } from "@/lib/export/jpeg";
import {
  getAllImages,
  getEdit,
  getLastDirectory,
  putEdit,
  putImage,
  saveLastDirectory,
} from "@/lib/db/catalog";
import { bytesToBlob } from "@/lib/util/bytes";
import type { CatalogImage, EditParams } from "@/lib/types";

export function Editor() {
  const { setCanvas, loadImage, scheduleRender, exportImage, error: rendererError } =
    useRenderer();

  const supported = useEditorStore((s) => s.supported);
  const setSupported = useEditorStore((s) => s.setSupported);
  const openDirectory = useEditorStore((s) => s.openDirectory);
  const upsertCatalog = useEditorStore((s) => s.upsertCatalog);
  const setEdit = useEditorStore((s) => s.setEdit);
  const setStatus = useEditorStore((s) => s.setStatus);
  const edit = useEditorStore((s) => s.edit);
  const selectedId = useEditorStore((s) => s.selectedId);

  const [lastDirName, setLastDirName] = useState<string | null>(null);

  const decodeToken = useRef(0);
  const genToken = useRef(0);
  const loadedEditRef = useRef<EditParams | null>(null);
  const loadedImageId = useRef<string | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Mount: feature-detect, load catalog + last directory from IndexedDB.
  useEffect(() => {
    setSupported(isFileSystemAccessSupported());
    void (async () => {
      try {
        const images = await getAllImages();
        for (const img of images) upsertCatalog(img);
        const last = await getLastDirectory();
        if (last) setLastDirName(last.name);
      } catch (err) {
        console.warn("Catalog load failed:", err);
      }
    })();
  }, [setSupported, upsertCatalog]);

  // --- Generate catalog entries (metadata + thumbnail) for files lacking one.
  const generateCatalog = useCallback(
    async (files: RawFileEntry[], token: number) => {
      const { catalog } = useEditorStore.getState();
      for (const file of files) {
        if (token !== genToken.current) return;
        if (catalog[file.id]?.thumbnail) continue;
        try {
          const bytes = await readFileBytes(file.handle);
          const { meta, thumbnail } = await decodeMetaAndThumb(bytes);
          const entry: CatalogImage = {
            id: file.id,
            name: file.name,
            meta,
            thumbnail: thumbnail ? bytesToBlob(thumbnail, "image/jpeg") : null,
            addedAt: Date.now(),
          };
          if (token !== genToken.current) return;
          upsertCatalog(entry);
          await putImage(entry);
        } catch (err) {
          console.warn(`Catalog entry failed for ${file.name}:`, err);
        }
      }
    },
    [upsertCatalog],
  );

  const handleOpenDirectory = useCallback(
    async (existing?: FileSystemDirectoryHandle) => {
      try {
        const handle = existing ?? (await pickDirectory());
        const granted = await ensurePermission(handle);
        if (!granted) {
          setStatus({ kind: "error", message: "Permission to the folder was denied." });
          return;
        }
        const files = await scanForRawFiles(handle);
        const name = handle.name;
        openDirectory({ handle, name, files });
        setLastDirName(name);
        await saveLastDirectory(handle, name);
        genToken.current += 1;
        void generateCatalog(files, genToken.current);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      }
    },
    [openDirectory, setStatus, generateCatalog],
  );

  const handleReopen = useCallback(async () => {
    const last = await getLastDirectory();
    if (last) await handleOpenDirectory(last.handle);
  }, [handleOpenDirectory]);

  // --- Selection: decode the RAW, load to GPU, hydrate edit params.
  useEffect(() => {
    if (!selectedId) return;
    const { files } = useEditorStore.getState();
    const entry = files.find((f) => f.id === selectedId);
    if (!entry) {
      setStatus({ kind: "error", message: "Re-open the folder to edit this image." });
      return;
    }

    const token = ++decodeToken.current;
    setStatus({ kind: "loading", message: "Decoding RAW…" });

    void (async () => {
      try {
        const bytes = await readFileBytes(entry.handle);
        const { image, thumbnail } = await decodeRaw(bytes);
        if (token !== decodeToken.current) return;

        loadImage(image);
        loadedImageId.current = selectedId;

        const saved = await getEdit(selectedId);
        const initial = buildInitialEdit(image.meta, saved);
        loadedEditRef.current = initial;
        setEdit(initial);
        scheduleRender(initial);

        // Refresh catalog metadata/thumbnail from the full decode.
        const catalogEntry: CatalogImage = {
          id: selectedId,
          name: entry.name,
          meta: image.meta,
          thumbnail: thumbnail
            ? bytesToBlob(thumbnail, "image/jpeg")
            : useEditorStore.getState().catalog[selectedId]?.thumbnail ?? null,
          addedAt: useEditorStore.getState().catalog[selectedId]?.addedAt ?? Date.now(),
        };
        upsertCatalog(catalogEntry);
        await putImage(catalogEntry);

        if (token === decodeToken.current) setStatus({ kind: "idle" });
      } catch (err) {
        if (token === decodeToken.current) {
          setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
  }, [selectedId, loadImage, scheduleRender, setEdit, setStatus, upsertCatalog]);

  // --- Edit changes: re-render preview, debounce-persist (skip the load echo).
  useEffect(() => {
    if (!selectedId || loadedImageId.current !== selectedId) return;
    scheduleRender(edit);

    if (edit === loadedEditRef.current) return; // freshly loaded value, don't persist
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void putEdit({ id: selectedId, params: edit, updatedAt: Date.now() });
    }, 400);
  }, [edit, selectedId, scheduleRender]);

  const handleExport = useCallback(async () => {
    const { dirHandle, files, selectedId: id } = useEditorStore.getState();
    if (!dirHandle || !id) return;
    const entry = files.find((f) => f.id === id);
    if (!entry) return;
    setStatus({ kind: "exporting", message: "Exporting JPEG…" });
    try {
      const result = exportImage(useEditorStore.getState().edit);
      const blob = await encodeJpeg(result);
      await writeToExports(dirHandle, toJpegFileName(entry.name), blob);
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [exportImage, setStatus]);

  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);

  if (!supported) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-900 p-8">
        <div className="max-w-md rounded border border-zinc-700 bg-zinc-950 p-6 text-center text-sm text-zinc-300">
          <h1 className="mb-2 text-lg font-semibold text-white">Browser not supported</h1>
          <p>
            This editor needs the File System Access API (
            <code>showDirectoryPicker</code>), available in Chromium-based browsers
            like Chrome, Edge, and Arc.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <FolderPanel
        onOpen={() => void handleOpenDirectory()}
        onReopen={() => void handleReopen()}
        lastDirName={lastDirName}
      />
      <Viewport setCanvas={setCanvas} rendererError={rendererError} />
      <AdjustPanel onExport={() => void handleExport()} />
    </div>
  );
}
