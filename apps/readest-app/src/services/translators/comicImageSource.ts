type ComicImageSource = Pick<File, 'size' | 'arrayBuffer'> & {
  close?: () => Promise<void>;
};

/** NativeFile is a streamed File with an empty internal Blob. Browser image
 * decoders need real encoded bytes, not that wrapper. Materialize one bounded
 * page at a time and release the native handle on every path. */
export async function readComicImageBlob(
  file: ComicImageSource,
  expectedByteLength: number,
  mimeType: string,
): Promise<Blob> {
  try {
    if (
      !Number.isSafeInteger(expectedByteLength) ||
      expectedByteLength <= 0 ||
      expectedByteLength > 64 * 1024 * 1024 ||
      file.size !== expectedByteLength
    ) {
      throw new Error('Comic source image size changed or exceeds the page limit');
    }
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength !== expectedByteLength) {
      throw new Error('Comic source image read was incomplete');
    }
    return new Blob([bytes], { type: mimeType });
  } finally {
    await file.close?.();
  }
}
