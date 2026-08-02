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
});
