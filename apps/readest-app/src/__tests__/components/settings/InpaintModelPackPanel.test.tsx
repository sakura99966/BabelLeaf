import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import InpaintModelPackPanel from '@/components/settings/InpaintModelPackPanel';

const mocks = vi.hoisted(() => ({
  selectFiles: vi.fn(),
  listPacks: vi.fn(),
  installPack: vi.fn(),
  removePack: vi.fn(),
  ask: vi.fn(),
  createDir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteDir: vi.fn(),
  openFile: vi.fn(),
}));

const appService = {
  ask: mocks.ask,
  createDir: mocks.createDir,
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  deleteDir: mocks.deleteDir,
  openFile: mocks.openFile,
};

vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/hooks/useFileSelector', () => ({
  useFileSelector: () => ({ selectFiles: mocks.selectFiles }),
}));
vi.mock('@/services/translators', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/translators')>();
  return {
    ...actual,
    installInpaintModelPack: mocks.installPack,
    listInpaintModelPacks: mocks.listPacks,
    removeInpaintModelPack: mocks.removePack,
  };
});

const manifest = {
  format: 'babelleaf.inpaint-model' as const,
  schemaVersion: 1 as const,
  id: 'opencv-inpainting-lama',
  version: '2025jan',
  runtime: 'onnxruntime-web' as const,
  engine: 'lama-opencv-512' as const,
  license: 'Apache-2.0',
  source: 'local-import' as const,
  sourceUrl: 'https://huggingface.co/opencv/inpainting_lama',
  sourceRevision: 'aee6d22f0a13e5e35af1c9a1c3afd62841fc6f3f',
  inputSize: 512 as const,
  artifacts: [
    {
      id: 'model' as const,
      fileName: 'inpainting_lama_2025jan.onnx',
      sizeBytes: 92_591_623,
      checksumSha256: '7df918ac3921d3daf0aae1d219776cf0dc4e4935f035af81841b40adcf74fdf2',
    },
    {
      id: 'license' as const,
      fileName: 'LICENSE.txt',
      sizeBytes: 11_347,
      checksumSha256: '0d02d0f518d1b068f383b33e5ee100b7e3609e5022b666f827a64135e9ad7a89',
    },
  ],
};

const selectedFile = (name: string, bytes: Uint8Array) => ({
  name,
  file: { name, arrayBuffer: async () => bytes.buffer },
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.listPacks.mockResolvedValue([]);
  mocks.installPack.mockResolvedValue({ manifest });
  mocks.removePack.mockResolvedValue(true);
  mocks.ask.mockResolvedValue(true);
  mocks.selectFiles.mockResolvedValue({ files: [], error: null });
});

afterEach(cleanup);

describe('InpaintModelPackPanel', () => {
  test('imports only an explicit manifest, model, and license selection', async () => {
    const model = new Uint8Array([1, 2, 3]);
    const license = new TextEncoder().encode('Apache License');
    mocks.selectFiles.mockResolvedValue({
      files: [
        selectedFile('manifest.json', new TextEncoder().encode(JSON.stringify(manifest))),
        selectedFile('inpainting_lama_2025jan.onnx', model),
        selectedFile('LICENSE.txt', license),
      ],
      error: null,
    });
    mocks.listPacks.mockResolvedValueOnce([]).mockResolvedValueOnce([manifest]);

    render(<InpaintModelPackPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Import LaMa pack' }));

    await waitFor(() => expect(mocks.installPack).toHaveBeenCalledTimes(1));
    expect(mocks.installPack.mock.calls[0]![1]).toEqual({
      manifest,
      artifacts: { model: model.buffer, license: license.buffer },
    });
    await waitFor(() =>
      expect(screen.getByText('Local LaMa model installed and checksum verified.')).toBeTruthy(),
    );
    expect(screen.getByText('opencv-inpainting-lama')).toBeTruthy();
  });

  test('rejects a missing license before model storage is called', async () => {
    mocks.selectFiles.mockResolvedValue({
      files: [
        selectedFile('manifest.json', new TextEncoder().encode(JSON.stringify(manifest))),
        selectedFile('inpainting_lama_2025jan.onnx', new Uint8Array([1])),
      ],
      error: null,
    });
    render(<InpaintModelPackPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Import LaMa pack' }));
    await waitFor(() =>
      expect(
        screen.getByText('Select manifest.json, the ONNX model, and LICENSE.txt.'),
      ).toBeTruthy(),
    );
    expect(mocks.installPack).not.toHaveBeenCalled();
  });

  test('requires confirmation before removing the local pack', async () => {
    mocks.listPacks.mockResolvedValueOnce([manifest]).mockResolvedValueOnce([]);
    render(<InpaintModelPackPanel />);
    await waitFor(() => expect(screen.getByText('opencv-inpainting-lama')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(1));
    expect(mocks.removePack).toHaveBeenCalledTimes(1);
  });
});
