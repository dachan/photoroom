// IndexedDB catalog: persists image metadata + thumbnails, per-image edit data,
// and the last-used directory handle (for "reopen last folder"). Original RAW
// pixels are NOT stored here — they stay on disk, read live via the handle.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CatalogImage, EditParams } from "@/lib/types";

export interface EditRecord {
  id: string;
  params: EditParams;
  updatedAt: number;
}

interface DirectoryRecord {
  key: "last";
  handle: FileSystemDirectoryHandle;
  name: string;
}

interface PhotoroomDB extends DBSchema {
  images: { key: string; value: CatalogImage };
  edits: { key: string; value: EditRecord };
  directories: { key: string; value: DirectoryRecord };
}

const DB_NAME = "photoroom";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PhotoroomDB>> | null = null;

function getDb(): Promise<IDBPDatabase<PhotoroomDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PhotoroomDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("images")) db.createObjectStore("images", { keyPath: "id" });
        if (!db.objectStoreNames.contains("edits")) db.createObjectStore("edits", { keyPath: "id" });
        if (!db.objectStoreNames.contains("directories")) db.createObjectStore("directories", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

export async function putImage(image: CatalogImage): Promise<void> {
  const db = await getDb();
  await db.put("images", image);
}

export async function getAllImages(): Promise<CatalogImage[]> {
  const db = await getDb();
  return db.getAll("images");
}

export async function getEdit(id: string): Promise<EditRecord | undefined> {
  const db = await getDb();
  return db.get("edits", id);
}

export async function putEdit(record: EditRecord): Promise<void> {
  const db = await getDb();
  await db.put("edits", record);
}

export async function saveLastDirectory(
  handle: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  const db = await getDb();
  await db.put("directories", { key: "last", handle, name });
}

export async function getLastDirectory(): Promise<DirectoryRecord | undefined> {
  const db = await getDb();
  return db.get("directories", "last");
}
