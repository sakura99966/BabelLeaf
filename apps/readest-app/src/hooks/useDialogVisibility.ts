import { useCallback, useEffect, useState } from 'react';

export type DialogVisibilityId =
  | 'about_window'
  | 'backup_window'
  | 'cache_manager_window'
  | 'migrate_data_dir_window'
  | 'shortcuts_help';

const DIALOG_VISIBILITY_EVENT = 'babelleaf:set-dialog-visibility';

type DialogVisibilityDetail = {
  id: DialogVisibilityId;
  visible: boolean;
};

const setDialogVisibility = (id: DialogVisibilityId, visible: boolean) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<DialogVisibilityDetail>(DIALOG_VISIBILITY_EVENT, {
      detail: { id, visible },
    }),
  );
};

export const setBackupDialogVisible = (visible: boolean) => {
  setDialogVisibility('backup_window', visible);
};

export const setAboutDialogVisible = (visible: boolean) => {
  setDialogVisibility('about_window', visible);
};

export const setCacheManagerDialogVisible = (visible: boolean) => {
  setDialogVisibility('cache_manager_window', visible);
};

export const setMigrateDataDirDialogVisible = (visible: boolean) => {
  setDialogVisibility('migrate_data_dir_window', visible);
};

export const setShortcutsDialogVisible = (visible: boolean) => {
  setDialogVisibility('shortcuts_help', visible);
};

export const useDialogVisibility = (
  id: DialogVisibilityId,
  controlledVisible?: boolean,
  onVisibleChange?: (visible: boolean) => void,
  toggleKey?: string,
) => {
  const isControlled = controlledVisible !== undefined;
  const [internalVisible, setInternalVisible] = useState(false);

  useEffect(() => {
    if (isControlled || typeof window === 'undefined') return;

    const handleVisibility = (event: Event) => {
      const detail = (event as CustomEvent<DialogVisibilityDetail>).detail;
      if (detail?.id === id) {
        setInternalVisible(detail.visible);
      }
    };

    window.addEventListener(DIALOG_VISIBILITY_EVENT, handleVisibility);
    return () => window.removeEventListener(DIALOG_VISIBILITY_EVENT, handleVisibility);
  }, [id, isControlled]);

  useEffect(() => {
    if (isControlled || !toggleKey || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== toggleKey) return;

      const activeElement = document.activeElement as HTMLElement | null;
      const isInteractive =
        activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'TEXTAREA' ||
        activeElement?.isContentEditable;
      if (isInteractive) return;

      event.preventDefault();
      setInternalVisible((visible) => !visible);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isControlled, toggleKey]);

  const setVisible = useCallback(
    (visible: boolean) => {
      if (!isControlled) {
        setInternalVisible(visible);
      }
      onVisibleChange?.(visible);
    },
    [isControlled, onVisibleChange],
  );

  return [isControlled ? controlledVisible : internalVisible, setVisible] as const;
};
