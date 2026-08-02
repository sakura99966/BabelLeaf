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
}

const PAIRS_PER_PAGE = 100;

/** Render aligned source/translation pairs without modifying the source book. */
const BilingualTranslationView: React.FC<BilingualTranslationViewProps> = ({
  pairs,
  sourceLabel,
  translatedLabel,
  emptyLabel,
  previousLabel,
  nextLabel,
  layout = 'stacked',
}) => {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [pairs.length, pairs[0]?.id]);

  if (pairs.length === 0) {
    return <p className='text-base-content/60 py-4 text-sm'>{emptyLabel}</p>;
  }

  const pageCount = Math.ceil(pairs.length / PAIRS_PER_PAGE);
  const visiblePairs = pairs.slice(page * PAIRS_PER_PAGE, (page + 1) * PAIRS_PER_PAGE);

  return (
    <div className='space-y-3'>
      {visiblePairs.map((pair) => (
        <article
          key={pair.id}
          className={
            layout === 'columns'
              ? 'grid gap-3 rounded-lg border border-base-300 p-3 sm:grid-cols-2'
              : 'rounded-lg border border-base-300 p-3'
          }
        >
          <div className='min-w-0'>
            <div className='text-base-content/60 mb-1 text-xs'>{sourceLabel}</div>
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
            onClick={() => setPage((current) => Math.max(0, current - 1))}
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
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
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
