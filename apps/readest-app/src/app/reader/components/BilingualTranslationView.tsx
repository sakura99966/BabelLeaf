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
  selectedPairId?: string;
  onPageChange?: (page: number) => void;
  onLocatePair?: (pair: BilingualTranslationPair) => void;
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
  selectedPairId,
  onPageChange,
  onLocatePair,
}) => {
  const pageCount = getBilingualPageCount(pairs.length);
  const [page, setPage] = useState(() => clampBilingualPage(initialPage, pageCount));

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
    <div className='space-y-3'>
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
              <span>{sourceLabel}</span>
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
            <div className='text-base-content/60 mb-1 text-xs'>{translatedLabel}</div>
            <p className='whitespace-pre-wrap break-words text-sm' lang={pair.targetLang}>
              {pair.translatedText}
            </p>
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
