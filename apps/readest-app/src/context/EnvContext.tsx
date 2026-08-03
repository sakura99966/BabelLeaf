'use client';

import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { EnvConfigType } from '../services/environment';
import { AppService } from '@/types/system';
import env from '../services/environment';

export interface EnvContextType {
  envConfig: EnvConfigType;
  appService: AppService | null;
}

const EnvContext = createContext<EnvContextType | undefined>(undefined);

export const EnvProvider = ({ children }: { children: ReactNode }) => {
  const [envConfig] = useState<EnvConfigType>(env);
  const [appService, setAppService] = useState<AppService | null>(null);

  React.useEffect(() => {
    void envConfig.getAppService().then(setAppService);
    const handleWindowError = (e: ErrorEvent) => {
      if (e.message === 'ResizeObserver loop limit exceeded') {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    window.addEventListener('error', handleWindowError);
    return () => window.removeEventListener('error', handleWindowError);
  }, [envConfig]);

  const value = useMemo(() => ({ envConfig, appService }), [envConfig, appService]);
  return <EnvContext.Provider value={value}>{children}</EnvContext.Provider>;
};

/**
 * Supplies an already-created environment value. Production uses EnvProvider;
 * this narrow provider also gives browser tests a deterministic local-only
 * environment without relying on module mocks across browser workers.
 */
export const EnvContextProvider = ({
  value,
  children,
}: {
  value: EnvContextType;
  children: ReactNode;
}) => <EnvContext.Provider value={value}>{children}</EnvContext.Provider>;

export const useEnv = (): EnvContextType => {
  const context = useContext(EnvContext);
  if (!context) throw new Error('useEnv must be used within EnvProvider');
  return context;
};
