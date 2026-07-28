'use client';

import type { ReactNode } from 'react';

/**
 * Temporary source-compatibility shape for components being detached from the
 * retired Readest account service. BabelLeaf never creates a user or token.
 */
export interface LegacyUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

interface AuthContextType {
  token: null;
  user: LegacyUser | null;
  login: (_token: string, _user: LegacyUser) => void;
  logout: () => void;
  refresh: () => void;
}

const LOCAL_AUTH: AuthContextType = {
  token: null,
  user: null,
  login: () => undefined,
  logout: () => undefined,
  refresh: () => undefined,
};

/**
 * Kept only while inherited consumers are simplified. It performs no network
 * work and stores no credentials.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => children;

export const useAuth = (): AuthContextType => LOCAL_AUTH;
