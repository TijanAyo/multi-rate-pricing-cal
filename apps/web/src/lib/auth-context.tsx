'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, tokenStore } from './api';
import type { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the stored token has been checked against the server. */
  loading: boolean;
  logIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // A token in localStorage is only a claim; it is verified against /auth/me
  // before the app trusts it, so a revoked or expired session is caught on load
  // rather than at the first data fetch.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }

    api
      .me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const logIn = useCallback(
    async (email: string, password: string) => {
      const result = await api.login(email, password);
      tokenStore.set(result.accessToken);
      setUser(result.user);
      router.push('/documents');
    },
    [router],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const result = await api.signup(email, password);
      tokenStore.set(result.accessToken);
      setUser(result.user);
      router.push('/documents');
    },
    [router],
  );

  const logOut = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    router.push('/login');
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, logIn, signUp, logOut }),
    [user, loading, logIn, signUp, logOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}
