/** File-byte budget before JSON/XML parsing; schema budgets still apply afterward. */
export const MAX_SIDECAR_INPUT_BYTES = 64 * 1024 * 1024;

export async function readSidecarInput(file: File, closeAfterRead = false): Promise<string> {
  try {
    if (!Number.isSafeInteger(file.size) || file.size < 0)
      throw new Error('Invalid sidecar input size');
    if (file.size > MAX_SIDECAR_INPUT_BYTES)
      throw new Error('Sidecar input exceeds the 64 MiB byte limit');
    // Lazy native files read only this bounded range, even if they grow after stat.
    const bounded = file.slice(0, file.size);
    if (bounded.size > MAX_SIDECAR_INPUT_BYTES)
      throw new Error('Sidecar input exceeds the 64 MiB byte limit');
    const text = await bounded.text();
    if (text.length > MAX_SIDECAR_INPUT_BYTES)
      throw new Error('Sidecar input exceeds the 64 MiB byte limit');
    return text;
  } finally {
    // Only the caller-created native file is owned here, never the picker File.
    if (closeAfterRead && 'close' in file && typeof file.close === 'function') await file.close();
  }
}
