import React, { useEffect, useState } from 'react';
import type { BilingualTranslationPair } from '@/services/translators';

interface BilingualTranslationViewProps {
  pairs: BilingualTranslationPair[];
  sourceLabel: string;
  translatedLabel: string;
  emptyLabel: string;
  previousLabel: string;
  nextLabel: string;
  layout?: 'stacked' | 'columns';
  locateLabel?: string;
  initialPage?: number;
  pageKey?: string;
  draftKey?: string;
  selectedPairId?: string;
  onPageChange?: (page: number) => void;
  onLocatePair?: (pair: BilingualTranslationPair) => void;
  reviewLabel?: string;
  approveLabel?: string;
  revertLabel?: string;
  machineTranslationLabel?: string;
  draftRecoveredLabel?: string;
  saveReviewLabel?: string;
  cancelReviewLabel?: string;
  onReviewPair?: (pair: BilingualTranslationPair, translatedText: string) => Promise<void> | void;
  onApprovePair?: (pair: BilingualTranslationPair) => Promise<void> | void;
  onRevertPair?: (pair: BilingualTranslationPair) => Promise<void> | void;
  statusLabel?: (status: BilingualTranslationPair['status']) => string;
  errorLabel?: string;
}

export const BILINGUAL_PAIRS_PER_PAGE = 100;

export const getBilingualPageCount = (pairCount: number): number =>
  Math.max(1, Math.ceil(Math.max(0, pairCount) / BILINGUAL_PAIRS_PER_PAGE));

export const clampBilingualPage = (page: number, pageCount: number): number =>
  Math.max(0, Math.min(Math.max(0, pageCount - 1), Math.floor(Number.isFinite(page) ? page : 0)));

/** Render aligned source/translation pairs without modifying the source book. */
const BilingualTranslationView: React.FC<BilingualTranslationViewProps> = ({
  pairs,
  sourceLabel,
  translatedLabel,
  emptyLabel,
  previousLabel,
  nextLabel,
  layout = 'stacked',
  locateLabel,
  initialPage = 0,
  pageKey = 'default',
  draftKey,
  selectedPairId,
  onPageChange,
  onLocatePair,
  reviewLabel,
  saveReviewLabel,
  cancelReviewLabel,
  onReviewPair,
  onApprovePair,
  onRevertPair,
  approveLabel,
  revertLabel,
  machineTranslationLabel,
  draftRecoveredLabel,
  statusLabel,
  errorLabel,
}) => {
  const pageCount = getBilingualPageCount(pairs.length);
  const [page, setPage] = useState(() => clampBilingualPage(initialPage, pageCount));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [recoveredDrafts, setRecoveredDrafts] = useState<Record<string, string>>({});

  const draftStorageKey = (id: string) =>
    `babelleaf.translation-review-draft:${draftKey ?? pageKey}:${id}`;

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const recovered: Record<string, string> = {};
    for (const pair of pairs) {
      try {
        const value = localStorage.getItem(draftStorageKey(pair.id));
        if (value !== null) recovered[pair.id] = value;
      } catch {
        return;
      }
    }
    setRecoveredDrafts(recovered);
  }, [draftKey, pageKey, pairs]);

  useEffect(() => {
    if (!editingId || typeof localStorage === 'undefined') return;
    try {
      if (draft.trim()) localStorage.setItem(draftStorageKey(editingId), draft);
      else localStorage.removeItem(draftStorageKey(editingId));
    } catch {
      // Draft recovery is best effort and must not block a review save.
    }
  }, [draft, draftKey, editingId, pageKey]);

  useEffect(() => {
    setPage(clampBilingualPage(initialPage, pageCount));
  }, [initialPage, pageCount, pageKey]);

  useEffect(() => {
    setPage((current) => {
      const clamped = clampBilingualPage(current, pageCount);
      if (clamped !== current) onPageChange?.(clamped);
      return clamped;
    });
  }, [onPageChange, pageCount]);

  if (pairs.length === 0) {
    return <p className='text-base-content/60 py-4 text-sm'>{emptyLabel}</p>;
  }

  const visiblePairs = pairs.slice(
    page * BILINGUAL_PAIRS_PER_PAGE,
    (page + 1) * BILINGUAL_PAIRS_PER_PAGE,
  );
  const changePage = (nextPage: number) => {
    const next = clampBilingualPage(nextPage, pageCount);
    setPage(next);
    onPageChange?.(next);
  };

  return (
    <div
      className='space-y-3'
      tabIndex={0}
      onKeyDown={(event) => {
        if (editingId || pageCount <= 1) return;
        if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
          event.preventDefault();
          changePage(page - 1);
        } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
          event.preventDefault();
          changePage(page + 1);
        }
      }}
    >
      {visiblePairs.map((pair) => (
        <article
          key={pair.id}
          data-translation-segment-id={pair.id}
          data-source-locator={pair.sourceLocator}
          className={`${
            layout === 'columns'
              ? 'grid gap-3 rounded-lg border border-base-300 p-3 sm:grid-cols-2'
              : 'rounded-lg border border-base-300 p-3'
          }${selectedPairId === pair.id ? ' ring-2 ring-primary/50' : ''}`}
        >
          <div className='min-w-0'>
            <div className='text-base-content/60 mb-1 flex items-center justify-between gap-2 text-xs'>
              <span className='flex items-center gap-2'>
                <span>{sourceLabel}</span>
                {statusLabel && (
                  <span
                    className='badge badge-ghost badge-xs'
                    data-translation-status={pair.status}
                  >
                    {statusLabel(pair.status)}
                  </span>
                )}
                {pair.provider && (
                  <span className='text-base-content/50' data-translation-provider={pair.provider}>
                    {pair.provider}
                    {pair.model ? `/${pair.model}` : ''}
                  </span>
                )}
                {pair.glossaryVersion !== undefined && (
                  <span
                    className='text-base-content/50'
                    data-translation-glossary-version={pair.glossaryVersion}
                  >
                    G{pair.glossaryVersion}
                  </span>
                )}
                {recoveredDrafts[pair.id] !== undefined && (
                  <span
                    className='badge badge-warning badge-xs'
                    data-translation-draft-recovered='true'
                  >
                    {draftRecoveredLabel ?? 'Draft'}
                  </span>
                )}
              </span>
              {onLocatePair && (
                <button
                  type='button'
                  className='btn btn-ghost btn-xs'
                  onClick={() => onLocatePair(pair)}
                  disabled={!pair.sourceLocator}
                >
                  {locateLabel}
                </button>
              )}
            </div>
            <p className='whitespace-pre-wrap break-words text-sm' lang={pair.sourceLang}>
              {pair.sourceText}
            </p>
          </div>
          <div className='min-w-0'>
            <div className='text-base-content/60 mb-1 flex items-center justify-between gap-2 text-xs'>
              <span>{translatedLabel}</span>
              <span className='flex gap-1'>
                {onApprovePair &&
                  editingId !== pair.id &&
                  pair.translatedText.trim() &&
                  pair.status !== 'reviewed' && (
                    <button
                      type='button'
                      className='btn btn-ghost btn-xs'
                      disabled={savingId === pair.id}
                      onClick={() => {
                        setSavingId(pair.id);
                        void Promise.resolve(onApprovePair(pair))
                          .then(
                            () => {
                              setRecoveredDrafts((current) => {
                                const next = { ...current };
                                delete next[pair.id];
                                return next;
                              });
                              try {
                                localStorage.removeItem(draftStorageKey(pair.id));
                              } catch {
                                // Ignore unavailable local storage.
                              }
                            },
                            () => {
                              // The parent reports the failure.
                            },
                          )
                          .finally(() => setSavingId(null));
                      }}
                    >
                      {approveLabel}
                    </button>
                  )}
                {onReviewPair && editingId !== pair.id && (
                  <button
                    type='button'
                    className='btn btn-ghost btn-xs'
                    onClick={() => {
                      setEditingId(pair.id);
                      setDraft(recoveredDrafts[pair.id] ?? pair.translatedText);
                    }}
                  >
                    {reviewLabel}
                  </button>
                )}
              </span>
            </div>
            {editingId === pair.id ? (
              <div className='space-y-2'>
                <textarea
                  className='textarea textarea-bordered min-h-24 w-full text-sm'
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  lang={pair.targetLang}
                  disabled={savingId === pair.id}
                />
                <div className='flex gap-2'>
                  <button
                    type='button'
                    className='btn btn-primary btn-xs'
                    disabled={!draft.trim() || savingId === pair.id}
                    onClick={() => {
                      if (!onReviewPair) return;
                      setSavingId(pair.id);
                      void Promise.resolve(onReviewPair(pair, draft.trim()))
                        .then(
                          () => {
                            setEditingId(null);
                            setRecoveredDrafts((current) => {
                              const next = { ...current };
                              delete next[pair.id];
                              return next;
                            });
                            try {
                              localStorage.removeItem(draftStorageKey(pair.id));
                            } catch {
                              // Ignore unavailable local storage.
                            }
                          },
                          () => {
                            // The parent reports the failure; keep the editor
                            // open so the user can correct or retry the text.
                          },
                        )
                        .finally(() => setSavingId(null));
                    }}
                  >
                    {saveReviewLabel}
                  </button>
                  <button
                    type='button'
                    className='btn btn-ghost btn-xs'
                    disabled={savingId === pair.id}
                    onClick={() => setEditingId(null)}
                  >
                    {cancelReviewLabel}
                  </button>
                  {onRevertPair &&
                    pair.machineTranslatedText &&
                    pair.machineTranslatedText !== pair.translatedText && (
                      <button
                        type='button'
                        className='btn btn-ghost btn-xs'
                        disabled={savingId === pair.id}
                        onClick={() => {
                          setSavingId(pair.id);
                          void Promise.resolve(onRevertPair(pair))
                            .then(
                              () => {
                                setEditingId(null);
                                setRecoveredDrafts((current) => {
                                  const next = { ...current };
                                  delete next[pair.id];
                                  return next;
                                });
                                try {
                                  localStorage.removeItem(draftStorageKey(pair.id));
                                } catch {
                                  // Ignore unavailable local storage.
                                }
                              },
                              () => {
                                // The parent reports the failure.
                              },
                            )
                            .finally(() => setSavingId(null));
                        }}
                      >
                        {revertLabel}
                      </button>
                    )}
                </div>
              </div>
            ) : (
              <>
                <p className='whitespace-pre-wrap break-words text-sm' lang={pair.targetLang}>
                  {pair.translatedText || '—'}
                </p>
                {pair.machineTranslatedText &&
                  pair.machineTranslatedText !== pair.translatedText && (
                    <p
                      className='text-base-content/50 mt-2 whitespace-pre-wrap break-words text-xs'
                      lang={pair.targetLang}
                    >
                      {machineTranslationLabel ? `${machineTranslationLabel}: ` : ''}
                      {pair.machineTranslatedText}
                    </p>
                  )}
                {pair.error && (
                  <p className='text-error mt-2 text-xs'>
                    {errorLabel ? `${errorLabel}: ` : ''}
                    {pair.error}
                  </p>
                )}
              </>
            )}
          </div>
        </article>
      ))}
      {pageCount > 1 && (
        <div className='flex items-center justify-center gap-3 pt-2 text-sm'>
          <button
            type='button'
            className='btn btn-ghost btn-sm'
            onClick={() => changePage(page - 1)}
            disabled={page === 0}
            aria-label={previousLabel}
          >
            &lt;
          </button>
          <span>
            {page + 1}/{pageCount}
          </span>
          <button
            type='button'
            className='btn btn-ghost btn-sm'
            onClick={() => changePage(page + 1)}
            disabled={page === pageCount - 1}
            aria-label={nextLabel}
          >
            &gt;
          </button>
        </div>
      )}
    </div>
  );
};

export default BilingualTranslationView;
