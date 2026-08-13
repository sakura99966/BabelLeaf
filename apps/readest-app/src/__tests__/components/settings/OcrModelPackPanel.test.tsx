import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import OcrModelPackPanel from '@/components/settings/OcrModelPackPanel';

const mocks = vi.hoisted(() => {
  const ask = vi.fn();
  const createDir = vi.fn();
  const readFile = vi.fn();
  const writeFile = vi.fn();
  const deleteFile = vi.fn();
  const deleteDir = vi.fn();
  const openFile = vi.fn();
  return {
    selectFiles: vi.fn(),
    listPacks: vi.fn(),
    installPack: vi.fn(),
    removePack: vi.fn(),
    ask,
    createDir,
    readFile,
    writeFile,
    deleteFile,
    deleteDir,
    openFile,
    appService: {
      ask,
      createDir,
      readFile,
      writeFile,
      deleteFile,
      deleteDir,
      openFile,
    },
  };
});

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useFileSelector', () => ({
  useFileSelector: () => ({ selectFiles: mocks.selectFiles }),
}));

vi.mock('@/services/translators', () => ({
  installOcrModelPack: mocks.installPack,
  listOcrModelPacks: mocks.listPacks,
  removeOcrModelPack: mocks.removePack,
}));

const pack = {
  id: 'manga-ocr',
  version: '1.2.3',
  runtime: 'onnx',
  languages: ['ja', 'zh', 'en'],
  license: 'Apache-2.0',
};

const selectedFile = (name: string, bytes: Uint8Array) => ({
  name,
  file: {
    name,
    arrayBuffer: async () => bytes.buffer,
  },
});

beforeEach(() => {
  for (const mock of [
    mocks.selectFiles,
    mocks.listPacks,
    mocks.installPack,
    mocks.removePack,
    mocks.ask,
    mocks.createDir,
    mocks.readFile,
    mocks.writeFile,
    mocks.deleteFile,
    mocks.deleteDir,
    mocks.openFile,
  ]) {
    mock.mockReset();
  }
  mocks.listPacks.mockResolvedValue([]);
  mocks.installPack.mockResolvedValue(pack);
  mocks.removePack.mockResolvedValue(undefined);
  mocks.ask.mockResolvedValue(true);
  mocks.selectFiles.mockResolvedValue({ files: [], error: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OcrModelPackPanel', () => {
  test('imports an explicit manifest and every declared local artifact', async () => {
    const manifest = {
      ...pack,
      artifacts: [{ id: 'detector', fileName: 'detector.onnx', sha256: 'a'.repeat(64) }],
    };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    const modelBytes = new Uint8Array([1, 2, 3, 4]);
    mocks.selectFiles.mockResolvedValue({
      files: [
        selectedFile('manifest.json', manifestBytes),
        selectedFile('detector.onnx', modelBytes),
      ],
      error: null,
    });
    mocks.listPacks.mockResolvedValueOnce([]).mockResolvedValue([pack]);

    render(<OcrModelPackPanel />);
    await waitFor(() => expect(mocks.listPacks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Import model pack' }));

    await waitFor(() => expect(mocks.installPack).toHaveBeenCalledTimes(1));
    expect(mocks.installPack.mock.calls[0]![1]).toEqual({
      manifest,
      artifacts: { detector: modelBytes.buffer },
    });
    await waitFor(() =>
      expect(screen.getByText('OCR model pack installed and checksum verified.')).toBeTruthy(),
    );
    expect(screen.getByText('manga-ocr')).toBeTruthy();
    expect(document.body.textContent).toContain('v1.2.3 · onnx · ja, zh, en · Apache-2.0');
  });

  test('rejects an incomplete selection before writing any model files', async () => {
    mocks.selectFiles.mockResolvedValue({
      files: [selectedFile('detector.onnx', new Uint8Array([1, 2, 3]))],
      error: null,
    });

    render(<OcrModelPackPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Import model pack' }));

    await waitFor(() =>
      expect(
        screen.getByText('Select the model manifest JSON and all declared artifacts.'),
      ).toBeTruthy(),
    );
    expect(mocks.installPack).not.toHaveBeenCalled();
  });

  test('prefers manifest.json over provenance JSON and accepts traineddata artifacts', async () => {
    const traineddata = new Uint8Array([9, 8, 7, 6]);
    const manifest = {
      ...pack,
      artifacts: [{ id: 'traineddata', fileName: 'jpn.traineddata', sha256: 'b'.repeat(64) }],
    };
    mocks.selectFiles.mockResolvedValue({
      files: [
        selectedFile(
          'provenance.json',
          new TextEncoder().encode(JSON.stringify({ format: 'babelleaf.model-provenance' })),
        ),
        selectedFile('jpn.traineddata', traineddata),
        selectedFile('manifest.json', new TextEncoder().encode(JSON.stringify(manifest))),
      ],
      error: null,
    });

    render(<OcrModelPackPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Import model pack' }));

    await waitFor(() => expect(mocks.installPack).toHaveBeenCalledTimes(1));
    expect(mocks.installPack.mock.calls[0]![1]).toEqual({
      manifest,
      artifacts: { traineddata: traineddata.buffer },
    });
  });

  test('requires confirmation and refreshes the installed list after removal', async () => {
    mocks.listPacks.mockResolvedValueOnce([pack]).mockResolvedValue([]);
    render(<OcrModelPackPanel />);

    await waitFor(() => expect(screen.getByText('manga-ocr')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(1));
    expect(mocks.removePack).toHaveBeenCalledWith(expect.any(Object), 'manga-ocr', '1.2.3');
    await waitFor(() => expect(screen.queryByText('manga-ocr')).toBeNull());
  });
});
