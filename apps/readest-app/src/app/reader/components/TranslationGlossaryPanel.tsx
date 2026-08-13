import React, { useMemo, useState } from 'react';
import { useFileSelector } from '@/hooks/useFileSelector';
import { useTranslation } from '@/hooks/useTranslation';
import type { AppService } from '@/types/system';
import {
  createTranslationGlossary,
  findGlossaryConflicts,
  getInterchangeMimeType,
  getTranslationInterchangeFormat,
  parseGlossaryInterchange,
  removeGlossaryEntry,
  serializeGlossaryInterchange,
  TranslationGlossaryStore,
  type GlossaryEntry,
  type TranslationGlossary,
  upsertGlossaryEntry,
} from '@/services/translators';

interface TranslationGlossaryPanelProps {
  appService: AppService | null;
  store: TranslationGlossaryStore | null;
  glossary: TranslationGlossary | null;
  onChange: (glossary: TranslationGlossary) => void;
}

type GlossaryDraft = Omit<GlossaryEntry, 'updatedAt'>;

const EMPTY_DRAFT: GlossaryDraft = {
  id: '',
  source: '',
  target: '',
  sourceLang: '',
  targetLang: '',
  caseSensitive: false,
  enabled: true,
  notes: '',
};

const TranslationGlossaryPanel: React.FC<TranslationGlossaryPanelProps> = ({
  appService,
  store,
  glossary,
  onChange,
}) => {
  const _ = useTranslation();
  const { selectFiles } = useFileSelector(appService, _);
  const [draft, setDraft] = useState<GlossaryDraft>(EMPTY_DRAFT);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'tsv' | 'tbx'>('json');

  const entries = glossary?.entries ?? [];
  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) =>
      [entry.source, entry.target, entry.sourceLang, entry.targetLang, entry.notes]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalized)),
    );
  }, [entries, query]);

  const updateDraft = <K extends keyof GlossaryDraft>(key: K, value: GlossaryDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  };

  const saveEntry = async () => {
    if (!store) {
      setError(_('Storage is not available.'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const base = glossary ?? createTranslationGlossary([]);
      const next = upsertGlossaryEntry(base, {
        ...draft,
        id: editingId ?? draft.id,
      });
      const conflicts = findGlossaryConflicts(next);
      if (conflicts.length > 0) {
        setError(
          _('Duplicate glossary source term for the same language direction: {{source}}', {
            source: conflicts.map((conflict) => conflict.source).join(', '),
          }),
        );
        return;
      }
      await store.save(next);
      onChange(next);
      resetDraft();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const editEntry = (entry: GlossaryEntry) => {
    setEditingId(entry.id);
    setDraft({
      id: entry.id,
      source: entry.source,
      target: entry.target,
      sourceLang: entry.sourceLang ?? '',
      targetLang: entry.targetLang ?? '',
      caseSensitive: entry.caseSensitive ?? false,
      enabled: entry.enabled !== false,
      notes: entry.notes ?? '',
    });
    setError(null);
  };

  const deleteEntry = async (entry: GlossaryEntry) => {
    if (!store || !glossary) return;
    if (!(await appService?.ask(_('Delete this glossary entry?')))) return;
    try {
      const next = removeGlossaryEntry(glossary, entry.id);
      await store.save(next);
      onChange(next);
      if (editingId === entry.id) resetDraft();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const importGlossary = async () => {
    if (!appService || !store) return;
    setError(null);
    try {
      const selection = await selectFiles({
        type: 'generic',
        multiple: false,
        accept: 'application/json,.json,text/tab-separated-values,.tsv,application/x-tbx,.tbx',
        extensions: ['json', 'tsv', 'tbx'],
        dialogTitle: _('Import glossary'),
      });
      if (selection.error) throw new Error(selection.error);
      const selected = selection.files[0];
      if (!selected) return;
      const file =
        selected.file || (selected.path ? await appService.openFile(selected.path, 'None') : null);
      if (!file) throw new Error(_('Unable to open selected file.'));
      const payload = await file.text();
      const format = getTranslationInterchangeFormat(
        selected.path || selected.file?.name || 'glossary.json',
      );
      const imported = parseGlossaryInterchange(payload, format as 'json' | 'tsv' | 'tbx');
      const conflicts = findGlossaryConflicts(imported);
      if (conflicts.length > 0) {
        throw new Error(
          _('Imported glossary contains duplicate source terms: {{source}}', {
            source: conflicts.map((conflict) => conflict.source).join(', '),
          }),
        );
      }
      await store.save(imported);
      onChange(imported);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const exportGlossary = async () => {
    if (!appService || !glossary) return;
    setError(null);
    try {
      const extension = exportFormat === 'tbx' ? 'tbx' : exportFormat;
      const saved = await appService.saveFile(
        `BabelLeaf-glossary.${extension}`,
        serializeGlossaryInterchange(glossary, exportFormat),
        { mimeType: getInterchangeMimeType(exportFormat) },
      );
      if (!saved) setError(_('Unable to save file'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <section className='space-y-3' aria-label={_('Glossary')}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h3 className='font-semibold'>{_('Glossary')}</h3>
          <p className='text-base-content/60 text-xs'>
            {entries.length} {_('entries')} · {_('Version')} {glossary?.updatedAt ?? '—'} ·{' '}
            {_('Changes are stored locally.')}
          </p>
        </div>
        <div className='flex gap-2'>
          <button
            type='button'
            className='btn btn-outline btn-xs'
            onClick={() => void importGlossary()}
          >
            {_('Import')}
          </button>
          <button
            type='button'
            className='btn btn-outline btn-xs'
            onClick={() => void exportGlossary()}
            disabled={!glossary || entries.length === 0}
          >
            {_('Export')}
          </button>
          <select
            className='select select-bordered select-xs'
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value as typeof exportFormat)}
            aria-label='Glossary export format'
          >
            <option value='json'>JSON</option>
            <option value='tsv'>TSV</option>
            <option value='tbx'>TBX</option>
          </select>
        </div>
      </div>

      <div className='grid gap-2 sm:grid-cols-2'>
        <input
          className='input input-bordered input-sm w-full'
          value={draft.source}
          onChange={(event) => updateDraft('source', event.target.value)}
          placeholder={_('Source term')}
          aria-label={_('Source term')}
        />
        <input
          className='input input-bordered input-sm w-full'
          value={draft.target}
          onChange={(event) => updateDraft('target', event.target.value)}
          placeholder={_('Target term')}
          aria-label={_('Target term')}
        />
        <input
          className='input input-bordered input-sm w-full'
          value={draft.sourceLang}
          onChange={(event) => updateDraft('sourceLang', event.target.value)}
          placeholder={_('Source language (optional)')}
          aria-label={_('Source language')}
        />
        <input
          className='input input-bordered input-sm w-full'
          value={draft.targetLang}
          onChange={(event) => updateDraft('targetLang', event.target.value)}
          placeholder={_('Target language (optional)')}
          aria-label={_('Target language')}
        />
      </div>
      <textarea
        className='textarea textarea-bordered min-h-16 w-full text-sm'
        value={draft.notes}
        onChange={(event) => updateDraft('notes', event.target.value)}
        placeholder={_('Notes (optional)')}
        aria-label={_('Notes')}
      />
      <div className='flex flex-wrap items-center gap-4 text-xs'>
        <label className='flex items-center gap-2'>
          <input
            type='checkbox'
            className='checkbox checkbox-sm'
            checked={draft.caseSensitive}
            onChange={(event) => updateDraft('caseSensitive', event.target.checked)}
          />
          {_('Case sensitive')}
        </label>
        <label className='flex items-center gap-2'>
          <input
            type='checkbox'
            className='checkbox checkbox-sm'
            checked={draft.enabled}
            onChange={(event) => updateDraft('enabled', event.target.checked)}
          />
          {_('Enabled')}
        </label>
        <button
          type='button'
          className='btn btn-primary btn-xs'
          onClick={() => void saveEntry()}
          disabled={saving || !draft.source.trim() || !draft.target.trim()}
        >
          {editingId ? _('Save changes') : _('Add entry')}
        </button>
        {editingId && (
          <button type='button' className='btn btn-ghost btn-xs' onClick={resetDraft}>
            {_('Cancel')}
          </button>
        )}
      </div>

      <input
        className='input input-bordered input-sm w-full'
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={_('Search glossary')}
        aria-label={_('Search glossary')}
      />

      {error && <p className='text-error text-sm'>{error}</p>}
      <div className='overflow-x-auto rounded-lg border border-base-300'>
        <table className='table table-zebra table-sm'>
          <thead>
            <tr>
              <th>{_('Source')}</th>
              <th>{_('Target')}</th>
              <th>{_('Direction')}</th>
              <th>{_('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.map((entry) => (
              <tr key={entry.id}>
                <td className='max-w-48 whitespace-pre-wrap break-words'>{entry.source}</td>
                <td className='max-w-48 whitespace-pre-wrap break-words'>{entry.target}</td>
                <td className='text-xs'>
                  {entry.sourceLang || '*'} → {entry.targetLang || '*'}
                  {entry.enabled === false && (
                    <span className='badge badge-ghost badge-xs ms-1'>{_('Disabled')}</span>
                  )}
                </td>
                <td>
                  <div className='flex gap-1'>
                    <button
                      type='button'
                      className='btn btn-ghost btn-xs'
                      onClick={() => editEntry(entry)}
                    >
                      {_('Edit')}
                    </button>
                    <button
                      type='button'
                      className='btn btn-ghost btn-xs text-error'
                      onClick={() => void deleteEntry(entry)}
                    >
                      {_('Delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleEntries.length === 0 && (
              <tr>
                <td colSpan={4} className='text-base-content/60 text-center text-sm'>
                  {_('No glossary entries.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default TranslationGlossaryPanel;
