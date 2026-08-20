/**
 * Browser layout regression test for the AnnotationPopup component.
 *
 * Renders the *real* AnnotationPopup + HighlightOptions with actual
 * annotationToolButtons, DEFAULT_HIGHLIGHT_COLORS, and optional user
 * colors. Tailwind CSS is loaded so computed geometry matches the live app.
 *
 * Guards against the layout regression from PR #3741 (missing
 * `justify-between`, unwanted `flex-1` on the color strip).
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { UserHighlightColor } from '@/types/book';
import { EnvContextProvider } from '@/context/EnvContext';
import type { EnvConfigType } from '@/services/environment';
import type { SystemSettings } from '@/types/settings';
import { useSettingsStore } from '@/store/settingsStore';

// ── Tailwind / DaisyUI styles ───────────────────────────────────────────
import '@/styles/globals.css';

// ── Per-test state read by mocks ────────────────────────────────────────

// ── Mocks (must be before component imports) ────────────────────────────

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ isDarkMode: false }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (n: number) => n,
  useDefaultIconSize: () => 20,
}));

vi.mock('@/hooks/useKeyDownActions', () => ({
  useKeyDownActions: () => {},
}));

vi.mock('@/helpers/settings', () => ({
  saveSysSettings: vi.fn(),
}));

vi.mock('@/app/reader/utils/annotatorUtil', () => ({
  getHighlightColorLabel: () => undefined,
}));

// ── Real component imports ──────────────────────────────────────────────

import AnnotationPopup from '@/app/reader/components/annotator/AnnotationPopup';
import { annotationToolButtons } from '@/app/reader/components/annotator/AnnotationTools';
import { DEFAULT_ANNOTATION_TOOLBAR_ITEMS } from '@/utils/annotationToolbar';

// ── Constants ───────────────────────────────────────────────────────────

const POPUP_W = 300;
const POPUP_H = 44;

// Highlight options float above the popup by (28 + 16) = 44px
const OPTIONS_OFFSET = 28 + 16;

// Position the popup so both it and the floating options are visible:
//   y=0..OPTIONS_OFFSET: highlight-options row
//   y=OPTIONS_OFFSET..OPTIONS_OFFSET+POPUP_H: toolbar
const POPUP_Y = OPTIONS_OFFSET;
const POPUP_X = 0;
const WRAPPER_H = POPUP_Y + POPUP_H + 14; // +14 for triangle below

// Render the default-enabled tools (Share is hidden by default; users add it
// via Customize Toolbar), matching what the popup shows out of the box.
const toolButtons = annotationToolButtons
  .filter((button) => DEFAULT_ANNOTATION_TOOLBAR_ITEMS.includes(button.type))
  .map(({ label, Icon }) => ({
    tooltipText: label,
    Icon,
    onClick: vi.fn(),
  }));

/**
 * Fixed-size wrapper that contains both the popup and the absolutely
 * positioned highlight-options row above it, matching the real app
 * where the triangle points up and highlight options float above.
 */
const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    data-theme='dark'
    style={{
      position: 'relative',
      width: POPUP_W,
      height: WRAPPER_H,
      overflow: 'visible',
    }}
  >
    {children}
  </div>
);

const renderPopup = (userColors: UserHighlightColor[] = []) => {
  useSettingsStore.setState({
    settings: {
      globalReadSettings: {
        highlightStyle: 'highlight',
        highlightStyles: {
          highlight: 'yellow',
          underline: 'red',
          squiggly: 'blue',
        },
        customHighlightColors: {},
        userHighlightColors: userColors,
        defaultHighlightLabels: {},
      },
      globalViewSettings: {
        isEink: false,
        isColorEink: false,
      },
    } as SystemSettings,
  });
  return render(
    <EnvContextProvider value={{ envConfig: {} as EnvConfigType, appService: null }}>
      <Wrapper>
        <AnnotationPopup
          bookKey='test'
          dir='ltr'
          isVertical={false}
          buttons={toolButtons}
          notes={[]}
          position={{ dir: 'up', point: { x: POPUP_X, y: POPUP_Y } }}
          trianglePosition={{
            dir: 'up',
            point: { x: POPUP_X + POPUP_W / 2, y: POPUP_Y + POPUP_H },
          }}
          highlightOptionsVisible
          selectedStyle='highlight'
          selectedColor='yellow'
          popupWidth={POPUP_W}
          popupHeight={POPUP_H}
          onHighlight={vi.fn()}
          onDismiss={vi.fn()}
        />
      </Wrapper>
    </EnvContextProvider>,
  );
};

const assertLayout = (
  wrapper: HTMLElement,
  expectedColorCount: number,
  expectedOverflow: boolean,
) => {
  const options = wrapper.querySelector<HTMLElement>('.highlight-options');
  if (!options) throw new Error('Highlight options were not rendered');

  const styleGroup = options.children.item(0) as HTMLElement | null;
  const colorStrip = options.children.item(1) as HTMLElement | null;
  if (!styleGroup || !colorStrip) throw new Error('Highlight option groups were not rendered');

  const optionsStyle = getComputedStyle(options);
  const stripStyle = getComputedStyle(colorStrip);
  const optionsRect = options.getBoundingClientRect();
  const styleRect = styleGroup.getBoundingClientRect();
  const stripRect = colorStrip.getBoundingClientRect();

  expect(wrapper.getBoundingClientRect().width).toBe(POPUP_W);
  expect(wrapper.getBoundingClientRect().height).toBe(WRAPPER_H);
  expect(optionsStyle.display).toBe('flex');
  expect(optionsStyle.flexDirection).toBe('row');
  expect(optionsStyle.justifyContent).toBe('space-between');
  expect(optionsRect.width).toBe(POPUP_W);
  expect(optionsRect.height).toBe(POPUP_H);
  expect(styleGroup.querySelectorAll('button')).toHaveLength(3);
  expect(Math.abs(stripRect.right - optionsRect.right)).toBeLessThanOrEqual(1);
  expect(stripRect.left - styleRect.right).toBeGreaterThanOrEqual(15);
  expect(stripStyle.flexGrow).toBe('0');
  expect(colorStrip.classList.contains('flex-1')).toBe(false);
  expect(colorStrip.querySelectorAll('button')).toHaveLength(expectedColorCount);
  expect(colorStrip.scrollWidth > colorStrip.clientWidth).toBe(expectedOverflow);
};

// ── Lifecycle ───────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('AnnotationPopup layout', () => {
  it('default 5 colors — compact color strip, large gap', () => {
    const { container } = renderPopup();
    const wrapper = container.firstElementChild as HTMLElement;
    assertLayout(wrapper, 5, false);
  });

  it('5+5 user colors — color strip grows, gap shrinks', () => {
    const { container } = renderPopup([
      { hex: '#f97316' },
      { hex: '#06b6d4' },
      { hex: '#ec4899' },
      { hex: '#14b8a6' },
      { hex: '#f43f5e' },
    ]);
    const wrapper = container.firstElementChild as HTMLElement;
    assertLayout(wrapper, 10, true);
  });

  it('5+10 user colors — color strip at max, overflow scrolls', () => {
    const { container } = renderPopup([
      { hex: '#f97316' },
      { hex: '#06b6d4' },
      { hex: '#ec4899' },
      { hex: '#14b8a6' },
      { hex: '#f43f5e' },
      { hex: '#a855f7' },
      { hex: '#84cc16' },
      { hex: '#0ea5e9' },
      { hex: '#e11d48' },
      { hex: '#6366f1' },
    ]);
    const wrapper = container.firstElementChild as HTMLElement;
    assertLayout(wrapper, 15, true);
  });
});
