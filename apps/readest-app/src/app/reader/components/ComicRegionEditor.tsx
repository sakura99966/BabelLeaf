'use client';

import React, { useEffect, useState } from 'react';
import {
  getComicRegionSourceText,
  getEffectiveComicRegion,
  type ComicRegionPatch,
  type ComicWorkspacePage,
} from '@/services/translators';

export interface ComicRegionEditorProps {
  page: ComicWorkspacePage;
  selectedRegionId?: string;
  onSelect?: (regionId: string) => void;
  onPatch: (regionId: string, patch: ComicRegionPatch) => void;
  onDelete?: (regionId: string) => void;
  onRestore?: (regionId: string) => void;
  onApprove?: (regionId: string) => void;
  onRevert?: (regionId: string) => void;
}

/** Accessible region correction primitive; geometry tools remain sidecar-driven. */
const ComicRegionEditor: React.FC<ComicRegionEditorProps> = ({
  page,
  selectedRegionId,
  onSelect,
  onPatch,
  onDelete,
  onRestore,
  onApprove,
  onRevert,
}) => {
  const selected = page.regions.find((region) => region.id === selectedRegionId);
  const effective = selected ? getEffectiveComicRegion(selected) : null;
  const initialText = effective?.text ?? (selected ? getComicRegionSourceText(selected) : '') ?? '';
  const [text, setText] = useState(initialText);

  useEffect(() => {
    setText(effective?.text ?? (selected ? getComicRegionSourceText(selected) : '') ?? '');
  }, [effective?.text, selected]);

  if (!selected || !effective) {
    return (
      <section aria-label='Comic region editor' data-comic-region-editor>
        <p>Select an OCR region to correct.</p>
      </section>
    );
  }

  const deleted = selected.manual?.deleted === true;
  return (
    <section aria-label='Comic region editor' data-comic-region-editor>
      <div role='listbox' aria-label='Comic OCR regions'>
        {page.regions.map((region) => (
          <button
            key={region.id}
            type='button'
            role='option'
            aria-selected={region.id === selected.id}
            onClick={() => onSelect?.(region.id)}
          >
            {region.id}
          </button>
        ))}
      </div>
      <label>
        OCR text
        <textarea
          value={text}
          disabled={deleted}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            if (text.trim()) onPatch(selected.id, { text: text.trim() });
          }}
        />
      </label>
      <div role='group' aria-label='Comic region review actions'>
        {deleted ? (
          <button type='button' onClick={() => onRestore?.(selected.id)}>
            Restore
          </button>
        ) : (
          <>
            <button type='button' onClick={() => onPatch(selected.id, { text: text.trim() })}>
              Save correction
            </button>
            <button type='button' onClick={() => onApprove?.(selected.id)}>
              Approve region
            </button>
            <button type='button' onClick={() => onDelete?.(selected.id)}>
              Delete region
            </button>
          </>
        )}
        <button type='button' onClick={() => onRevert?.(selected.id)}>
          Revert correction
        </button>
      </div>
    </section>
  );
};

export default ComicRegionEditor;
