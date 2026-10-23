import { useEffect, useState } from 'react';
import { RiTranslate } from 'react-icons/ri';

import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useBookDataStore } from '@/store/bookDataStore';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { saveViewSettings } from '@/helpers/settings';
import { isTranslationAvailable } from '@/services/translators/utils';
import Button from '@/components/Button';
import {
  getTranslationConsentContext,
  useTranslationSessionStore,
} from '@/store/translationSessionStore';
import { useSettingsStore } from '@/store/settingsStore';

const TranslationToggler = ({ bookKey }: { bookKey: string }) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { getBookData } = useBookDataStore();
  const { getViewSettings, setViewSettings, setHoveredBookKey } = useReaderStore();

  const iconSize20 = useResponsiveSize(20);
  const bookData = getBookData(bookKey);
  const viewSettings = getViewSettings(bookKey)!;
  useSettingsStore((state) => state.settings.aiSettings);
  const grant = useTranslationSessionStore((state) => state.grants[bookKey]);
  const context = getTranslationConsentContext(
    viewSettings.translationProvider,
    viewSettings.translateTargetLang,
  );
  const requestEnabled = !!grant && grant.context === context && !grant.controller.signal.aborted;
  const [translationEnabled, setTranslationEnabled] = useState(viewSettings.translationEnabled!);
  const [translationAvailable, setTranslationAvailable] = useState(
    isTranslationAvailable(bookData?.book, viewSettings.translateTargetLang),
  );

  useEffect(() => {
    if (translationEnabled === viewSettings.translationEnabled) return;
    if (appService?.isMobile) {
      setHoveredBookKey('');
    }
    saveViewSettings(envConfig, bookKey, 'translationEnabled', translationEnabled, true, false);
    viewSettings.translationEnabled = translationEnabled;
    setViewSettings(bookKey, { ...viewSettings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationEnabled]);

  useEffect(() => {
    setTranslationEnabled(viewSettings.translationEnabled);
    setTranslationAvailable(
      isTranslationAvailable(bookData?.book, viewSettings.translateTargetLang),
    );
  }, [bookData, viewSettings.translationEnabled, viewSettings.translateTargetLang]);

  return (
    <Button
      icon={
        <RiTranslate
          className={requestEnabled ? 'text-blue-500' : 'text-base-content'}
          size={iconSize20}
        />
      }
      aria-label={_('Toggle Translation')}
      disabled={!translationAvailable && !translationEnabled}
      onClick={() => {
        const next = !requestEnabled;
        const session = useTranslationSessionStore.getState();
        if (next) session.grant(bookKey, context);
        else session.revoke(bookKey);
        setTranslationEnabled(next);
      }}
      label={
        translationAvailable
          ? requestEnabled
            ? _('Disable Translation')
            : _('Enable Translation')
          : _('Translation Disabled')
      }
    ></Button>
  );
};

export default TranslationToggler;
