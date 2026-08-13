import { describe, expect, test } from 'vitest';
import {
  TRUSTED_OPENCV_LAMA_MANIFEST,
  assertTrustedInpaintModelManifest,
  getInpaintModelPackPaths,
  isTrustedInpaintModelManifest,
  parseInpaintModelManifest,
} from '@/services/translators';

describe('trusted local inpainting model manifest', () => {
  test('accepts only the exact OpenCV LaMa identity, license, revision, sizes, and checksums', () => {
    const trusted = assertTrustedInpaintModelManifest(TRUSTED_OPENCV_LAMA_MANIFEST);
    expect(trusted.id).toBe('opencv-inpainting-lama');
    expect(isTrustedInpaintModelManifest(trusted)).toBe(true);
    for (const mutation of [
      { license: 'unknown' },
      { sourceRevision: 'main' },
      { version: 'latest' },
      {
        artifacts: trusted.artifacts.map((artifact) =>
          artifact.id === 'model' ? { ...artifact, checksumSha256: '0'.repeat(64) } : artifact,
        ),
      },
    ]) {
      expect(() => assertTrustedInpaintModelManifest({ ...trusted, ...mutation })).toThrow(
        'not approved',
      );
    }
  });

  test('rejects unsafe file names and incomplete artifact inventories', () => {
    const trusted = TRUSTED_OPENCV_LAMA_MANIFEST;
    expect(() =>
      parseInpaintModelManifest({
        ...trusted,
        artifacts: trusted.artifacts.map((artifact) =>
          artifact.id === 'model' ? { ...artifact, fileName: '../model.onnx' } : artifact,
        ),
      }),
    ).toThrow('file name');
    expect(() =>
      parseInpaintModelManifest({ ...trusted, artifacts: [trusted.artifacts[0]] }),
    ).toThrow('requires model and license');
  });

  test('constructs bounded data-directory paths from the trusted manifest', () => {
    expect(getInpaintModelPackPaths(TRUSTED_OPENCV_LAMA_MANIFEST)).toEqual({
      manifestPath: 'inpaint-models/opencv-inpainting-lama/2025jan/manifest.json',
      modelPath: 'inpaint-models/opencv-inpainting-lama/2025jan/inpainting_lama_2025jan.onnx',
      licensePath: 'inpaint-models/opencv-inpainting-lama/2025jan/LICENSE.txt',
    });
  });
});
