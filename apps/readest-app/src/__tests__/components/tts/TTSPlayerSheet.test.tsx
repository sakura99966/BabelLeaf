import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor as waitForWithOptions,
} from '@testing-library/react';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, opts?: Record<string, unknown>) =>
    opts ? Object.entries(opts).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), key) : key,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (size: number) => size,
  useDefaultIconSize: () => 24,
}));

vi.mock('@/components/Dialog', () => ({
  default: ({
    isOpen,
    header,
    children,
  }: {
    isOpen: boolean;
    header?: React.ReactNode;
    children: React.ReactNode;
  }) =>
    isOpen ? (
      <div role='dialog'>
        {header}
        {children}
      </div>
    ) : null,
}));

const envConfig = {};
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig, appService: { hasHaptics: false } }),
}));

const viewSettings: Record<string, unknown> = {};
const setViewSettings = vi.fn();
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getViewSettings: () => viewSettings,
    setViewSettings,
  }),
}));

const settings = { globalViewSettings: { ttsRate: 1.0, ttsParagraphGap: 0.7 } };
const saveSettings = vi.fn();
const settingsState = { settings, setSettings: vi.fn(), saveSettings };
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: Object.assign(() => settingsState, { getState: () => settingsState }),
}));

const getBookData = vi.fn();
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ getBookData }),
}));

vi.mock('@/store/readerProgressStore', () => ({
  useBookProgress: () => ({ sectionLabel: 'Chapter 5' }),
}));

import TTSPlayerSheet from '@/app/reader/components/tts/TTSPlayerSheet';

const waitFor = <T,>(callback: () => T | Promise<T>) =>
  waitForWithOptions(callback, { interval: 1 });

const voiceGroups = [
  {
    id: 'web',
    name: 'Web Speech',
    voices: [
      { id: 'ava', name: 'Ava', lang: 'en-US', disabled: false },
      { id: 'guy', name: 'Guy', lang: 'en-US', disabled: false },
    ],
  },
];

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  bookKey: 'b1',
  isOpen: true,
  ttsLang: 'en',
  isPlaying: true,
  hasTimeline: true,
  timeoutOption: 0,
  timeoutTimestamp: 0,
  chapterRemainingSec: null as number | null,
  onClose: vi.fn(),
  onTogglePlay: vi.fn(),
  onBackward: vi.fn(),
  onForward: vi.fn(),
  onSetRate: vi.fn(),
  onSetParagraphGap: vi.fn(),
  onGetVoices: vi.fn().mockResolvedValue(voiceGroups),
  onSetVoice: vi.fn(),
  onGetVoiceId: vi.fn().mockReturnValue('ava'),
  onSelectTimeout: vi.fn(),
  onSeek: vi.fn().mockResolvedValue(undefined),
  onSeekPreview: vi.fn(),
  onGetPlaybackInfo: vi
    .fn()
    .mockReturnValue({ position: 10, duration: 100, measuredFraction: 0.4 }),
  ...overrides,
});

describe('TTSPlayerSheet', () => {
  beforeEach(() => {
    viewSettings['ttsRate'] = 1.0;
    viewSettings['ttsParagraphGap'] = 0.7;
    viewSettings['isEink'] = false;
    getBookData.mockReturnValue({
      book: { title: 'Alice in Wonderland', coverImageUrl: null },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test('shows title, chapter, scrubber, and transport on the main view', async () => {
    render(<TTSPlayerSheet {...makeProps()} />);
    expect(screen.getByText('Alice in Wonderland')).toBeTruthy();
    expect(screen.getByText('Chapter 5')).toBeTruthy();
    expect(screen.getByRole('slider')).toBeTruthy();
    expect(screen.getByLabelText('Previous Paragraph')).toBeTruthy();
    expect(screen.getByLabelText('Next Paragraph')).toBeTruthy();
    // Compact one-row controls: speed / voice / sleep timer buttons.
    expect(screen.getByLabelText('Speed')).toBeTruthy();
    expect(screen.getByLabelText('Sleep Timer')).toBeTruthy();
    expect(await waitFor(() => screen.getByText('Ava'))).toBeTruthy(); // voice button caption
    // The main view carries no header label (vertical space).
    expect(screen.queryByText('Read Aloud')).toBeNull();
  });

  test('degrades without a timeline: no scrubber, estimate text instead', () => {
    render(
      <TTSPlayerSheet
        {...makeProps({
          hasTimeline: false,
          chapterRemainingSec: 300,
          onGetPlaybackInfo: vi.fn().mockReturnValue(null),
        })}
      />,
    );
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText(/5:00 left in chapter/)).toBeTruthy();
  });

  test('transport buttons pass paragraph/sentence semantics', () => {
    const props = makeProps();
    render(<TTSPlayerSheet {...props} />);
    fireEvent.click(screen.getByLabelText('Previous Paragraph'));
    expect(props.onBackward).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByLabelText('Previous Sentence'));
    expect(props.onBackward).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByLabelText('Next Sentence'));
    expect(props.onForward).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByLabelText('Next Paragraph'));
    expect(props.onForward).toHaveBeenCalledWith(false);
  });

  test('main view offers a close button since desktop has no drag handle', () => {
    const props = makeProps();
    render(<TTSPlayerSheet {...props} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(props.onClose).toHaveBeenCalled();
  });

  test('main view keeps the cover clear of the sheet top edge on desktop', () => {
    // The sheet content is pulled up (mt-[-4px]) to tuck under the mobile
    // drag handle; on sm+ the handle is hidden and the main view needs its
    // own top padding or the cover clips into the rounded top edge.
    getBookData.mockReturnValue({
      book: { title: 'Alice in Wonderland', coverImageUrl: 'blob:cover' },
    });
    const { container } = render(<TTSPlayerSheet {...makeProps()} />);
    const cover = container.querySelector('img');
    expect(cover).toBeTruthy();
    expect(cover?.parentElement?.className).toContain('sm:pt-4');
  });

  test('the speed caption pads and truncates like its sibling captions', () => {
    // 'Geschwindigkeit' (de) overflows the compact button edge-to-edge
    // without the max-w-full/truncate/px-1 combo the other captions use.
    render(<TTSPlayerSheet {...makeProps()} />);
    const caption = screen.getByText('Speed');
    expect(caption.className).toContain('max-w-full');
    expect(caption.className).toContain('truncate');
    expect(caption.className).toContain('px-1');
  });

  test('speed button drills into the ruler and releasing a drag persists the rate', () => {
    const props = makeProps();
    render(<TTSPlayerSheet {...props} />);
    fireEvent.click(screen.getByLabelText('Speed'));
    const slider = screen.getByRole('slider', { name: 'Speed' });
    fireEvent.change(slider, { target: { value: '1.5' } });
    expect(props.onSetRate).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    expect(props.onSetRate).toHaveBeenCalledWith(1.5);
    expect(props.onSetParagraphGap).toHaveBeenCalled();
    expect(viewSettings['ttsRate']).toBe(1.5);
    expect(viewSettings['ttsParagraphGap']).toEqual(expect.any(Number));
    expect(settings.globalViewSettings.ttsRate).toBe(1.5);
    expect(settings.globalViewSettings.ttsParagraphGap).toEqual(expect.any(Number));
    expect(saveSettings).toHaveBeenCalled();
  });

  test('voice button drills into the voice list and selects a voice', async () => {
    const props = makeProps();
    render(<TTSPlayerSheet {...props} />);
    fireEvent.click(screen.getByLabelText('Voice'));
    fireEvent.click(await waitFor(() => screen.getByText('Guy')));
    expect(props.onSetVoice).toHaveBeenCalledWith('guy', 'en-US');
    expect(viewSettings['ttsVoice']).toBe('guy');
  });

  test('timer button drills into the timer list and selects a timeout', async () => {
    const props = makeProps();
    render(<TTSPlayerSheet {...props} />);
    fireEvent.click(screen.getByLabelText('Sleep Timer'));
    // The translation mock interpolates, so options render as real labels.
    fireEvent.click(screen.getByText('30 minutes'));
    expect(props.onSelectTimeout).toHaveBeenCalledWith('b1', 1800);
  });

  test('reopening the sheet returns to the main view', async () => {
    const props = makeProps();
    const { rerender } = render(<TTSPlayerSheet {...props} />);
    fireEvent.click(screen.getByLabelText('Voice'));
    expect(await waitFor(() => screen.getByText('Guy'))).toBeTruthy();
    rerender(<TTSPlayerSheet {...props} isOpen={false} />);
    rerender(<TTSPlayerSheet {...props} isOpen={true} />);
    expect(screen.getByLabelText('Previous Paragraph')).toBeTruthy();
    expect(screen.queryByText('Guy')).toBeNull();
  });
});
