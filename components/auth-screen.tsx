'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, CircleCheck, Home, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { describeAuthFailure } from '@/lib/auth-errors';
import { Brand } from './brand';
import { InstallApp } from './install-app';
import { ThemeToggle } from './theme-toggle';

export function AuthScreen({
  client,
  configured,
  callbackError,
  joinPending = false,
  signedOut = false,
}: {
  client: SupabaseClient | null;
  configured: boolean;
  callbackError: string;
  joinPending?: boolean;
  signedOut?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [dismissedCallbackError, setDismissedCallbackError] = useState(false);
  const [startingGoogle, setStartingGoogle] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const receiptTitle = useRef<HTMLHeadingElement>(null);
  const changingEmail = useRef(false);
  const googleEnabled =
    configured && process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true';

  useEffect(() => {
    if (sent) receiptTitle.current?.focus();
    else if (changingEmail.current) {
      emailInput.current?.focus();
      changingEmail.current = false;
    }
  }, [sent]);

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setSending(true);
    setError('');
    setDismissedCallbackError(true);
    try {
      const { error: authError } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (authError) setError(describeAuthFailure(authError, 'email'));
      else setSent(true);
    } catch (failure) {
      setError(
        describeAuthFailure(failure instanceof Error ? failure : null, 'email'),
      );
    } finally {
      setSending(false);
    }
  }

  async function signInWithGoogle() {
    if (!client || !googleEnabled || startingGoogle) return;
    setError('');
    setDismissedCallbackError(true);
    setStartingGoogle(true);
    try {
      const { error: authError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (authError) setError(describeAuthFailure(authError, 'google'));
    } catch (failure) {
      setError(
        describeAuthFailure(
          failure instanceof Error ? failure : null,
          'google',
        ),
      );
    } finally {
      setStartingGoogle(false);
    }
  }

  const description = joinPending
    ? 'Sign in to review your household invitation.'
    : 'Use the same account to return to your household. New here? You can set up a household after signing in.';

  return (
    <main className="auth-page">
      <header className="auth-header">
        <Link href="/" aria-label="HouseMate home">
          <Brand />
        </Link>
        <ThemeToggle />
      </header>
      <div className="auth-shell">
        <section className="auth-panel" aria-labelledby="sign-in-heading">
          <h1 id="sign-in-heading">
            {joinPending ? 'Join your household' : 'Sign in to HouseMate'}
          </h1>
          <p className="auth-subtitle">{description}</p>
          {signedOut && (
            <p className="auth-status" role="status">
              <CircleCheck size={20} aria-hidden="true" />
              You’ve signed out.
            </p>
          )}
          {(error || (!dismissedCallbackError && callbackError)) && (
            <p className="form-message error" role="alert">
              {error || callbackError}
            </p>
          )}

          {!configured ? (
            <p className="form-message muted" role="status">
              Sign-in is temporarily unavailable.
            </p>
          ) : (
            <div className="auth-methods">
              {googleEnabled && (
                <>
                  <Button
                    variant="outline"
                    className="google-button"
                    type="button"
                    onClick={signInWithGoogle}
                    disabled={startingGoogle || sending}
                  >
                    <span className="google-g" aria-hidden="true">
                      G
                    </span>
                    {startingGoogle
                      ? 'Opening Google…'
                      : 'Continue with Google'}
                    <ArrowRight size={18} aria-hidden="true" />
                  </Button>
                  <p className="auth-divider">or use email</p>
                </>
              )}
              {sent ? (
                <div className="auth-receipt" role="status">
                  <h2 ref={receiptTitle} tabIndex={-1}>
                    Check your inbox
                  </h2>
                  <p>
                    Open the sign-in link we sent to{' '}
                    <strong>{email.trim()}</strong>.
                  </p>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      changingEmail.current = true;
                      setEmail('');
                      setSent(false);
                      setError('');
                    }}
                  >
                    Use a different email
                  </Button>
                </div>
              ) : (
                <form onSubmit={sendLink} className="auth-form">
                  <label htmlFor="email">Email address</label>
                  <Input
                    ref={emailInput}
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-describedby="email-sign-in-help"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setError('');
                      setDismissedCallbackError(true);
                    }}
                    required
                    disabled={sending || startingGoogle}
                  />
                  <p id="email-sign-in-help">We’ll email you a sign-in link.</p>
                  <Button
                    className="auth-submit"
                    type="submit"
                    disabled={sending || startingGoogle}
                  >
                    {sending ? 'Sending link…' : 'Send sign-in link'}
                    {!sending && <ArrowRight size={18} aria-hidden="true" />}
                  </Button>
                </form>
              )}
            </div>
          )}

          {process.env.NODE_ENV === 'development' && (
            <Link href="/preview" className="auth-preview-link">
              Try the demo with sample data{' '}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </section>
        <aside className="auth-guide" aria-labelledby="auth-guide-heading">
          <h2 id="auth-guide-heading">Get your household set up</h2>
          <ul className="auth-next-steps">
            <li>
              <span className="auth-step-icon">
                <Home size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>Starting a household?</strong>
                <p>
                  Sign in, create a household, and invite the people you live
                  with.
                </p>
              </div>
            </li>
            <li>
              <span className="auth-step-icon">
                <UsersRound size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>Joining a household?</strong>
                <p>
                  Open your housemate’s invitation link and sign in to join.
                </p>
              </div>
            </li>
          </ul>
          <Link href="/#how-it-works" className="auth-learn-link">
            See how HouseMate works <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <InstallApp />
        </aside>
      </div>
    </main>
  );
}
