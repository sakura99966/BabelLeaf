import { exportComicPages, type ComicExportInput } from '../services/translators/comicExport';

self.onmessage = (event: MessageEvent<ComicExportInput>) => {
  try {
    const result = exportComicPages(event.data);
    if (!result.archive) throw new Error('Archive export required');
    // Transfer only the archive, not a second full set of input images.
    self.postMessage(
      { fileName: result.fileName, archive: result.archive },
      { transfer: [result.archive.buffer as ArrayBuffer] },
    );
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Comic export failed' });
  }
};
