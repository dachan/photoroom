"use client";

import { useEditorStore } from "@/state/editorStore";
import { useEffect, useMemo, useState } from "react";

interface FolderPanelProps {
  onOpen: () => void;
  onReopen: () => void;
  lastDirName: string | null;
}

export function FolderPanel({ onOpen, onReopen, lastDirName }: FolderPanelProps) {
  const files = useEditorStore((s) => s.files);
  const catalog = useEditorStore((s) => s.catalog);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectImage = useEditorStore((s) => s.selectImage);
  const dirName = useEditorStore((s) => s.dirName);

  // Show catalog entries even before a folder is re-opened (from prior session).
  const entries = useMemo(() => {
    if (files.length > 0) return files.map((f) => ({ id: f.id, name: f.name }));
    return Object.values(catalog).map((c) => ({ id: c.id, name: c.name }));
  }, [files, catalog]);

  return (
    <aside className="flex w-64 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex flex-col gap-2 border-b border-zinc-800 p-3">
        <button
          onClick={onOpen}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
        >
          Open Folder
        </button>
        {lastDirName && !dirName && (
          <button
            onClick={onReopen}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Reopen “{lastDirName}”
          </button>
        )}
        {dirName && <p className="truncate text-xs text-zinc-500">{dirName}</p>}
      </div>

      <ul className="flex-1 overflow-y-auto">
        {entries.length === 0 && (
          <li className="p-3 text-xs text-zinc-600">No images. Open a folder to begin.</li>
        )}
        {entries.map((entry) => {
          const thumb = catalog[entry.id]?.thumbnail;
          const isSelected = entry.id === selectedId;
          return (
            <li key={entry.id}>
              <button
                onClick={() => selectImage(entry.id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                  isSelected ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"
                }`}
              >
                <Thumb blob={thumb} />
                <span className="truncate">{entry.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function Thumb({ blob }: { blob: Blob | null | undefined }) {
  // Create and revoke the object URL in the same effect so React StrictMode's
  // double-invocation (dev) doesn't revoke a URL still in use by the <img>.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) {
    return <div className="h-10 w-10 flex-shrink-0 rounded bg-zinc-800" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-10 w-10 flex-shrink-0 rounded object-cover" />;
}
