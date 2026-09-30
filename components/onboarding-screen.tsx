'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  KeyRound,
  LogOut,
  UsersRound,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ApiRequestError,
  type Currency,
  createHousehold,
  type Household,
} from '@/lib/api';
import { parseInviteInput } from '@/lib/invites';
import { Brand } from './brand';

export function OnboardingScreen({
  token,
  client,
  onCreated,
  onJoinInvite,
  initialMode = 'choose',
  onCancel,
}: {
  token: string;
  client: SupabaseClient | null;
  onCreated: (household: Household) => void;
  onJoinInvite: (inviteToken: string) => void;
  initialMode?: 'choose' | 'create' | 'join';
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>(initialMode);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('THB');
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [joinInput, setJoinInput] = useState('');

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const inviteToken = parseInviteInput(joinInput, window.location.origin);
    if (!inviteToken) {
      setError('Paste a HouseMate invitation link or its code.');
      return;
    }
    setError('');
    onJoinInvite(inviteToken);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setError('');
    setSaving(true);
    try {
      const household = await createHousehold(token, {
        name: name.trim(),
        currency,
        timezone: timezone.trim(),
      });
      onCreated(household);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Could not create your household. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="onboard-page">
      <header className="onboard-header">
        <Brand />
        <Button
          variant="ghost"
          className="text-button"
          type="button"
          onClick={() => (onCancel ? onCancel() : client?.auth.signOut())}
        >
          {onCancel ? <ArrowLeft size={16} /> : <LogOut size={16} />}
          {onCancel ? 'Back to household' : 'Sign out'}
        </Button>
      </header>
      <div className="onboard-content">
        <div className="step-indicator">
          <span className="step-current">1</span>
          <span className="step-connector" />
          <span>2</span>
          <p>LET&apos;S SETTLE IN</p>
        </div>

        {mode === 'choose' && (
          <>
            <span className="eyebrow">THE FIRST STEP</span>
            <h1>
              Every good home
              <br />
              <em>starts together.</em>
            </h1>
            <p className="onboard-intro">
              Create a space for your household, or join one you&apos;ve been
              invited to.
            </p>
            <div className="choice-list">
              <button
                className="choice-card"
                type="button"
                onClick={() => setMode('create')}
              >
                <span className="choice-icon choice-icon-green">
                  <UsersRound size={23} />
                </span>
                <span className="choice-copy">
                  <strong>Create a household</strong>
                  <small>Start fresh and invite your housemates.</small>
                </span>
                <ChevronRight size={20} />
              </button>
              <button
                className="choice-card"
                type="button"
                onClick={() => setMode('join')}
              >
                <span className="choice-icon choice-icon-gold">
                  <KeyRound size={23} />
                </span>
                <span className="choice-copy">
                  <strong>Join a household</strong>
                  <small>Already have an invitation?</small>
                </span>
                <ChevronRight size={20} />
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <Button
              variant="ghost"
              className="back-button"
              type="button"
              onClick={() => setMode('choose')}
            >
              <ArrowLeft size={17} /> Back
            </Button>
            <span className="eyebrow">MAKE IT YOURS</span>
            <h1>
              Give your place
              <br />
              <em>a name.</em>
            </h1>
            <p className="onboard-intro">
              A few details now, and you&apos;ll be ready to organize life
              together.
            </p>
            <form className="onboard-form" onSubmit={submit}>
              <label htmlFor="household-name">Household name</label>
              <Input
                id="household-name"
                className="field"
                placeholder="e.g. The Green House"
                maxLength={120}
                autoComplete="off"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <span className="form-label field-label-gap">
                Household currency
              </span>
              <p className="field-help">
                Choose the currency you&apos;ll use for shared expenses and
                balances.
              </p>
              <div
                className="currency-options"
                role="radiogroup"
                aria-label="Household currency"
              >
                <label
                  className={`currency-option ${currency === 'THB' ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="currency"
                    value="THB"
                    checked={currency === 'THB'}
                    onChange={() => setCurrency('THB')}
                  />
                  <span className="currency-symbol">฿</span>
                  <span>
                    <strong>Thai Baht</strong>
                    <small>THB</small>
                  </span>
                  {currency === 'THB' && <Check size={18} />}
                </label>
                <label
                  className={`currency-option ${currency === 'USD' ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="currency"
                    value="USD"
                    checked={currency === 'USD'}
                    onChange={() => setCurrency('USD')}
                  />
                  <span className="currency-symbol">$</span>
                  <span>
                    <strong>US Dollar</strong>
                    <small>USD</small>
                  </span>
                  {currency === 'USD' && <Check size={18} />}
                </label>
              </div>
              <label htmlFor="timezone" className="field-label-gap">
                Timezone
              </label>
              <Input
                id="timezone"
                className="field"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                required
                aria-describedby="timezone-help"
              />
              <p id="timezone-help" className="field-help">
                Use a timezone like Asia/Bangkok or America/New_York.
              </p>
              {error && (
                <p className="form-message error" role="alert">
                  {error}
                </p>
              )}
              <Button
                className="primary-button create-submit"
                type="submit"
                disabled={saving || !name.trim()}
              >
                {saving ? 'Creating your home…' : 'Create household'}{' '}
                <ArrowRight size={18} />
              </Button>
            </form>
          </>
        )}

        {mode === 'join' && (
          <>
            <Button
              variant="ghost"
              className="back-button"
              type="button"
              onClick={() => setMode('choose')}
            >
              <ArrowLeft size={17} /> Back
            </Button>
            <span className="eyebrow">JOIN YOUR PEOPLE</span>
            <h1>
              There&apos;s room
              <br />
              <em>for you.</em>
            </h1>
            <p className="onboard-intro">
              Ask a household owner or admin for a shareable invitation. Each
              link works once and expires after seven days.
            </p>
            <form className="onboard-form" onSubmit={submitJoin}>
              <label htmlFor="join-invite-input">Invitation link or code</label>
              <Input
                id="join-invite-input"
                className="field"
                value={joinInput}
                onChange={(event) => setJoinInput(event.target.value)}
                placeholder="Paste your invitation"
                required
              />
              {error && (
                <p className="form-message error" role="alert">
                  {error}
                </p>
              )}
              <Button className="primary-button" type="submit">
                Check invitation <ArrowRight size={17} />
              </Button>
            </form>
            <Button
              variant="outline"
              className="secondary-button"
              type="button"
              onClick={() => setMode('create')}
            >
              Create a household instead <ArrowRight size={17} />
            </Button>
          </>
        )}
      </div>
      <footer className="onboard-footer">
        A little more organized. A lot more at home.
      </footer>
    </main>
  );
}
