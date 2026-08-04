import React, { useMemo, useState } from 'react';
import { useFileSelector } from '@/hooks/useFileSelector';
import { useTranslation } from '@/hooks/useTranslation';
import type { AppService } from '@/types/system';
import {
  parseTranslationMemory,
  type TranslationMemory,
  type TranslationMemoryData,
} from '@/services/translators';

interface TranslationMemoryPanelProps {
  appService: AppService | null;
  memory: TranslationMemory | null;
  glossaryVersion?: number;
  onChange: () => void;
}

const TranslationMemoryPanel: React.FC<TranslationMemoryPanelProps> = ({
  appService,
  memory,
  glossaryVersion,
  onChange,
}) => {
  const _ = useTranslation();
  const { selectFiles } = useFileSelector(appService, _);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const entries = useMemo(() => memory?.snapshot().entries ?? [], [memory, revision]);
  const stats = memory?.getStats();
  const invalidatedCount = glossaryVersion
    ? entries.filter(
        (entry) => entry.glossaryVersion !== undefined && entry.glossaryVersion !== glossaryVersion,
      ).length
    : 0;
  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) =>
      [
        entry.sourceText,
        entry.translatedText,
        entry.sourceLang,
        entry.targetLang,
        entry.provider,
        entry.model,
        entry.glossaryVersion === undefined ? '' : String(entry.glossaryVersion),
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(normalized)),
    );
  }, [entries, query]);

  const refresh = () => {
    setRevision((current) => current + 1);
    onChange();
  };

  const importMemory = async () => {
    if (!appService || !memory) return;
    setError(null);
    const selection = await selectFiles({
      type: 'generic',
      multiple: false,
      accept: 'application/json,.json',
      extensions: ['json'],
      dialogTitle: _('Import translation memory'),
    });
    const selected = selection.files[0];
    if (!selected) return;
    try {
      const file =
        selected.file || (selected.path ? await appService.openFile(selected.path, 'None') : null);
      if (!file) throw new Error(_('Unable to open selected file.'));
      const imported = parseTranslationMemory(JSON.parse(await file.text()));
      await memory.replace(imported);
      refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const exportMemory = async () => {
    if (!appService || !memory || entries.length === 0) return;
    const data: TranslationMemoryData = memory.snapshot();
    const saved = await appService.saveFile(
      'BabelLeaf-translation-memory.json',
      JSON.stringify(data, null, 2),
      { mimeType: 'application/json' },
    );
    if (!saved) setError(_('Unable to save file'));
  };

  const deleteEntry = async (key: string) => {
    if (!memory) return;
    if (!(await appService?.ask(_('Delete this translation memory entry?')))) return;
    try {
      await memory.remove(key);
      refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const clearMemory = async () => {
    if (!memory || entries.length === 0) return;
    if (!(await appService?.ask(_('Clear all translation memory entries?')))) return;
    try {
      await memory.clear();
      refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <section className='space-y-3' aria-label={_('Translation memory')}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h3 className='font-semibold'>{_('Translation memory')}</h3>
          <p className='text-base-content/60 text-xs'>
            {entries.length}/{stats?.limit ?? '—'} {_('entries')} ·{' '}
            {_('Hits are updated when a cached translation is reused.')}
            {invalidatedCount > 0 &&
              ` · ${invalidatedCount} ${_('entries use an older glossary version')}`}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <button
            type='button'
            className='btn btn-outline btn-xs'
            onClick={() => void importMemory()}
          >
            {_('Import')}
          </button>
          <button
            type='button'
            className='btn btn-outline btn-xs'
            onClick={() => void exportMemory()}
            disabled={entries.length === 0}
          >
            {_('Export')}
          </button>
          <button
            type='button'
            className='btn btn-ghost btn-xs text-error'
            onClick={() => void clearMemory()}
            disabled={entries.length === 0}
          >
            {_('Clear all')}
          </button>
        </div>
      </div>
      <input
        className='input input-bordered input-sm w-full'
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={_('Search translation memory')}
        aria-label={_('Search translation memory')}
      />
      {error && <p className='text-error text-sm'>{error}</p>}
      <div className='overflow-x-auto rounded-lg border border-base-300'>
        <table className='table table-zebra table-sm'>
          <thead>
            <tr>
              <th>{_('Source')}</th>
              <th>{_('Translation')}</th>
              <th>{_('Provider')}</th>
              <th>{_('Glossary')}</th>
              <th>{_('Hits')}</th>
              <th>{_('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.map((entry) => (
              <tr key={entry.key}>
                <td className='max-w-48 whitespace-pre-wrap break-words'>{entry.sourceText}</td>
                <td className='max-w-48 whitespace-pre-wrap break-words'>{entry.translatedText}</td>
                <td className='text-xs'>
                  {entry.provider} · {entry.sourceLang} → {entry.targetLang}
                </td>
                <td className='text-xs'>{entry.glossaryVersion ?? '—'}</td>
                <td className='text-xs'>{entry.hits}</td>
                <td>
                  <button
                    type='button'
                    className='btn btn-ghost btn-xs text-error'
                    onClick={() => void deleteEntry(entry.key)}
                  >
                    {_('Delete')}
                  </button>
                </td>
              </tr>
            ))}
            {visibleEntries.length === 0 && (
              <tr>
                <td colSpan={6} className='text-base-content/60 text-center text-sm'>
                  {_('No translation memory entries.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default TranslationMemoryPanel;
