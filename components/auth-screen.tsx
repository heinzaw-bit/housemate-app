'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ArrowRight,
  HeartHandshake,
  Mail,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { describeAuthFailure } from '@/lib/auth-errors';
import { Brand } from './brand';
import { InstallApp } from './install-app';

export function AuthScreen({
  client,
  configured,
  callbackError,
  joinPending = false,
}: {
  client: SupabaseClient | null;
  configured: boolean;
  callbackError: string;
  joinPending?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [dismissedCallbackError, setDismissedCallbackError] = useState(false);
  const [startingGoogle, setStartingGoogle] = useState(false);
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true';

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

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-story" aria-label="About HouseMate">
          <Brand />
          <div className="auth-story-copy">
            <span className="eyebrow eyebrow-light">
              <span className="eyebrow-line" /> A BETTER WAY TO LIVE TOGETHER
            </span>
            <h1>
              House life,
              <br />
              <span>in sync.</span>
            </h1>
            <p>
              Split the shared stuff. Stay on top of the little things. Make
              more room for what makes a house a home.
            </p>
            <div className="story-points">
              <div>
                <span className="story-point-icon">
                  <HeartHandshake size={18} />
                </span>
                <span>Less back-and-forth, more together.</span>
              </div>
              <div>
                <span className="story-point-icon">
                  <Sparkles size={18} />
                </span>
                <span>Everything your household needs, in one place.</span>
              </div>
            </div>
          </div>
          <div className="auth-story-footer">
            <span className="story-footer-mark">✳</span> Made for the people you
            share a home with.
          </div>
          <div
            className="story-decoration story-decoration-one"
            aria-hidden="true"
          />
          <div
            className="story-decoration story-decoration-two"
            aria-hidden="true"
          />
        </section>

        <section className="auth-panel" aria-labelledby="sign-in-heading">
          <div className="auth-panel-top">
            <span className="welcome-pill">
              <span /> YOUR HOME STARTS HERE
            </span>
          </div>
          <div className="auth-form-wrap">
            <div className="auth-heading-icon">
              <ShieldCheck size={25} strokeWidth={1.8} />
            </div>
            <h2 id="sign-in-heading">Welcome home.</h2>
            <p className="auth-subtitle">
              {joinPending
                ? 'Sign in to review your household invitation.'
                : 'Sign in to bring your household together.'}
            </p>

            <Button
              variant="outline"
              className="google-button"
              type="button"
              onClick={signInWithGoogle}
              disabled={!configured || !googleEnabled || startingGoogle}
            >
              <span className="google-g" aria-hidden="true">
                G
              </span>
              {startingGoogle ? 'Opening Google…' : 'Continue with Google'}
              <ArrowRight size={17} aria-hidden="true" />
            </Button>
            {configured && !googleEnabled && (
              <p className="form-message muted" role="status">
                Google sign-in is not configured yet. Use an email link for now.
              </p>
            )}

            <div className="auth-divider">
              <span /> or continue with email <span />
            </div>

            <form onSubmit={sendLink} className="auth-form">
              <label htmlFor="email">Email address</label>
              <div className="input-wrap">
                <Mail size={18} aria-hidden="true" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError('');
                    setDismissedCallbackError(true);
                  }}
                  required
                  disabled={!configured || sending || sent}
                />
              </div>
              <Button
                className="primary-button auth-submit"
                type="submit"
                disabled={!configured || sending || sent}
              >
                {sending
                  ? 'Sending link…'
                  : sent
                    ? 'Link sent'
                    : 'Send me a sign-in link'}
                {!sending && <ArrowRight size={18} aria-hidden="true" />}
              </Button>
            </form>

            {sent && (
              <div>
                <p className="form-message success" role="status">
                  Check {email.trim()} for a secure sign-in link.
                </p>
                <Button
                  variant="ghost"
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setError('');
                  }}
                >
                  Use a different email
                </Button>
              </div>
            )}
            {(error || (!dismissedCallbackError && callbackError)) && (
              <p className="form-message error" role="alert">
                {error || callbackError}
              </p>
            )}
            {!configured && (
              <p className="form-message muted" role="status">
                Sign-in is temporarily unavailable.
              </p>
            )}

            {process.env.NODE_ENV === 'development' && (
              <Link href="/preview" className="auth-preview-link">
                Explore the design without signing in <ArrowRight size={16} />
              </Link>
            )}

            <p className="auth-fineprint">
              By continuing, you&apos;re joining a calmer way to manage the
              place you share.
            </p>
            <InstallApp />
          </div>
          <div className="auth-panel-bottom">
            <span className="small-sun" aria-hidden="true">
              ✳
            </span>{' '}
            Good things happen under one roof.
          </div>
        </section>
      </div>
    </main>
  );
}
