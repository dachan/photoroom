// Central app state. Kept lean: it holds selection, catalog, and the current
// image's edit params. Side effects (decode, GPU render, persistence) live in
// the Editor component and hooks, which subscribe to slices of this store.

import { create } from "zustand";
import type { CatalogImage, EditParams, LensCorrection } from "@/lib/types";
import { DEFAULT_EDIT } from "@/lib/types";
import type { RawFileEntry } from "@/lib/fs/directory";

export type Status =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "exporting"; message: string }
  | { kind: "error"; message: string };

interface EditorState {
  supported: boolean;
  dirHandle: FileSystemDirectoryHandle | null;
  dirName: string | null;
  /** In-memory file handles for the picked directory (not persisted). */
  files: RawFileEntry[];
  /** Catalog metadata + thumbnails, keyed by image id. */
  catalog: Record<string, CatalogImage>;
  selectedId: string | null;
  edit: EditParams;
  status: Status;

  setSupported: (v: boolean) => void;
  openDirectory: (args: {
    handle: FileSystemDirectoryHandle;
    name: string;
    files: RawFileEntry[];
  }) => void;
  upsertCatalog: (image: CatalogImage) => void;
  selectImage: (id: string | null) => void;
  setEdit: (edit: EditParams) => void;
  patchEdit: (patch: Partial<Omit<EditParams, "lens">>) => void;
  patchLens: (patch: Partial<LensCorrection>) => void;
  resetEdit: () => void;
  setStatus: (status: Status) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  supported: true,
  dirHandle: null,
  dirName: null,
  files: [],
  catalog: {},
  selectedId: null,
  edit: DEFAULT_EDIT,
  status: { kind: "idle" },

  setSupported: (v) => set({ supported: v }),
  openDirectory: ({ handle, name, files }) =>
    set({ dirHandle: handle, dirName: name, files, selectedId: null }),
  upsertCatalog: (image) =>
    set((s) => ({ catalog: { ...s.catalog, [image.id]: image } })),
  selectImage: (id) => set({ selectedId: id }),
  setEdit: (edit) => set({ edit }),
  patchEdit: (patch) => set((s) => ({ edit: { ...s.edit, ...patch } })),
  patchLens: (patch) =>
    set((s) => ({ edit: { ...s.edit, lens: { ...s.edit.lens, ...patch } } })),
  resetEdit: () => set({ edit: DEFAULT_EDIT }),
  setStatus: (status) => set({ status }),
}));
