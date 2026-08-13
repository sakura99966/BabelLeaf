import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useFileSelector, type SelectedFile } from '@/hooks/useFileSelector';
import { useTranslation } from '@/hooks/useTranslation';
import {
  installOcrModelPack,
  listOcrModelPacks,
  removeOcrModelPack,
  type OcrModelManifest,
  type OcrModelPackStorage,
} from '@/services/translators';
import { BoxedList, SettingLabel } from './primitives';

const MODEL_IMPORT_EXTENSIONS = [
  'json',
  'onnx',
  'bin',
  'txt',
  'vocab',
  'model',
  'weights',
  'traineddata',
];

const basename = (name: string): string => name.replaceAll('\\', '/').split('/').pop() || name;

const toStorage = (appService: NonNullable<ReturnType<typeof useEnv>['appService']>) =>
  ({
    createDir: appService.createDir.bind(appService),
    readFile: appService.readFile.bind(appService),
    writeFile: appService.writeFile.bind(appService),
    removeFile: appService.deleteFile.bind(appService),
    removeDir: appService.deleteDir.bind(appService),
  }) satisfies OcrModelPackStorage;

const readSelectedFile = async (
  selected: SelectedFile,
  appService: NonNullable<ReturnType<typeof useEnv>['appService']>,
): Promise<{ name: string; bytes: ArrayBuffer }> => {
  if (selected.file) return { name: selected.file.name, bytes: await selected.file.arrayBuffer() };
  if (!selected.path) throw new Error('Selected model file has no local path');
  const file = await appService.openFile(selected.path, 'None');
  return {
    name: selected.name || file.name || basename(selected.path),
    bytes: await file.arrayBuffer(),
  };
};

/** Explicit local model-pack lifecycle. No URL or implicit download is exposed. */
const OcrModelPackPanel: React.FC = () => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { selectFiles } = useFileSelector(appService, _);
  const storage = useMemo(() => (appService ? toStorage(appService) : null), [appService]);
  const [packs, setPacks] = useState<OcrModelManifest[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!storage) return;
    try {
      setPacks(await listOcrModelPacks(storage));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [storage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleImport = async () => {
    if (!storage || !appService) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await selectFiles({
        type: 'generic',
        multiple: true,
        extensions: MODEL_IMPORT_EXTENSIONS,
        accept: MODEL_IMPORT_EXTENSIONS.map((extension) => `.${extension}`).join(', '),
        dialogTitle: _('Import local OCR model pack'),
      });
      if (result.error) throw new Error(result.error);
      if (result.files.length === 0) return;
      const files = await Promise.all(
        result.files.map((file) => readSelectedFile(file, appService)),
      );
      const manifestFile =
        files.find((file) => basename(file.name).toLowerCase() === 'manifest.json') ??
        files.find((file) => file.name.toLowerCase().endsWith('.json'));
      if (!manifestFile)
        throw new Error(_('Select the model manifest JSON and all declared artifacts.'));
      const manifest = JSON.parse(new TextDecoder().decode(manifestFile.bytes)) as unknown;
      const parsed = manifest as Partial<OcrModelManifest>;
      const artifactNames = new Map(
        files
          .filter((file) => file !== manifestFile)
          .map((file) => [basename(file.name), file.bytes]),
      );
      const artifacts = parsed.artifacts
        ? Object.fromEntries(
            parsed.artifacts.map((artifact) => {
              const bytes = artifactNames.get(artifact.fileName);
              if (!bytes) throw new Error(`Missing OCR model artifact: ${artifact.fileName}`);
              return [artifact.id, bytes];
            }),
          )
        : undefined;
      const legacyModel =
        artifactNames.get('model.bin') ||
        (artifactNames.size === 1 ? artifactNames.values().next().value : undefined);
      await installOcrModelPack(storage, {
        manifest: parsed as OcrModelManifest,
        ...(artifacts ? { artifacts } : { modelBytes: legacyModel }),
      });
      await refresh();
      setMessage(_('OCR model pack installed and checksum verified.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (manifest: OcrModelManifest) => {
    if (!storage || !appService) return;
    if (!(await appService.ask(_('Remove this local OCR model pack?')))) return;
    setBusy(true);
    setError(null);
    try {
      await removeOcrModelPack(storage, manifest.id, manifest.version);
      await refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BoxedList
      title={_('Local OCR model packs')}
      description={_(
        'Import a licensed model manifest and its local artifacts. BabelLeaf never downloads OCR models or sends pages to a cloud OCR service.',
      )}
      data-setting-id='settings.ai.ocrModels'
    >
      <div className='space-y-3 py-3 pe-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <button
            className='btn btn-outline btn-sm'
            onClick={() => void handleImport()}
            disabled={busy}
          >
            {busy ? _('Working...') : _('Import model pack')}
          </button>
          <span className='text-base-content/60 text-xs'>
            {packs.length} {packs.length === 1 ? _('installed pack') : _('installed packs')}
          </span>
        </div>
        {message && <p className='text-success text-xs'>{message}</p>}
        {error && <p className='text-error text-xs'>{error}</p>}
        {packs.length > 0 && (
          <ul className='divide-base-300 divide-y rounded-md border'>
            {packs.map((pack) => (
              <li
                key={`${pack.id}:${pack.version}`}
                className='flex items-center justify-between gap-3 p-2 text-xs'
              >
                <div className='min-w-0'>
                  <p className='truncate font-medium'>{pack.id}</p>
                  <p className='text-base-content/60'>
                    v{pack.version} · {pack.runtime} · {pack.languages.join(', ')} · {pack.license}
                  </p>
                </div>
                <button
                  className='btn btn-ghost btn-xs text-error'
                  onClick={() => void handleRemove(pack)}
                  disabled={busy}
                >
                  {_('Remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className='text-base-content/60 flex items-center gap-2 text-xs'>
          <SettingLabel>
            {_(
              'Model quality and license evidence remain the responsibility of the imported pack.',
            )}
          </SettingLabel>
        </p>
      </div>
    </BoxedList>
  );
};

export default OcrModelPackPanel;
