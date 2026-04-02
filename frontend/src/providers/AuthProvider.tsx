import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { apiClient } from '@/api/client';
import { parseAuthTokensFromHash } from '@/hooks/authTokens';
import {
  AUTH_TOKEN_KEY,
  AuthContext,
  type AuthContextType,
  REFRESH_TOKEN_KEY,
} from '@/hooks/useAuth';
import type { User } from '@/types';

interface AuthProviderProps {
  children: ReactNode;
}

async function fetchCurrentUser(): Promise<User | null> {
  try {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  } catch {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    return null;
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const initializeAuth = async () => {
      const parsedTokens = parseAuthTokensFromHash(window.location.hash);

      if (parsedTokens) {
        localStorage.setItem(AUTH_TOKEN_KEY, parsedTokens.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, parsedTokens.refreshToken);

        const newUrl = window.location.pathname + window.location.search;
        window.history.replaceState({}, document.title, newUrl);
      }

      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        if (!cancelled) {
          setUser(null);
          setIsAuthenticated(false);
          setIsLoading(false);
        }
        return;
      }

      const currentUser = await fetchCurrentUser();
      if (cancelled) {
        return;
      }

      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser));
      setIsLoading(false);
    };

    void initializeAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  const login: AuthContextType['login'] = (accessToken, refreshToken) => {
    localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    setIsLoading(true);

    void (async () => {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser));
      setIsLoading(false);
    })();
  };

  const logout: AuthContextType['logout'] = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setIsAuthenticated(false);
    setUser(null);
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
