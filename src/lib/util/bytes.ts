// Helpers to normalize typed arrays that may be backed by a SharedArrayBuffer
// (libraw-wasm uses shared memory) into plain ArrayBuffer-backed copies, which
// Blob/ImageData require.

export function toArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([toArrayBufferBytes(bytes)], { type });
}
