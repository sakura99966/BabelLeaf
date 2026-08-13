import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useFileSelector } from '@/hooks/useFileSelector';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { getLocale } from '@/utils/misc';
import { saveViewSettings } from '@/helpers/settings';
import Dialog from '@/components/Dialog';
import SegmentedControl from '@/components/SegmentedControl';
import BilingualTranslationView from './BilingualTranslationView';
import TranslationGlossaryPanel from './TranslationGlossaryPanel';
import TranslationMemoryPanel from './TranslationMemoryPanel';
import {
  createEmptyTranslationArtifact,
  extractTranslationItems,
  TranslationBatchController,
  TranslationExtractionError,
} from '@/services/translators/batch';
import {
  parseTranslationSidecar,
  serializeTranslationSidecar,
  getInterchangeMimeType,
  getTranslationInterchangeFormat,
  parseReviewInterchange,
  serializeReviewInterchange,
  toTranslationReviewPairs,
  reviewTranslationSegment,
  revertTranslationSegment,
  TRANSLATION_PROMPT_VERSION,
  TranslationArtifactStore,
  TranslationJobStore,
  TranslationGlossaryStore,
  TranslationMemory,
  TranslationMemoryFileStore,
  diagnoseTranslationFormat,
  type BilingualTranslationPair,
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

type WorkbenchTab = 'jobs' | 'review' | 'glossary' | 'memory';
type ReviewStatusFilter = 'all' | 'pending' | 'translated' | 'reviewed' | 'failed';

const getBookHash = (bookKey: string, hash?: string): string => hash || bookKey.split('-')[0] || '';

const TranslationWorkbenchDialog: React.FC<TranslationWorkbenchDialogProps> = ({
  bookKey,
  isOpen,
  onClose,
}) => {
  const _ = useTranslation();
  const { appService, envConfig } = useEnv();
  const { getBookData } = useBookDataStore();
  const { getView, getViewSettings } = useReaderStore();
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
  const jobStore = useMemo(
    () => (appService ? new TranslationJobStore(appService) : null),
    [appService],
  );
  const glossaryStore = useMemo(
    () => (appService ? new TranslationGlossaryStore(appService) : null),
    [appService],
  );
  const memoryStore = useMemo(
    () => (appService ? new TranslationMemoryFileStore(appService) : null),
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
  const [selectedPairId, setSelectedPairId] = useState<string | undefined>(
    viewSettings?.translationWorkbenchSegmentId,
  );
  const [glossary, setGlossary] =
    useState<Awaited<ReturnType<TranslationGlossaryStore['load']>>>(null);
  const [translationMemory, setTranslationMemory] = useState<TranslationMemory | null>(null);
  const [tab, setTab] = useState<WorkbenchTab>('jobs');
  const [reviewStatus, setReviewStatus] = useState<ReviewStatusFilter>('all');
  const [reviewQuery, setReviewQuery] = useState('');
  const [jobs, setJobs] = useState<TranslationJobSnapshot[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [reviewExportFormat, setReviewExportFormat] = useState<'json' | 'tsv' | 'xliff'>('json');

  const refreshJobs = useCallback(async () => {
    if (!jobStore || !bookHash) return;
    setLoadingJobs(true);
    try {
      setJobs(await jobStore.list({ bookHash }));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoadingJobs(false);
    }
  }, [bookHash, jobStore]);

  const updateJob = useCallback((next: TranslationJobSnapshot) => {
    setJobs((current) =>
      [next, ...current.filter((job) => job.id !== next.id)].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    );
  }, []);

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

  useEffect(() => {
    if (!isOpen || !glossaryStore || !memoryStore) return;
    let active = true;
    void Promise.all([glossaryStore.load(), TranslationMemory.load(memoryStore)])
      .then(([loadedGlossary, loadedMemory]) => {
        if (!active) return;
        setGlossary(loadedGlossary);
        setTranslationMemory(loadedMemory);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [glossaryStore, isOpen, memoryStore]);

  useEffect(() => {
    if (!isOpen) return;
    void refreshJobs();
  }, [isOpen, refreshJobs]);

  useEffect(
    () => () => {
      controllerRef.current?.cancel();
      unsubscribeRef.current?.();
    },
    [],
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPairId(viewSettings?.translationWorkbenchSegmentId);
  }, [bookHash, isOpen, provider, targetLang, viewSettings?.translationWorkbenchSegmentId]);

  const handleStart = async (
    requestedScope = scope,
    action: 'start' | 'resume' | 'retry' | 'invalidate' = 'start',
  ) => {
    if (controllerRef.current && snapshot?.status === 'completed') {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      controllerRef.current = null;
      setSnapshot(null);
    }
    if (!artifact || !bookData?.bookDoc) return;
    if (controllerRef.current) {
      setError(_('Another translation job is active. Pause or cancel it before switching jobs.'));
      return;
    }
    setError(null);
    try {
      const items = await extractTranslationItems(bookData.bookDoc, {
        format: bookData.book?.format,
        ...(requestedScope === 'chapter' ? { sectionIndices: [chapterIndex] } : {}),
      });
      if (items.length === 0) {
        setError(_('No translation available.'));
        return;
      }
      const controller = await (jobStore
        ? TranslationBatchController.restore({
            artifact,
            kind: requestedScope,
            bookTitle: bookData.book?.title,
            artifactStore: store ?? undefined,
            jobStore,
            glossary,
            translationMemory: translationMemory ?? undefined,
            ...(action === 'invalidate' ? { invalidateCompleted: true } : {}),
            maxAttempts: 3,
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
          })
        : new TranslationBatchController({
            artifact,
            kind: requestedScope,
            bookTitle: bookData.book?.title,
            artifactStore: store ?? undefined,
            glossary,
            translationMemory: translationMemory ?? undefined,
            ...(action === 'invalidate' ? { invalidateCompleted: true } : {}),
            maxAttempts: 3,
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
          }));
      controllerRef.current = controller;
      unsubscribeRef.current = controller.subscribe((next) => {
        setSnapshot(next);
        updateJob(next);
      });
      const result =
        action === 'resume'
          ? await controller.resume()
          : action === 'retry'
            ? await controller.retryFailed()
            : await controller.start();
      setArtifact(controller.getArtifact());
      setSnapshot(result);
      updateJob(result);
      void refreshJobs();
    } catch (reason: unknown) {
      if (reason instanceof TranslationExtractionError) {
        setError(
          reason.code === 'drm'
            ? diagnoseTranslationFormat(bookData.book?.format || 'unknown', { error: reason })
                .message
            : reason.message,
        );
      } else {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    }
  };

  const handleResume = async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    try {
      const result = await controller.resume();
      setArtifact(controller.getArtifact());
      setSnapshot(result);
      updateJob(result);
      void refreshJobs();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const handleRetry = async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    try {
      const result = await controller.retryFailed();
      setArtifact(controller.getArtifact());
      setSnapshot(result);
      updateJob(result);
      void refreshJobs();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const handleCancel = () => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.cancel();
    const cancelled = controller.getSnapshot();
    setSnapshot(cancelled);
    setArtifact(controller.getArtifact());
    updateJob(cancelled);
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    controllerRef.current = null;
  };

  const handleReviewPair = async (pair: BilingualTranslationPair, translatedText: string) => {
    try {
      const controller = controllerRef.current;
      const updated = controller
        ? await controller.reviewSegment(pair.id, translatedText)
        : artifact
          ? reviewTranslationSegment(artifact, pair.id, translatedText)
          : null;
      if (!updated) throw new Error(_('No translation artifact is loaded.'));
      await store?.save(updated);
      setArtifact(updated);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    }
  };

  const handleApprovePair = async (pair: BilingualTranslationPair) => {
    if (!pair.translatedText.trim()) throw new Error(_('Reviewed translation cannot be empty'));
    await handleReviewPair(pair, pair.translatedText);
  };

  const handleRevertPair = async (pair: BilingualTranslationPair) => {
    try {
      const controller = controllerRef.current;
      const updated = controller
        ? await controller.revertSegment(pair.id)
        : artifact
          ? revertTranslationSegment(artifact, pair.id)
          : null;
      if (!updated) throw new Error(_('No translation artifact is loaded.'));
      await store?.save(updated);
      setArtifact(updated);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    }
  };

  const handleImport = async () => {
    if (!appService) return;
    setError(null);
    try {
      const selection = await selectFiles({
        type: 'generic',
        multiple: false,
        accept:
          'application/json,.json,text/tab-separated-values,.tsv,application/xliff+xml,.xlf,.xliff',
        extensions: ['json', 'tsv', 'xlf', 'xliff'],
        dialogTitle: _('Import Annotations'),
      });
      if (selection.error) throw new Error(selection.error);
      const selected = selection.files[0];
      if (!selected) return;
      const file =
        selected.file || (selected.path ? await appService.openFile(selected.path, 'None') : null);
      if (!file) throw new Error(_('Unable to open book'));
      const payload = await file.text();
      const format = getTranslationInterchangeFormat(
        selected.path || selected.file?.name || 'translation.json',
      );
      const imported =
        format === 'json'
          ? parseTranslationSidecar(JSON.parse(payload))
          : parseReviewInterchange(payload, format as 'tsv' | 'xliff');
      if (imported.bookHash !== bookHash)
        throw new Error('Translation sidecar belongs to another book');
      if (imported.targetLang !== targetLang || imported.provider !== provider) {
        throw new Error('Translation sidecar provider or language does not match current settings');
      }
      await store?.save(imported);
      setArtifact(imported);
      resetController();
      void refreshJobs();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const handleExport = async () => {
    if (!appService || !artifact) return;
    setError(null);
    try {
      const current = controllerRef.current?.getArtifact() || artifact;
      const safeTarget = targetLang.replace(/[^a-zA-Z0-9-]+/g, '_') || 'target';
      const extension = reviewExportFormat === 'xliff' ? 'xlf' : reviewExportFormat;
      const filename =
        reviewExportFormat === 'json'
          ? `BabelLeaf-translation-${bookHash}-${safeTarget}.babelleaf-translation.json`
          : `BabelLeaf-review-${bookHash}-${safeTarget}.${extension}`;
      const content =
        reviewExportFormat === 'json'
          ? serializeTranslationSidecar(current)
          : serializeReviewInterchange(current, reviewExportFormat);
      const saved = await appService.saveFile(filename, content, {
        mimeType: getInterchangeMimeType(reviewExportFormat),
      });
      if (!saved) setError(_('Unable to save file'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const handleDeleteJob = async (job: TranslationJobSnapshot) => {
    if (!jobStore) return;
    if (!(await appService?.ask(_('Delete this translation job record?')))) return;
    try {
      await jobStore.remove(job.id);
      setJobs((current) => current.filter((candidate) => candidate.id !== job.id));
      if (snapshot?.id === job.id) resetController();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const handlePruneJobs = async () => {
    if (!jobStore) return;
    if (!(await appService?.ask(_('Remove old completed translation history?')))) return;
    try {
      await jobStore.prune({ bookHash, keepLatest: 20 });
      await refreshJobs();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const handleJobAction = async (
    job: TranslationJobSnapshot,
    action: 'resume' | 'retry' | 'start' | 'invalidate',
  ) => {
    if (snapshot?.id === job.id && controllerRef.current) {
      if (action === 'retry') return void handleRetry();
      if (action === 'resume') return void handleResume();
      if (action === 'start') {
        try {
          const result = await controllerRef.current.start();
          setArtifact(controllerRef.current.getArtifact());
          setSnapshot(result);
          updateJob(result);
          void refreshJobs();
        } catch (reason: unknown) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
        return;
      }
    }
    await handleStart(job.kind, action);
  };

  const persistWorkbenchPage = useCallback(
    (page: number) => {
      void saveViewSettings(
        envConfig,
        bookKey,
        'translationWorkbenchPage',
        page,
        true,
        false,
      ).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    },
    [bookKey, envConfig],
  );

  const handleLocatePair = useCallback(
    (pair: BilingualTranslationPair) => {
      const view = getView(bookKey);
      if (!view) return;
      if (pair.sourceLocator) {
        view.goTo(pair.sourceLocator);
      } else if (pair.sourceAnchor) {
        // A locator can be absent after an interchange round trip. The
        // structural section anchor still provides a layout-independent
        // landing point; the exact text range is resolved by the reader view.
        view.renderer.goTo({ index: pair.sourceAnchor.sectionIndex });
      } else {
        return;
      }
      setSelectedPairId(pair.id);
      void saveViewSettings(
        envConfig,
        bookKey,
        'translationWorkbenchSegmentId',
        pair.id,
        true,
        false,
      ).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    },
    [bookKey, envConfig, getView],
  );

  const reviewPairs = useMemo(() => {
    const normalized = reviewQuery.trim().toLocaleLowerCase();
    return (artifact ? toTranslationReviewPairs(artifact) : []).filter((pair) => {
      const matchesStatus = reviewStatus === 'all' || pair.status === reviewStatus;
      const matchesQuery =
        !normalized ||
        [pair.sourceText, pair.translatedText, pair.chapterId, pair.error]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(normalized));
      return matchesStatus && matchesQuery;
    });
  }, [artifact, reviewQuery, reviewStatus]);
  const sections = bookData?.bookDoc?.sections ?? [];
  const running = snapshot?.status === 'running' || snapshot?.status === 'queued';
  const paused = snapshot?.status === 'paused';
  const completedCount = snapshot?.completed ?? 0;
  const totalCount = snapshot?.total ?? artifact?.segments.length ?? 0;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;
  const statusLabel = (status: TranslationJobSnapshot['status']) =>
    ({
      queued: _('Queued'),
      running: _('Running'),
      paused: _('Paused'),
      completed: _('Completed'),
      failed: _('Failed'),
      cancelled: _('Cancelled'),
    })[status];
  const segmentStatusLabel = (status: BilingualTranslationPair['status']) =>
    ({
      pending: _('Pending'),
      translated: _('Translated'),
      reviewed: _('Reviewed'),
      failed: _('Failed'),
    })[status];

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
        <SegmentedControl<WorkbenchTab>
          fullWidth
          ariaLabel={_('Translation workspace')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'jobs', label: _('Jobs') },
            { value: 'review', label: _('Review') },
            { value: 'glossary', label: _('Glossary') },
            { value: 'memory', label: _('Memory') },
          ]}
        />

        {tab === 'jobs' && (
          <>
            <div className='flex flex-wrap items-end gap-3'>
              <label className='flex flex-col gap-1 text-xs'>
                <span className='text-base-content/60'>{_('Scope')}</span>
                <select
                  className='select select-bordered select-sm'
                  value={scope}
                  onChange={(event) => setScope(event.target.value as TranslationJobKind)}
                  disabled={Boolean(controllerRef.current && snapshot?.status !== 'completed')}
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
                    disabled={Boolean(controllerRef.current && snapshot?.status !== 'completed')}
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
              <button
                className='btn btn-outline btn-sm'
                onClick={handleExport}
                disabled={!artifact}
              >
                {_('Export')}
              </button>
              <select
                className='select select-bordered select-sm'
                value={reviewExportFormat}
                onChange={(event) =>
                  setReviewExportFormat(event.target.value as typeof reviewExportFormat)
                }
                aria-label='Review export format'
              >
                <option value='json'>JSON</option>
                <option value='tsv'>TSV</option>
                <option value='xliff'>XLIFF</option>
              </select>
              {(!controllerRef.current || snapshot?.status === 'completed') && (
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
              {snapshot?.status === 'failed' && controllerRef.current && (
                <button className='btn btn-warning btn-sm' onClick={() => void handleRetry()}>
                  {_('Retry failed')}
                </button>
              )}
              {(running || paused) && (
                <button className='btn btn-ghost btn-sm' onClick={handleCancel}>
                  {_('Cancel')}
                </button>
              )}
            </div>

            {snapshot && (
              <div className='space-y-2 rounded-lg border border-base-300 p-3'>
                <div className='flex justify-between text-xs'>
                  <span>{statusLabel(snapshot.status)}</span>
                  <span>
                    {completedCount}/{totalCount} ({progress}%) · {snapshot.failed} {_('failed')}
                  </span>
                </div>
                <progress className='progress progress-primary w-full' value={progress} max={100} />
                {snapshot.failed > 0 && (
                  <div className='space-y-1 text-xs'>
                    {snapshot.items
                      .filter((item) => item.status === 'failed')
                      .slice(0, 5)
                      .map((item) => (
                        <p key={item.id} className='text-error break-words'>
                          {item.id}: {item.error || _('Translation failed')}
                        </p>
                      ))}
                  </div>
                )}
              </div>
            )}

            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-2'>
                <h3 className='font-semibold'>{_('Batch jobs')}</h3>
                <div className='flex gap-1'>
                  <button
                    type='button'
                    className='btn btn-ghost btn-xs'
                    onClick={() => void refreshJobs()}
                    disabled={loadingJobs}
                  >
                    {loadingJobs ? _('Loading...') : _('Refresh')}
                  </button>
                  <button
                    type='button'
                    className='btn btn-ghost btn-xs'
                    onClick={() => void handlePruneJobs()}
                    disabled={loadingJobs || jobs.length === 0}
                  >
                    {_('Clean history')}
                  </button>
                </div>
              </div>
              <div className='overflow-x-auto rounded-lg border border-base-300'>
                <table className='table table-zebra table-sm'>
                  <thead>
                    <tr>
                      <th>{_('Scope')}</th>
                      <th>{_('Status')}</th>
                      <th>{_('Progress')}</th>
                      <th>{_('Updated')}</th>
                      <th>{_('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id}>
                        <td>{job.kind === 'book' ? _('Book') : _('Chapter')}</td>
                        <td>
                          <span className='flex flex-wrap gap-1'>
                            <span className='badge badge-ghost badge-sm'>
                              {statusLabel(job.status)}
                            </span>
                            {job.recovered && (
                              <span className='badge badge-warning badge-sm'>{_('Recovered')}</span>
                            )}
                          </span>
                        </td>
                        <td className='text-xs'>
                          {job.completed}/{job.total} · {job.failed} {_('failed')}
                        </td>
                        <td className='text-xs'>{new Date(job.updatedAt).toLocaleString()}</td>
                        <td>
                          <div className='flex flex-wrap gap-1'>
                            {(job.status === 'paused' || job.status === 'queued') && (
                              <button
                                type='button'
                                className='btn btn-primary btn-xs'
                                onClick={() =>
                                  void handleJobAction(
                                    job,
                                    job.status === 'paused' ? 'resume' : 'start',
                                  )
                                }
                              >
                                {_('Resume')}
                              </button>
                            )}
                            {job.status === 'failed' && (
                              <button
                                type='button'
                                className='btn btn-warning btn-xs'
                                onClick={() => void handleJobAction(job, 'retry')}
                              >
                                {_('Retry')}
                              </button>
                            )}
                            {(job.status === 'completed' || job.status === 'failed') && (
                              <button
                                type='button'
                                className='btn btn-ghost btn-xs'
                                onClick={() => setTab('review')}
                              >
                                {_('Review')}
                              </button>
                            )}
                            {job.status === 'completed' && (
                              <button
                                type='button'
                                className='btn btn-ghost btn-xs'
                                onClick={() => void handleJobAction(job, 'invalidate')}
                              >
                                {_('Rerun')}
                              </button>
                            )}
                            {(job.status === 'completed' || job.status === 'cancelled') && (
                              <button
                                type='button'
                                className='btn btn-ghost btn-xs text-error'
                                onClick={() => void handleDeleteJob(job)}
                              >
                                {_('Delete')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {jobs.length === 0 && (
                      <tr>
                        <td colSpan={5} className='text-base-content/60 text-center text-sm'>
                          {_('No batch jobs for this book.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === 'review' && (
          <>
            <div className='flex flex-wrap gap-2'>
              <select
                className='select select-bordered select-sm'
                value={reviewStatus}
                onChange={(event) => setReviewStatus(event.target.value as ReviewStatusFilter)}
                aria-label={_('Review status')}
              >
                <option value='all'>{_('All statuses')}</option>
                <option value='pending'>{_('Pending')}</option>
                <option value='translated'>{_('Translated')}</option>
                <option value='reviewed'>{_('Reviewed')}</option>
                <option value='failed'>{_('Failed')}</option>
              </select>
              <input
                className='input input-bordered input-sm min-w-48 flex-1'
                value={reviewQuery}
                onChange={(event) => setReviewQuery(event.target.value)}
                placeholder={_('Search source, translation, or error')}
                aria-label={_('Search review segments')}
              />
            </div>
            {error && <p className='text-error text-sm'>{error}</p>}
            {loadingArtifact && <p className='text-base-content/60 text-sm'>{_('Loading...')}</p>}
            {!loadingArtifact && artifact && (
              <>
                <p className='text-base-content/60 text-xs'>
                  {_('Provider')}: {artifact.provider}
                  {artifact.model ? `/${artifact.model}` : ''} · {_('Glossary version')}:{' '}
                  {artifact.glossaryVersion ?? _('None')}
                </p>
                <BilingualTranslationView
                  pairs={reviewPairs}
                  sourceLabel={_('Original Text')}
                  translatedLabel={_('Translated Text')}
                  emptyLabel={_('No review segments match the current filter.')}
                  previousLabel={_('Previous')}
                  nextLabel={_('Next')}
                  layout='columns'
                  locateLabel={_('Locate')}
                  initialPage={viewSettings?.translationWorkbenchPage ?? 0}
                  pageKey={`${bookHash}:${provider}:${targetLang}:review:${reviewStatus}:${reviewQuery}`}
                  draftKey={`${bookHash}:${provider}:${targetLang}`}
                  selectedPairId={selectedPairId}
                  onPageChange={persistWorkbenchPage}
                  onLocatePair={handleLocatePair}
                  reviewLabel={_('Edit')}
                  approveLabel={_('Approve')}
                  revertLabel={_('Revert to machine translation')}
                  machineTranslationLabel={_('Machine translation')}
                  draftRecoveredLabel={_('Recovered draft')}
                  saveReviewLabel={_('Save')}
                  cancelReviewLabel={_('Cancel')}
                  onReviewPair={handleReviewPair}
                  onApprovePair={handleApprovePair}
                  onRevertPair={handleRevertPair}
                  statusLabel={segmentStatusLabel}
                  errorLabel={_('Error')}
                />
              </>
            )}
          </>
        )}

        {tab === 'glossary' && (
          <TranslationGlossaryPanel
            appService={appService}
            store={glossaryStore}
            glossary={glossary}
            onChange={setGlossary}
          />
        )}

        {tab === 'memory' && (
          <TranslationMemoryPanel
            appService={appService}
            memory={translationMemory}
            glossaryVersion={glossary?.updatedAt}
            onChange={() => setTranslationMemory((current) => current)}
          />
        )}

        {tab === 'jobs' && error && <p className='text-error text-sm'>{error}</p>}
        {tab === 'jobs' && loadingArtifact && (
          <p className='text-base-content/60 text-sm'>{_('Loading...')}</p>
        )}
      </div>
    </Dialog>
  );
};

export default TranslationWorkbenchDialog;
