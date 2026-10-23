import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ComicTranslationOverlay from '@/app/reader/components/ComicTranslationOverlay';
import { createPerformanceWorkspace } from '../../fixtures/performanceFixtures';

afterEach(cleanup);

it('renders current translations, filters stale regions and preserves region clicks', () => {
  const onRegionSelect = vi.fn();
  const page = createPerformanceWorkspace().pages[0]!;
  const { container, rerender } = render(
    <ComicTranslationOverlay page={page} onRegionSelect={onRegionSelect} />,
  );
  const buttons = container.querySelectorAll('[data-comic-region]');
  expect(buttons).toHaveLength(45);
  fireEvent.click(buttons[0]!);
  expect(onRegionSelect).toHaveBeenCalledWith('page-0-region-1');
  rerender(<ComicTranslationOverlay page={page} visible={false} />);
  expect(container.querySelector('[data-comic-overlay-page]')).toBeNull();
});

it('does not eagerly import every model and provider through the translation barrel', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/app/reader/components/ComicTranslationOverlay.tsx'),
    'utf8',
  );
  expect(source).not.toMatch(/from ['"]@\/services\/translators['"]/);
});
