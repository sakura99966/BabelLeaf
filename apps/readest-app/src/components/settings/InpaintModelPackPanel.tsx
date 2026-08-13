import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useFileSelector, type SelectedFile } from '@/hooks/useFileSelector';
import { useTranslation } from '@/hooks/useTranslation';
import {
  installInpaintModelPack,
  listInpaintModelPacks,
  parseInpaintModelManifest,
  removeInpaintModelPack,
  type InpaintModelManifest,
  type InpaintModelPackStorage,
} from '@/services/translators';
import { BoxedList, SettingLabel } from './primitives';

const basename = (name: string): string => name.replaceAll('\\', '/').split('/').pop() || name;

const toStorage = (appService: NonNullable<ReturnType<typeof useEnv>['appService']>) =>
  ({
    createDir: appService.createDir.bind(appService),
    readFile: appService.readFile.bind(appService),
    writeFile: appService.writeFile.bind(appService),
    removeDir: appService.deleteDir.bind(appService),
  }) satisfies InpaintModelPackStorage;

const readSelectedFile = async (
  selected: SelectedFile,
  appService: NonNullable<ReturnType<typeof useEnv>['appService']>,
): Promise<{ name: string; bytes: ArrayBuffer }> => {
  if (selected.file) return { name: selected.file.name, bytes: await selected.file.arrayBuffer() };
  if (!selected.path) throw new Error('Selected inpainting file has no local path');
  const file = await appService.openFile(selected.path, 'None');
  return {
    name: selected.name || file.name || basename(selected.path),
    bytes: await file.arrayBuffer(),
  };
};

/** Explicit import lifecycle for the approved local LaMa pack. */
const InpaintModelPackPanel: React.FC = () => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { selectFiles } = useFileSelector(appService, _);
  const storage = useMemo(() => (appService ? toStorage(appService) : null), [appService]);
  const [packs, setPacks] = useState<InpaintModelManifest[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!storage) return;
    try {
      setPacks(await listInpaintModelPacks(storage));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [storage]);

  useEffect(() => void refresh(), [refresh]);

  const handleImport = async () => {
    if (!storage || !appService) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await selectFiles({
        type: 'generic',
        multiple: true,
        extensions: ['json', 'onnx', 'txt'],
        accept: '.json, .onnx, .txt',
        dialogTitle: _('Import local inpainting model pack'),
      });
      if (result.error) throw new Error(result.error);
      if (result.files.length === 0) return;
      const files = await Promise.all(
        result.files.map((file) => readSelectedFile(file, appService)),
      );
      const manifestFile = files.find(
        (file) => basename(file.name).toLowerCase() === 'manifest.json',
      );
      if (!manifestFile) {
        throw new Error(_('Select manifest.json, the ONNX model, and LICENSE.txt.'));
      }
      const manifest = parseInpaintModelManifest(
        JSON.parse(new TextDecoder().decode(manifestFile.bytes)),
      );
      const fileMap = new Map(
        files
          .filter((file) => file !== manifestFile)
          .map((file) => [basename(file.name), file.bytes]),
      );
      const modelArtifact = manifest.artifacts.find((artifact) => artifact.id === 'model')!;
      const licenseArtifact = manifest.artifacts.find((artifact) => artifact.id === 'license')!;
      const model = fileMap.get(modelArtifact.fileName);
      const license = fileMap.get(licenseArtifact.fileName);
      if (!model || !license) {
        throw new Error(_('Select manifest.json, the ONNX model, and LICENSE.txt.'));
      }
      await installInpaintModelPack(storage, {
        manifest,
        artifacts: { model, license },
      });
      await refresh();
      setMessage(_('Local LaMa model installed and checksum verified.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!storage || !appService) return;
    if (!(await appService.ask(_('Remove the local LaMa inpainting model?')))) return;
    setBusy(true);
    setError(null);
    try {
      await removeInpaintModelPack(storage);
      await refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BoxedList
      title={_('Local comic inpainting model')}
      description={_(
        'Import the approved OpenCV LaMa pack for local text removal. BabelLeaf never downloads the model or uploads page images.',
      )}
      data-setting-id='settings.ai.inpaintModel'
    >
      <div className='space-y-3 py-3 pe-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <button
            className='btn btn-outline btn-sm'
            onClick={() => void handleImport()}
            disabled={busy}
          >
            {busy ? _('Working...') : _('Import LaMa pack')}
          </button>
          {packs.length > 0 && (
            <button
              className='btn btn-ghost btn-sm text-error'
              onClick={() => void handleRemove()}
              disabled={busy}
            >
              {_('Remove')}
            </button>
          )}
        </div>
        {message && <p className='text-success text-xs'>{message}</p>}
        {error && <p className='text-error text-xs'>{error}</p>}
        {packs.map((pack) => (
          <div key={`${pack.id}:${pack.version}`} className='rounded-md border p-2 text-xs'>
            <p className='font-medium'>{pack.id}</p>
            <p className='text-base-content/60'>
              v{pack.version} · {pack.runtime} · {pack.license}
            </p>
          </div>
        ))}
        <p className='text-base-content/60 text-xs'>
          <SettingLabel>
            {_('The model runs only after an explicit comic cleanup or export action.')}
          </SettingLabel>
        </p>
      </div>
    </BoxedList>
  );
};

export default InpaintModelPackPanel;
