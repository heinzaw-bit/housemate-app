'use client';

import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { describeAuthFailure, readAuthRedirectError } from './auth-errors';

interface AuthState {
  client: SupabaseClient | null;
  session: Session | null;
  checking: boolean;
  configured: boolean;
  error: string;
}

const AuthContext = createContext<AuthState>({
  client: null,
  session: null,
  checking: true,
  configured: false,
  error: '',
});

let browserClient: SupabaseClient | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    client: null,
    session: null,
    checking: true,
    configured: false,
    error: '',
  });

  useEffect(() => {
    const redirectError = readAuthRedirectError(window.location.href);
    if (redirectError) {
      window.history.replaceState(null, '', redirectError.cleanedUrl);
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (
      !url ||
      !key ||
      url.includes('YOUR_PROJECT') ||
      key.includes('REPLACE_ME')
    ) {
      setState((current) => ({
        client: null,
        session: null,
        checking: false,
        configured: false,
        error: redirectError?.message ?? current.error,
      }));
      return;
    }

    if (!browserClient) {
      browserClient = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
    const client = browserClient;
    let active = true;
    let sawAuthChange = false;
    setState((current) => ({
      ...current,
      client,
      configured: true,
      error: redirectError?.message ?? current.error,
    }));
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (active)
          setState((current) => ({
            ...current,
            session: sawAuthChange ? current.session : data.session,
            checking: false,
            error: error
              ? describeAuthFailure(error, 'session')
              : (redirectError?.message ?? (data.session ? '' : current.error)),
          }));
      })
      .catch((error: unknown) => {
        if (active)
          setState((current) => ({
            ...current,
            session: sawAuthChange ? current.session : null,
            checking: false,
            error: describeAuthFailure(
              error instanceof Error ? error : null,
              'session',
            ),
          }));
      });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION') sawAuthChange = true;
      if (active)
        setState((current) => ({
          ...current,
          client,
          session,
          checking: false,
          configured: true,
          error:
            event === 'INITIAL_SESSION' && redirectError
              ? redirectError.message
              : session
                ? ''
                : current.error,
        }));
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
