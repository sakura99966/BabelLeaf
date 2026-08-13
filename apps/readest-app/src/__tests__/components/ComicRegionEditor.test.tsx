import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import ComicRegionEditor from '@/app/reader/components/ComicRegionEditor';
import type { ComicWorkspacePage } from '@/services/translators';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const page: ComicWorkspacePage = {
  pageId: 'page-1',
  pageIndex: 0,
  width: 1000,
  height: 1500,
  format: 'png',
  localRef: 'Books/book-1/page-1.png',
  updatedAt: 1,
  regions: [
    {
      id: 'region-1',
      pageId: 'page-1',
      source: 'ocr',
      machine: {
        id: 'region-1',
        pageId: 'page-1',
        polygon: [
          { x: 100, y: 200 },
          { x: 400, y: 200 },
          { x: 400, y: 500 },
          { x: 100, y: 500 },
        ],
        orientation: 'horizontal',
        language: 'ja',
        text: '原文',
        readingOrder: 0,
        engine: 'test-ocr',
      },
      machineRevision: 1,
      overlay: {
        style: { fontSizePx: 20, fit: 'shrink', writingMode: 'horizontal-tb' },
        updatedAt: 1,
      },
      reviewStatus: 'unreviewed',
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};

describe('ComicRegionEditor', () => {
  test('shows a correction form and emits bounded geometry and style patches', () => {
    const onPatch = vi.fn();
    const onApprove = vi.fn();
    const onDelete = vi.fn();
    render(
      <ComicRegionEditor
        page={page}
        selectedRegionId='region-1'
        onPatch={onPatch}
        onApprove={onApprove}
        onDelete={onDelete}
      />,
    );

    expect((screen.getByLabelText('OCR text') as HTMLTextAreaElement).value).toBe('原文');
    fireEvent.change(screen.getByLabelText('OCR text'), { target: { value: ' 校正文本 ' } });
    fireEvent.change(screen.getByLabelText('Left'), { target: { value: '-20' } });
    fireEvent.change(screen.getByLabelText('Top'), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Right'), { target: { value: '1200' } });
    fireEvent.change(screen.getByLabelText('Bottom'), { target: { value: '700' } });
    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Writing direction'), {
      target: { value: 'vertical-rl' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save geometry and style' }));

    expect(onPatch).toHaveBeenCalledWith('region-1', {
      text: '校正文本',
      polygon: [
        { x: 0, y: 250 },
        { x: 1000, y: 250 },
        { x: 1000, y: 700 },
        { x: 0, y: 700 },
      ],
      orientation: 'horizontal',
      language: 'ja',
      readingOrder: 0,
      rotationDeg: 0,
      overlayStyle: expect.objectContaining({
        fontSizePx: 24,
        fit: 'shrink',
        writingMode: 'vertical-rl',
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Approve region' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete region' }));
    expect(onApprove).toHaveBeenCalledWith('region-1');
    expect(onDelete).toHaveBeenCalledWith('region-1');
  });

  test('renders the deleted-region recovery actions', () => {
    const onRestore = vi.fn();
    const onRevert = vi.fn();
    const deletedPage: ComicWorkspacePage = {
      ...page,
      regions: [
        {
          ...page.regions[0]!,
          manual: { revision: 2, updatedAt: 2, deleted: true },
          updatedAt: 2,
        },
      ],
    };
    render(
      <ComicRegionEditor
        page={deletedPage}
        selectedRegionId='region-1'
        onPatch={vi.fn()}
        onRestore={onRestore}
        onRevert={onRevert}
      />,
    );

    expect(screen.queryByText('This region is deleted.')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revert correction' }));
    expect(onRestore).toHaveBeenCalledWith('region-1');
    expect(onRevert).toHaveBeenCalledWith('region-1');
    expect(screen.queryByRole('button', { name: 'Save geometry and style' })).toBeNull();
  });
});
