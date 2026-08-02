import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { useDictionaryResults } = vi.hoisted(() => ({
  useDictionaryResults: vi.fn(),
}));

vi.mock('@/app/reader/components/annotator/DictionaryResultsView', () => ({
  useDictionaryResults,
  DictionaryResultsHeader: ({
    currentWord,
    onManage,
  }: {
    currentWord: string;
    onManage?: () => void;
  }) => (
    <header>
      <span>{currentWord}</span>
      {onManage && <button onClick={onManage}>Manage Dictionaries</button>}
    </header>
  ),
  DictionaryResultsBody: () => <main>Local dictionary results</main>,
}));

vi.mock('@/components/Dialog', () => ({
  default: ({
    header,
    children,
    onClose,
  }: {
    header: React.ReactNode;
    children: React.ReactNode;
    onClose: () => void;
  }) => (
    <div>
      {header}
      {children}
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import DictionarySheet from '@/app/reader/components/annotator/DictionarySheet';

afterEach(cleanup);

describe('DictionarySheet', () => {
  it('renders the local dictionary result shell', () => {
    useDictionaryResults.mockReturnValue({
      currentWord: 'hello',
      canGoBack: false,
      goBack: vi.fn(),
      visibleDefinitionProviders: [],
      cards: {},
      setContainerRef: vi.fn(),
      handleContainerClick: vi.fn(),
      toggleExpanded: vi.fn(),
      noProvidersAtAll: true,
      fontScale: 1,
      isSpeaking: false,
      speakWord: vi.fn(),
    });

    render(<DictionarySheet word='hello' onDismiss={() => {}} />);

    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('Local dictionary results')).toBeTruthy();
  });

  it('forwards close and manage actions', () => {
    const onDismiss = vi.fn();
    const onManage = vi.fn();
    useDictionaryResults.mockReturnValue({
      currentWord: 'word',
      canGoBack: false,
      goBack: vi.fn(),
      visibleDefinitionProviders: [],
      cards: {},
      setContainerRef: vi.fn(),
      handleContainerClick: vi.fn(),
      toggleExpanded: vi.fn(),
      noProvidersAtAll: true,
      fontScale: 1,
      isSpeaking: false,
      speakWord: vi.fn(),
    });

    render(<DictionarySheet word='word' onDismiss={onDismiss} onManage={onManage} />);
    fireEvent.click(screen.getByText('Manage Dictionaries'));
    fireEvent.click(screen.getByText('Close'));

    expect(onManage).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
