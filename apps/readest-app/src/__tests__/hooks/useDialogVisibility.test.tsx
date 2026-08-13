import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  setBackupDialogVisible,
  setCacheManagerDialogVisible,
  useDialogVisibility,
} from '@/hooks/useDialogVisibility';

afterEach(cleanup);

const UncontrolledHarness = () => {
  const [visible, setVisible] = useDialogVisibility('backup_window');
  return (
    <button type='button' onClick={() => setVisible(false)}>
      {visible ? 'open' : 'closed'}
    </button>
  );
};

const ControlledHarness = ({
  visible,
  onVisibleChange,
}: {
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
}) => {
  const [currentVisible, setVisible] = useDialogVisibility(
    'cache_manager_window',
    visible,
    onVisibleChange,
  );
  return (
    <button type='button' onClick={() => setVisible(!currentVisible)}>
      {currentVisible ? 'open' : 'closed'}
    </button>
  );
};

const ShortcutHarness = () => {
  const [visible] = useDialogVisibility('shortcuts_help', undefined, undefined, '?');
  return (
    <div>
      <span>{visible ? 'open' : 'closed'}</span>
      <input aria-label='editor' />
    </div>
  );
};

describe('useDialogVisibility', () => {
  it('activates an unloaded dialog host through the global visibility event', () => {
    render(<UncontrolledHarness />);
    expect(screen.getByRole('button').textContent).toBe('closed');

    act(() => setBackupDialogVisible(true));
    expect(screen.getByRole('button').textContent).toBe('open');

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('closed');
  });

  it('delegates state changes when a lazily loaded dialog is controlled by its host', () => {
    const onVisibleChange = vi.fn();
    render(<ControlledHarness visible={false} onVisibleChange={onVisibleChange} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onVisibleChange).toHaveBeenCalledWith(true);

    act(() => setCacheManagerDialogVisible(true));
    expect(screen.getByRole('button').textContent).toBe('closed');
  });

  it('activates the shortcut host with ? but ignores text-entry focus', () => {
    render(<ShortcutHarness />);

    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByText('open')).toBeTruthy();

    const editor = screen.getByLabelText('editor');
    editor.focus();
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByText('open')).toBeTruthy();
  });
});
