'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
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

/** Accessible region correction editor. All edits are written to the sidecar. */
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
  const _ = useTranslation();
  const selected = page.regions.find((region) => region.id === selectedRegionId);
  const effective = selected ? getEffectiveComicRegion(selected) : null;
  const deleted = selected?.manual?.deleted === true;
  const initialText = effective?.text ?? (selected ? getComicRegionSourceText(selected) : '') ?? '';
  const [text, setText] = useState(initialText);
  const [bounds, setBounds] = useState({ left: 0, top: 0, right: 0, bottom: 0 });
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical' | 'mixed'>('horizontal');
  const [language, setLanguage] = useState('');
  const [readingOrder, setReadingOrder] = useState(0);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [fontFamily, setFontFamily] = useState('');
  const [fontSizePx, setFontSizePx] = useState(0);
  const [lineHeight, setLineHeight] = useState(1.2);
  const [paddingPx, setPaddingPx] = useState(4);
  const [fit, setFit] = useState<'shrink' | 'clip' | 'overflow'>('shrink');
  const [color, setColor] = useState('#111827');
  const [outlineColor, setOutlineColor] = useState('');
  const [outlineWidthPx, setOutlineWidthPx] = useState(0);
  const [backgroundColor, setBackgroundColor] = useState('rgba(255,255,255,0.94)');
  const [textAlign, setTextAlign] = useState<'start' | 'center' | 'end'>('start');
  const [writingMode, setWritingMode] = useState<'horizontal-tb' | 'vertical-rl'>('horizontal-tb');

  useEffect(() => {
    setText(effective?.text ?? (selected ? getComicRegionSourceText(selected) : '') ?? '');
    if (effective) {
      const xs = effective.polygon.map((point) => point.x);
      const ys = effective.polygon.map((point) => point.y);
      setBounds({
        left: Math.min(...xs),
        top: Math.min(...ys),
        right: Math.max(...xs),
        bottom: Math.max(...ys),
      });
      setOrientation(effective.orientation);
      setLanguage(effective.language || '');
      setReadingOrder(effective.readingOrder);
      setRotationDeg(effective.rotationDeg || 0);
      const style = effective.overlay?.style;
      setFontFamily(style?.fontFamily || '');
      setFontSizePx(style?.fontSizePx || 0);
      setLineHeight(style?.lineHeight || 1.2);
      setPaddingPx(style?.paddingPx || 4);
      setFit(style?.fit || 'shrink');
      setColor(style?.color || '#111827');
      setOutlineColor(style?.outlineColor || '');
      setOutlineWidthPx(style?.outlineWidthPx || 0);
      setBackgroundColor(style?.backgroundColor || 'rgba(255,255,255,0.94)');
      setTextAlign(style?.textAlign || 'start');
      setWritingMode(style?.writingMode || 'horizontal-tb');
    }
    // The revision timestamp changes whenever the selected region is saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.updatedAt]);

  if (!selected || (!effective && !deleted)) {
    return (
      <section aria-label={_('Comic region editor')} data-comic-region-editor>
        <p>{_('Select an OCR region to correct.')}</p>
      </section>
    );
  }

  if (deleted) {
    return (
      <section aria-label={_('Comic region editor')} data-comic-region-editor>
        <div role='listbox' aria-label={_('Comic OCR regions')}>
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
        <p>{_('This region is deleted.')}</p>
        <div role='group' aria-label={_('Comic region review actions')}>
          <button type='button' onClick={() => onRestore?.(selected.id)}>
            {_('Restore')}
          </button>
          <button type='button' onClick={() => onRevert?.(selected.id)}>
            {_('Revert correction')}
          </button>
        </div>
      </section>
    );
  }
  const saveRegionEdits = () => {
    const left = Math.max(0, Math.min(page.width, Number(bounds.left)));
    const right = Math.max(left, Math.min(page.width, Number(bounds.right)));
    const top = Math.max(0, Math.min(page.height, Number(bounds.top)));
    const bottom = Math.max(top, Math.min(page.height, Number(bounds.bottom)));
    onPatch(selected.id, {
      text: text.trim(),
      polygon: [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ],
      orientation,
      language: language.trim() || undefined,
      readingOrder: Math.max(0, Math.floor(Number(readingOrder) || 0)),
      rotationDeg: Number(rotationDeg) || 0,
      overlayStyle: {
        fontFamily: fontFamily.trim() || undefined,
        fontSizePx: fontSizePx > 0 ? Number(fontSizePx) : undefined,
        lineHeight: Math.max(0.5, Math.min(4, Number(lineHeight) || 1.2)),
        paddingPx: Math.max(0, Math.min(128, Number(paddingPx) || 0)),
        fit,
        color: color.trim() || undefined,
        outlineColor: outlineColor.trim() || undefined,
        outlineWidthPx: Math.max(0, Number(outlineWidthPx) || 0),
        backgroundColor: backgroundColor.trim() || undefined,
        textAlign,
        writingMode,
      },
    });
  };

  return (
    <section aria-label={_('Comic region editor')} data-comic-region-editor>
      <div role='listbox' aria-label={_('Comic OCR regions')}>
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
        {_('OCR text')}
        <textarea
          value={text}
          disabled={deleted}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            if (text.trim()) onPatch(selected.id, { text: text.trim() });
          }}
        />
      </label>
      <fieldset className='space-y-2 rounded border p-2'>
        <legend>{_('Region geometry')}</legend>
        <div className='grid grid-cols-2 gap-2'>
          {(['left', 'top', 'right', 'bottom'] as const).map((key) => (
            <label key={key} className='text-xs'>
              {_(key[0]!.toUpperCase() + key.slice(1))}
              <input
                className='input input-bordered input-xs w-full'
                type='number'
                min={0}
                max={key === 'left' || key === 'right' ? page.width : page.height}
                value={bounds[key]}
                onChange={(event) =>
                  setBounds((current) => ({ ...current, [key]: Number(event.target.value) }))
                }
              />
            </label>
          ))}
          <label className='text-xs'>
            {_('Orientation')}
            <select
              className='select select-bordered select-xs w-full'
              value={orientation}
              onChange={(event) => setOrientation(event.target.value as typeof orientation)}
            >
              <option value='horizontal'>{_('Horizontal')}</option>
              <option value='vertical'>{_('Vertical')}</option>
              <option value='mixed'>{_('Mixed')}</option>
            </select>
          </label>
          <label className='text-xs'>
            {_('Language')}
            <input
              className='input input-bordered input-xs w-full'
              value={language}
              placeholder='ja / en / zh'
              onChange={(event) => setLanguage(event.target.value)}
            />
          </label>
          <label className='text-xs'>
            {_('Reading order')}
            <input
              className='input input-bordered input-xs w-full'
              type='number'
              min={0}
              value={readingOrder}
              onChange={(event) => setReadingOrder(Number(event.target.value))}
            />
          </label>
          <label className='text-xs'>
            {_('Rotation')}
            <input
              className='input input-bordered input-xs w-full'
              type='number'
              min={-360}
              max={360}
              value={rotationDeg}
              onChange={(event) => setRotationDeg(Number(event.target.value))}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className='space-y-2 rounded border p-2'>
        <legend>{_('Typesetting style')}</legend>
        <div className='grid grid-cols-2 gap-2'>
          <label className='text-xs'>
            {_('Font family')}
            <input
              className='input input-bordered input-xs w-full'
              value={fontFamily}
              placeholder='sans-serif'
              onChange={(event) => setFontFamily(event.target.value)}
            />
          </label>
          <label className='text-xs'>
            {_('Font size')}
            <input
              className='input input-bordered input-xs w-full'
              type='number'
              min={0}
              value={fontSizePx}
              onChange={(event) => setFontSizePx(Number(event.target.value))}
            />
          </label>
          <label className='text-xs'>
            {_('Line height')}
            <input
              className='input input-bordered input-xs w-full'
              type='number'
              min={0.5}
              max={4}
              step={0.1}
              value={lineHeight}
              onChange={(event) => setLineHeight(Number(event.target.value))}
            />
          </label>
          <label className='text-xs'>
            {_('Padding')}
            <input
              className='input input-bordered input-xs w-full'
              type='number'
              min={0}
              max={128}
              value={paddingPx}
              onChange={(event) => setPaddingPx(Number(event.target.value))}
            />
          </label>
          <label className='text-xs'>
            {_('Text fit')}
            <select
              className='select select-bordered select-xs w-full'
              value={fit}
              onChange={(event) => setFit(event.target.value as typeof fit)}
            >
              <option value='shrink'>{_('Shrink to fit')}</option>
              <option value='clip'>{_('Clip overflow')}</option>
              <option value='overflow'>{_('Allow overflow')}</option>
            </select>
          </label>
          <label className='text-xs'>
            {_('Outline width')}
            <input
              className='input input-bordered input-xs w-full'
              type='number'
              min={0}
              value={outlineWidthPx}
              onChange={(event) => setOutlineWidthPx(Number(event.target.value))}
            />
          </label>
          <label className='text-xs'>
            {_('Text color')}
            <input
              className='input input-bordered input-xs w-full'
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </label>
          <label className='text-xs'>
            {_('Background color')}
            <input
              className='input input-bordered input-xs w-full'
              value={backgroundColor}
              onChange={(event) => setBackgroundColor(event.target.value)}
            />
          </label>
          <label className='text-xs'>
            {_('Outline color')}
            <input
              className='input input-bordered input-xs w-full'
              value={outlineColor}
              onChange={(event) => setOutlineColor(event.target.value)}
            />
          </label>
          <label className='text-xs'>
            {_('Text alignment')}
            <select
              className='select select-bordered select-xs w-full'
              value={textAlign}
              onChange={(event) => setTextAlign(event.target.value as typeof textAlign)}
            >
              <option value='start'>{_('Start')}</option>
              <option value='center'>{_('Center')}</option>
              <option value='end'>{_('End')}</option>
            </select>
          </label>
          <label className='text-xs'>
            {_('Writing direction')}
            <select
              className='select select-bordered select-xs w-full'
              value={writingMode}
              onChange={(event) => setWritingMode(event.target.value as typeof writingMode)}
            >
              <option value='horizontal-tb'>{_('Horizontal')}</option>
              <option value='vertical-rl'>{_('Vertical CJK')}</option>
            </select>
          </label>
        </div>
      </fieldset>
      <div role='group' aria-label={_('Comic region review actions')}>
        {deleted ? (
          <button type='button' onClick={() => onRestore?.(selected.id)}>
            {_('Restore')}
          </button>
        ) : (
          <>
            <button type='button' onClick={() => onPatch(selected.id, { text: text.trim() })}>
              {_('Save correction')}
            </button>
            <button type='button' onClick={saveRegionEdits}>
              {_('Save geometry and style')}
            </button>
            <button type='button' onClick={() => onApprove?.(selected.id)}>
              {_('Approve region')}
            </button>
            <button type='button' onClick={() => onDelete?.(selected.id)}>
              {_('Delete region')}
            </button>
          </>
        )}
        <button type='button' onClick={() => onRevert?.(selected.id)}>
          {_('Revert correction')}
        </button>
      </div>
    </section>
  );
};

export default ComicRegionEditor;
