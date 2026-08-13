import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import { PiGear, PiMoon, PiSun } from 'react-icons/pi';
import { TbSunMoon } from 'react-icons/tb';

import {
  setAboutDialogVisible,
  setBackupDialogVisible,
  setCacheManagerDialogVisible,
  setMigrateDataDirDialogVisible,
} from '@/hooks/useDialogVisibility';
import Menu from '@/components/Menu';
import MenuItem from '@/components/MenuItem';
import { useEnv } from '@/context/EnvContext';
import { saveSysSettings } from '@/helpers/settings';
import { useTranslation } from '@/hooks/useTranslation';
import {
  getBiometricStatus,
  getBiometryLabelKey,
  isBiometricSupported,
} from '@/services/biometric';
import { isTauriAppPlatform } from '@/services/environment';
import { useAppLockStore, type AppLockDialogMode } from '@/store/appLockStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import { selectDirectory } from '@/utils/bridge';
import { requestStoragePermission } from '@/utils/permission';
import { tauriHandleSetAlwaysOnTop, tauriHandleToggleFullScreen } from '@/utils/window';

interface SettingsMenuProps {
  setIsDropdownOpen?: (isOpen: boolean) => void;
}

type BooleanSettingKey = 'autoImportBooksOnOpen' | 'openLastBooks' | 'openBookInNewWindow';

const SettingsMenu: React.FC<SettingsMenuProps> = ({ setIsDropdownOpen }) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { themeMode, setThemeMode } = useThemeStore();
  const { settings, setSettingsDialogOpen } = useSettingsStore();
  const { setLibrary } = useLibraryStore();
  const { openDialog: openAppLockDialogInStore } = useAppLockStore();
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(settings.alwaysOnTop);
  const [isAlwaysShowStatusBar, setIsAlwaysShowStatusBar] = useState(settings.alwaysShowStatusBar);
  const [isOpenLastBooks, setIsOpenLastBooks] = useState(settings.openLastBooks);
  const [isAutoImportBooksOnOpen, setIsAutoImportBooksOnOpen] = useState(
    settings.autoImportBooksOnOpen,
  );
  const [savedBookCoverForLockScreen, setSavedBookCoverForLockScreen] = useState(
    settings.savedBookCoverForLockScreen || '',
  );
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);
  const [refreshMetadataProgress, setRefreshMetadataProgress] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometryLabelKey, setBiometryLabelKey] = useState('');
  const isPinEnabled = !!settings.pinCodeEnabled;
  const showBiometricToggle = !!appService?.isMobileApp && isPinEnabled && biometricAvailable;

  useEffect(() => {
    if (!isBiometricSupported(appService) || !isPinEnabled) return;
    let cancelled = false;
    void getBiometricStatus().then(({ available, biometryType }) => {
      if (cancelled) return;
      setBiometricAvailable(available);
      setBiometryLabelKey(getBiometryLabelKey(biometryType));
    });
    return () => {
      cancelled = true;
    };
  }, [appService, isPinEnabled]);

  const closeMenu = () => setIsDropdownOpen?.(false);

  const saveAndClose = (key: BooleanSettingKey, value: boolean) => {
    void saveSysSettings(envConfig, key, value);
    closeMenu();
  };

  const openAppLockDialog = (mode: AppLockDialogMode) => {
    openAppLockDialogInStore(mode);
    closeMenu();
  };

  const handleRefreshMetadata = async () => {
    if (!appService || isRefreshingMetadata) return;
    setIsRefreshingMetadata(true);
    setRefreshMetadataProgress(_('Loading library...'));
    try {
      const books = await appService.loadLibraryBooks();
      const activeBooks = books.filter((book) => !book.deletedAt);
      let refreshed = 0;
      for (const [index, book] of activeBooks.entries()) {
        setRefreshMetadataProgress(`${index + 1} / ${activeBooks.length}`);
        try {
          if (await appService.refreshBookMetadata(book)) refreshed += 1;
        } catch {
          // Keep the remaining local books usable when one source file is missing.
        }
      }
      setLibrary(books);
      await appService.saveLibraryBooks(books);
      setRefreshMetadataProgress(_('{{count}} books refreshed', { count: refreshed }));
    } catch (error) {
      console.error('Failed to refresh metadata:', error);
      setRefreshMetadataProgress(_('Failed to refresh metadata'));
    } finally {
      window.setTimeout(() => {
        setIsRefreshingMetadata(false);
        setRefreshMetadataProgress('');
      }, 2000);
    }
  };

  const handleSetSavedBookCoverForLockScreen = async () => {
    if (!(await requestStoragePermission()) && appService?.distChannel === 'readest') return;
    const newValue = settings.savedBookCoverForLockScreen ? '' : 'default';
    if (newValue) {
      const response = await selectDirectory();
      if (response.path) {
        void saveSysSettings(envConfig, 'savedBookCoverForLockScreenPath', response.path);
      }
    }
    void saveSysSettings(envConfig, 'savedBookCoverForLockScreen', newValue);
    setSavedBookCoverForLockScreen(newValue);
  };

  const themeModeLabel =
    themeMode === 'dark'
      ? _('Dark Mode')
      : themeMode === 'light'
        ? _('Light Mode')
        : _('Auto Mode');
  const savedBookCoverPath = settings.savedBookCoverForLockScreenPath;
  const coverDir = savedBookCoverPath ? savedBookCoverPath.split('/').pop() : 'Images';

  return (
    <Menu
      className={clsx(
        'settings-menu dropdown-content no-triangle',
        'z-20 mt-2 max-w-[90vw] shadow-2xl',
      )}
      onCancel={closeMenu}
    >
      {isTauriAppPlatform() && (
        <MenuItem
          label={_('Auto Import on File Open')}
          toggled={isAutoImportBooksOnOpen}
          onClick={() => {
            const value = !settings.autoImportBooksOnOpen;
            setIsAutoImportBooksOnOpen(value);
            saveAndClose('autoImportBooksOnOpen', value);
          }}
        />
      )}
      {isTauriAppPlatform() && (
        <MenuItem
          label={_('Open Last Book on Start')}
          toggled={isOpenLastBooks}
          onClick={() => {
            const value = !settings.openLastBooks;
            setIsOpenLastBooks(value);
            saveAndClose('openLastBooks', value);
          }}
        />
      )}
      <hr aria-hidden='true' className='border-base-200 my-1' />
      {appService?.hasWindow && (
        <MenuItem
          label={_('Open Book in New Window')}
          toggled={settings.openBookInNewWindow}
          onClick={() => saveAndClose('openBookInNewWindow', !settings.openBookInNewWindow)}
        />
      )}
      {appService?.hasWindow && (
        <MenuItem
          label={_('Fullscreen')}
          onClick={() => {
            void tauriHandleToggleFullScreen();
            closeMenu();
          }}
        />
      )}
      {appService?.hasWindow && (
        <MenuItem
          label={_('Always on Top')}
          toggled={isAlwaysOnTop}
          onClick={() => {
            const value = !settings.alwaysOnTop;
            setIsAlwaysOnTop(value);
            void saveSysSettings(envConfig, 'alwaysOnTop', value);
            void tauriHandleSetAlwaysOnTop(value);
            closeMenu();
          }}
        />
      )}
      {appService?.isMobileApp && (
        <MenuItem
          label={_('Always Show Status Bar')}
          toggled={isAlwaysShowStatusBar}
          onClick={() => {
            const value = !settings.alwaysShowStatusBar;
            setIsAlwaysShowStatusBar(value);
            void saveSysSettings(envConfig, 'alwaysShowStatusBar', value);
          }}
        />
      )}
      <MenuItem
        label={themeModeLabel}
        Icon={themeMode === 'dark' ? PiMoon : themeMode === 'light' ? PiSun : TbSunMoon}
        onClick={() =>
          setThemeMode(themeMode === 'auto' ? 'light' : themeMode === 'light' ? 'dark' : 'auto')
        }
      />
      <MenuItem
        label={_('Settings')}
        testId='open-settings'
        Icon={PiGear}
        onClick={() => {
          closeMenu();
          setSettingsDialogOpen(true);
        }}
      />
      <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem label={_('Advanced Settings')}>
        <ul className='ms-0 flex flex-col ps-0 before:hidden'>
          <MenuItem
            label={_('Backup & Restore')}
            onClick={() => {
              closeMenu();
              setBackupDialogVisible(true);
            }}
          />
          {appService?.canCustomizeRootDir && (
            <MenuItem
              label={_('Change Data Location')}
              onClick={() => {
                setMigrateDataDirDialogVisible(true);
                closeMenu();
              }}
            />
          )}
          <MenuItem
            label={_('Refresh Metadata')}
            description={refreshMetadataProgress}
            onClick={() => void handleRefreshMetadata()}
            disabled={isRefreshingMetadata}
          />
          {appService?.isMobileApp && (
            <MenuItem
              label={_('Manage Cache')}
              onClick={() => {
                closeMenu();
                setCacheManagerDialogVisible(true);
              }}
            />
          )}
          {!isPinEnabled && (
            <MenuItem label={_('Set PIN…')} onClick={() => openAppLockDialog('set')} />
          )}
          {isPinEnabled && (
            <MenuItem label={_('Change PIN…')} onClick={() => openAppLockDialog('change')} />
          )}
          {isPinEnabled && (
            <MenuItem label={_('Disable PIN…')} onClick={() => openAppLockDialog('disable')} />
          )}
          {showBiometricToggle && (
            <MenuItem
              label={_('Unlock with {{biometry}}', { biometry: _(biometryLabelKey) })}
              toggled={!!settings.biometricUnlockEnabled}
              onClick={() =>
                void saveSysSettings(
                  envConfig,
                  'biometricUnlockEnabled',
                  !settings.biometricUnlockEnabled,
                )
              }
            />
          )}
          {appService?.isAndroidApp && appService?.distChannel !== 'playstore' && (
            <MenuItem
              label={_('Save Book Cover')}
              description={savedBookCoverForLockScreen ? `📑 ${coverDir}/last-book-cover.png` : ''}
              toggled={!!savedBookCoverForLockScreen}
              onClick={() => void handleSetSavedBookCoverForLockScreen()}
            />
          )}
        </ul>
      </MenuItem>
      <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem
        label={_('About BabelLeaf')}
        onClick={() => {
          setAboutDialogVisible(true);
          closeMenu();
        }}
      />
    </Menu>
  );
};

export default SettingsMenu;
