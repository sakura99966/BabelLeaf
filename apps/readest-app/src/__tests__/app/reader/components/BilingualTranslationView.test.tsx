import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BilingualTranslationView from '@/app/reader/components/BilingualTranslationView';
import type { BilingualTranslationPair } from '@/services/translators';

const makePairs = (count: number, prefix = 'source'): BilingualTranslationPair[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `segment-${index}`,
    sourceText: `${prefix}-${index}`,
    translatedText: `translated-${index}`,
    sourceLang: 'en',
    targetLang: 'zh-CN',
    status: 'translated',
    chapterId: 'chapter-1',
    sourceLocator: 'epubcfi(/6/2)',
  }));

afterEach(() => {
  cleanup();
});

describe('BilingualTranslationView', () => {
  it('restores a logical page and keeps it when text reflows', () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <BilingualTranslationView
        pairs={makePairs(201)}
        sourceLabel='Original'
        translatedLabel='Translated'
        emptyLabel='Empty'
        previousLabel='Previous'
        nextLabel='Next'
        initialPage={1}
        pageKey='book-a:deepseek:zh-CN'
        onPageChange={onPageChange}
      />,
    );

    expect(screen.queryByText('source-0')).toBeNull();
    expect(screen.getByText('source-100')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('source-200')).toBeTruthy();
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    rerender(
      <BilingualTranslationView
        pairs={makePairs(201, 'reflowed')}
        sourceLabel='Original'
        translatedLabel='Translated'
        emptyLabel='Empty'
        previousLabel='Previous'
        nextLabel='Next'
        initialPage={2}
        pageKey='book-a:deepseek:zh-CN'
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByText('reflowed-200')).toBeTruthy();
  });

  it('exposes a stable segment locator for reader navigation', () => {
    const onLocatePair = vi.fn();
    render(
      <BilingualTranslationView
        pairs={makePairs(1)}
        sourceLabel='Original'
        translatedLabel='Translated'
        emptyLabel='Empty'
        previousLabel='Previous'
        nextLabel='Next'
        locateLabel='Locate'
        onLocatePair={onLocatePair}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Locate' }));
    expect(onLocatePair).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'segment-0', sourceLocator: 'epubcfi(/6/2)' }),
    );
    expect(document.querySelector('[data-translation-segment-id="segment-0"]')).toBeTruthy();
  });

  it('supports editing and saving a reviewed translation without changing the source', async () => {
    const onReviewPair = vi.fn(async () => undefined);
    render(
      <BilingualTranslationView
        pairs={makePairs(1)}
        sourceLabel='Original'
        translatedLabel='Translated'
        emptyLabel='Empty'
        previousLabel='Previous'
        nextLabel='Next'
        reviewLabel='Review'
        saveReviewLabel='Save'
        cancelReviewLabel='Cancel'
        onReviewPair={onReviewPair}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    const editor = screen.getByRole('textbox');
    fireEvent.change(editor, { target: { value: '人工校订' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(onReviewPair).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'segment-0',
          sourceText: 'source-0',
        }),
        '人工校订',
      ),
    );
    expect(screen.getByText('source-0')).toBeTruthy();
  });

  it('supports keyboard paging and displays review provenance and machine output', () => {
    const reviewedPair = makePairs(1, 'reviewed')[0]!;
    const pairs = [
      ...makePairs(101),
      {
        ...reviewedPair,
        id: 'reviewed-1',
        status: 'reviewed' as const,
        translatedText: 'edited',
        machineTranslatedText: 'machine',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        glossaryVersion: 4,
      },
    ];
    const { container } = render(
      <BilingualTranslationView
        pairs={pairs}
        sourceLabel='Original'
        translatedLabel='Translated'
        emptyLabel='Empty'
        previousLabel='Previous'
        nextLabel='Next'
        machineTranslationLabel='Machine'
        statusLabel={(status) => status}
        pageKey='provenance'
      />,
    );

    const workspace = container.firstElementChild as HTMLElement;
    workspace.focus();
    fireEvent.keyDown(workspace, { key: 'PageDown' });
    expect(screen.getByText('source-100')).toBeTruthy();
    expect(screen.getByText('reviewed')).toBeTruthy();
    expect(screen.getByText(/Machine: machine/)).toBeTruthy();
    expect(screen.getByText('deepseek/deepseek-v4-flash')).toBeTruthy();
    expect(screen.getByText('G4')).toBeTruthy();
  });
});
