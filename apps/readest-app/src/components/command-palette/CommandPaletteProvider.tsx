'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import { useEnv } from '@/context/EnvContext';
import { isTauriAppPlatform } from '@/services/environment';
import { tauriHandleSetAlwaysOnTop, tauriHandleToggleFullScreen } from '@/utils/window';
import { setAboutDialogVisible } from '@/hooks/useDialogVisibility';
import { saveSysSettings } from '@/helpers/settings';
import type { SettingsPanelType } from '@/components/settings/SettingsDialog';
import type { CommandCategory, CommandItem, CommandSearchResult } from '@/services/commandRegistry';

type CommandRegistryModule = typeof import('@/services/commandRegistry');

const EMPTY_GROUPED_RESULTS: Record<CommandCategory, CommandSearchResult[]> = {
  settings: [],
  actions: [],
  navigation: [],
};

interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  query: string;
  setQuery: (query: string) => void;
  results: CommandSearchResult[];
  groupedResults: Record<CommandCategory, CommandSearchResult[]>;
  recentItems: CommandItem[];
  executeCommand: (item: CommandItem) => void;
  commandItems: CommandItem[];
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export const useCommandPalette = (): CommandPaletteContextValue => {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  }
  return context;
};

interface CommandPaletteProviderProps {
  children: React.ReactNode;
}

export const CommandPaletteProvider: React.FC<CommandPaletteProviderProps> = ({ children }) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { themeMode, setThemeMode } = useThemeStore();
  const { settings, setSettingsDialogOpen, setActiveSettingsItemId } = useSettingsStore();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [commandRegistry, setCommandRegistry] = useState<CommandRegistryModule | null>(null);

  const isDesktop = isTauriAppPlatform() && !appService?.isMobile;

  // action handlers
  const toggleTheme = useCallback(() => {
    const nextMode = themeMode === 'auto' ? 'light' : themeMode === 'light' ? 'dark' : 'auto';
    setThemeMode(nextMode);
  }, [themeMode, setThemeMode]);

  const toggleFullscreen = useCallback(() => {
    tauriHandleToggleFullScreen();
  }, []);

  const toggleAlwaysOnTop = useCallback(() => {
    const newValue = !settings.alwaysOnTop;
    saveSysSettings(envConfig, 'alwaysOnTop', newValue);
    tauriHandleSetAlwaysOnTop(newValue);
  }, [envConfig, settings.alwaysOnTop]);

  const toggleScreenWakeLock = useCallback(() => {
    const newValue = !settings.screenWakeLock;
    saveSysSettings(envConfig, 'screenWakeLock', newValue);
  }, [envConfig, settings.screenWakeLock]);

  const reloadPage = useCallback(() => {
    window.location.reload();
  }, []);

  const toggleOpenLastBooks = useCallback(() => {
    const newValue = !settings.openLastBooks;
    saveSysSettings(envConfig, 'openLastBooks', newValue);
  }, [envConfig, settings.openLastBooks]);

  const showAbout = useCallback(() => {
    setAboutDialogVisible(true);
  }, []);

  const openSettingsPanel = useCallback(
    (_panel: SettingsPanelType, itemId?: string) => {
      // panel is encoded in itemId (e.g., 'settings.font.defaultFontSize')
      // SettingsDialog will parse this to determine which panel to show
      if (itemId) {
        setActiveSettingsItemId(itemId);
      }
      setSettingsDialogOpen(true);
    },
    [setSettingsDialogOpen, setActiveSettingsItemId],
  );

  // The registry pulls in the fuzzy-search engine plus the full command icon
  // set. Keep that code out of the launch path and load it only after the user
  // explicitly opens the palette.
  useEffect(() => {
    if (!isOpen || commandRegistry) return;

    let active = true;
    void import('@/services/commandRegistry')
      .then((module) => {
        if (active) setCommandRegistry(module);
      })
      .catch((error) => {
        console.error('Failed to load the command palette registry:', error);
      });

    return () => {
      active = false;
    };
  }, [commandRegistry, isOpen]);

  // build command registry
  const commandItems = useMemo(
    () =>
      commandRegistry
        ? commandRegistry.buildCommandRegistry({
            _,
            openSettingsPanel,
            toggleTheme,
            toggleFullscreen,
            toggleAlwaysOnTop,
            toggleScreenWakeLock,
            reloadPage,
            toggleOpenLastBooks,
            showAbout,
            isDesktop,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      _,
      openSettingsPanel,
      toggleTheme,
      toggleFullscreen,
      toggleAlwaysOnTop,
      toggleScreenWakeLock,
      reloadPage,
      toggleOpenLastBooks,
      showAbout,
      isDesktop,
      commandRegistry,
    ],
  );

  // search results
  const results = useMemo(
    () => (commandRegistry ? commandRegistry.searchCommands(query, commandItems) : []),
    [commandItems, commandRegistry, query],
  );
  const groupedResults = useMemo(
    () =>
      commandRegistry ? commandRegistry.groupResultsByCategory(results) : EMPTY_GROUPED_RESULTS,
    [commandRegistry, results],
  );

  // recent items
  const recentItems = useMemo(
    () => (commandRegistry ? commandRegistry.getRecentCommands(commandItems, 5) : []),
    [commandItems, commandRegistry],
  );

  // palette controls
  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  // execute command
  const executeCommand = useCallback(
    (item: CommandItem) => {
      commandRegistry?.trackCommandUsage(item.id);
      close();
      // slight delay to allow modal to close before action
      requestAnimationFrame(() => {
        item.action();
      });
    },
    [close, commandRegistry],
  );

  // keyboard shortcut handler (Ctrl/Cmd+Shift+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        e.stopPropagation();
        setSettingsDialogOpen(false);
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [toggle, setSettingsDialogOpen]);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      query,
      setQuery,
      results,
      groupedResults,
      recentItems,
      executeCommand,
      commandItems,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      query,
      setQuery,
      results,
      groupedResults,
      recentItems,
      executeCommand,
      commandItems,
    ],
  );

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
};

export default CommandPaletteProvider;
