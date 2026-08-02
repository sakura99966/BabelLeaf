import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useFileSelector } from '@/hooks/useFileSelector';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { getLocale } from '@/utils/misc';
import Dialog from '@/components/Dialog';
import BilingualTranslationView from './BilingualTranslationView';
import {
  createEmptyTranslationArtifact,
  extractTranslationItems,
  TranslationBatchController,
} from '@/services/translators/batch';
import {
  parseTranslationSidecar,
  serializeTranslationSidecar,
  toBilingualTranslationResult,
  TRANSLATION_PROMPT_VERSION,
  TranslationArtifactStore,
  type TranslationArtifact,
  type TranslationJobKind,
  type TranslationJobSnapshot,
  type TranslatorName,
} from '@/services/translators';
import { useTranslator } from '@/hooks/useTranslator';

interface TranslationWorkbenchDialogProps {
  bookKey: string;
  isOpen: boolean;
  onClose: () => void;
}

const getBookHash = (bookKey: string, hash?: string): string => hash || bookKey.split('-')[0] || '';

const TranslationWorkbenchDialog: React.FC<TranslationWorkbenchDialogProps> = ({
  bookKey,
  isOpen,
  onClose,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { getBookData } = useBookDataStore();
  const { getViewSettings } = useReaderStore();
  const { selectFiles } = useFileSelector(appService, _);
  const bookData = getBookData(bookKey);
  const viewSettings = getViewSettings(bookKey);
  const provider = (viewSettings?.translationProvider || 'deepseek') as TranslatorName;
  const targetLang = viewSettings?.translateTargetLang || getLocale();
  const sourceLang = bookData?.book?.primaryLanguage || 'AUTO';
  const bookHash = getBookHash(bookKey, bookData?.book?.hash);
  const store = useMemo(
    () => (appService ? new TranslationArtifactStore(appService) : null),
    [appService],
  );
  const { translate } = useTranslator({ provider, sourceLang, targetLang });
  const controllerRef = useRef<TranslationBatchController | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [artifact, setArtifact] = useState<TranslationArtifact | null>(null);
  const [snapshot, setSnapshot] = useState<TranslationJobSnapshot | null>(null);
  const [scope, setScope] = useState<TranslationJobKind>('book');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [loadingArtifact, setLoadingArtifact] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetController = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    controllerRef.current = null;
    setSnapshot(null);
  }, []);

  useEffect(() => {
    if (!isOpen || !store || !bookHash) return;
    let active = true;
    setLoadingArtifact(true);
    setError(null);
    resetController();
    void store
      .load({ bookHash, provider, targetLang })
      .then((saved) => {
        if (!active) return;
        setArtifact(
          saved ??
            createEmptyTranslationArtifact({
              bookHash,
              provider,
              sourceLang,
              targetLang,
              promptVersion: TRANSLATION_PROMPT_VERSION,
            }),
        );
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoadingArtifact(false);
      });
    return () => {
      active = false;
    };
  }, [bookHash, isOpen, provider, resetController, sourceLang, store, targetLang]);

  useEffect(
    () => () => {
      controllerRef.current?.cancel();
      unsubscribeRef.current?.();
    },
    [],
  );

  const handleStart = async () => {
    if (!artifact || !bookData?.bookDoc || controllerRef.current) return;
    setError(null);
    try {
      const items = await extractTranslationItems(bookData.bookDoc, {
        ...(scope === 'chapter' ? { sectionIndices: [chapterIndex] } : {}),
      });
      if (items.length === 0) {
        setError(_('No translation available.'));
        return;
      }
      const controller = new TranslationBatchController({
        artifact,
        kind: scope,
        artifactStore: store ?? undefined,
        concurrency: 2,
        items,
        translate: async (item, signal) => {
          const translated = await translate([item.text], {
            source: artifact.sourceLang,
            target: artifact.targetLang,
            useCache: true,
            signal,
          });
          return translated[0] || '';
        },
      });
      controllerRef.current = controller;
      unsubscribeRef.current = controller.subscribe((next) => setSnapshot(next));
      const result = await controller.start();
      setArtifact(controller.getArtifact());
      setSnapshot(result);
      if (result.status === 'completed' || result.status === 'failed') {
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        controllerRef.current = null;
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const handleResume = async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    try {
      const result = await controller.resume();
      setArtifact(controller.getArtifact());
      setSnapshot(result);
      if (result.status === 'completed' || result.status === 'failed') {
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        controllerRef.current = null;
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const handleCancel = () => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.cancel();
    setSnapshot(controller.getSnapshot());
    setArtifact(controller.getArtifact());
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    controllerRef.current = null;
  };

  const handleImport = async () => {
    if (!appService) return;
    setError(null);
    const selection = await selectFiles({
      type: 'generic',
      multiple: false,
      accept: 'application/json,.json',
      extensions: ['json'],
      dialogTitle: _('Import Annotations'),
    });
    const selected = selection.files[0];
    if (!selected) return;
    try {
      const file =
        selected.file || (selected.path ? await appService.openFile(selected.path, 'None') : null);
      if (!file) throw new Error(_('Unable to open book'));
      const imported = parseTranslationSidecar(JSON.parse(await file.text()));
      if (imported.bookHash !== bookHash)
        throw new Error('Translation sidecar belongs to another book');
      if (imported.targetLang !== targetLang || imported.provider !== provider) {
        throw new Error('Translation sidecar provider or language does not match current settings');
      }
      await store?.save(imported);
      setArtifact(imported);
      resetController();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const handleExport = async () => {
    if (!appService || !artifact) return;
    setError(null);
    const current = controllerRef.current?.getArtifact() || artifact;
    const safeTarget = targetLang.replace(/[^a-zA-Z0-9-]+/g, '_') || 'target';
    const filename = `BabelLeaf-translation-${bookHash}-${safeTarget}.babelleaf-translation.json`;
    const saved = await appService.saveFile(filename, serializeTranslationSidecar(current), {
      mimeType: 'application/json',
    });
    if (!saved) setError(_('Unable to save file'));
  };

  const bilingual = artifact ? toBilingualTranslationResult(artifact) : null;
  const sections = bookData?.bookDoc?.sections ?? [];
  const running = snapshot?.status === 'running' || snapshot?.status === 'queued';
  const paused = snapshot?.status === 'paused';
  const completedCount = snapshot?.completed ?? 0;
  const totalCount = snapshot?.total ?? artifact?.segments.length ?? 0;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={_('Translation')}
      snapHeight={0.85}
      boxClassName='sm:!min-w-[680px]'
      useOverlayScroll
    >
      <div className='space-y-4 pb-4'>
        <div className='flex flex-wrap items-end gap-3'>
          <label className='flex flex-col gap-1 text-xs'>
            <span className='text-base-content/60'>{_('Scope')}</span>
            <select
              className='select select-bordered select-sm'
              value={scope}
              onChange={(event) => setScope(event.target.value as TranslationJobKind)}
              disabled={Boolean(controllerRef.current)}
            >
              <option value='book'>{_('Book')}</option>
              <option value='chapter'>{_('Chapter')}</option>
            </select>
          </label>
          {scope === 'chapter' && (
            <label className='flex min-w-48 flex-col gap-1 text-xs'>
              <span className='text-base-content/60'>{_('Chapter')}</span>
              <select
                className='select select-bordered select-sm'
                value={chapterIndex}
                onChange={(event) => setChapterIndex(Number(event.target.value))}
                disabled={Boolean(controllerRef.current)}
              >
                {sections.map((section, index) => (
                  <option
                    key={`${section.id}-${index}`}
                    value={index}
                    disabled={section.linear === 'no'}
                  >
                    {section.id || `${_('Chapter')} ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <button className='btn btn-outline btn-sm' onClick={handleImport} disabled={running}>
            {_('Import')}
          </button>
          <button className='btn btn-outline btn-sm' onClick={handleExport} disabled={!artifact}>
            {_('Export')}
          </button>
          {!controllerRef.current && (
            <button
              className='btn btn-primary btn-sm'
              onClick={() => void handleStart()}
              disabled={loadingArtifact || !artifact}
            >
              {_('Start')}
            </button>
          )}
          {running && (
            <button
              className='btn btn-outline btn-sm'
              onClick={() => controllerRef.current?.pause()}
            >
              {_('Pause')}
            </button>
          )}
          {paused && (
            <button className='btn btn-primary btn-sm' onClick={() => void handleResume()}>
              {_('Resume')}
            </button>
          )}
          {(running || paused) && (
            <button className='btn btn-ghost btn-sm' onClick={handleCancel}>
              {_('Cancel')}
            </button>
          )}
        </div>

        {snapshot && (
          <div className='space-y-1'>
            <div className='flex justify-between text-xs'>
              <span>{snapshot.status}</span>
              <span>
                {completedCount}/{totalCount} ({progress}%)
              </span>
            </div>
            <progress className='progress progress-primary w-full' value={progress} max={100} />
          </div>
        )}

        {error && <p className='text-error text-sm'>{error}</p>}
        {loadingArtifact && <p className='text-base-content/60 text-sm'>{_('Loading...')}</p>}
        {!loadingArtifact && bilingual && (
          <BilingualTranslationView
            pairs={bilingual.pairs}
            sourceLabel={_('Original Text')}
            translatedLabel={_('Translated Text')}
            emptyLabel={_('No translation available.')}
            previousLabel={_('Previous')}
            nextLabel={_('Next')}
            layout='columns'
          />
        )}
      </div>
    </Dialog>
  );
};

export default TranslationWorkbenchDialog;
