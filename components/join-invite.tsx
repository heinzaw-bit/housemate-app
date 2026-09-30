'use client';

import { ArrowRight, KeyRound, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ApiRequestError,
  acceptInvite,
  getHousehold,
  type Household,
  type InvitePreview,
  previewInvite,
} from '@/lib/api';
import { Brand } from './brand';

export function JoinInvite({
  token,
  inviteToken,
  onAccepted,
  onCancel,
}: {
  token: string;
  inviteToken: string;
  onAccepted: (household: Household) => void;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry intentionally reruns the invitation lookup.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    previewInvite(token, inviteToken)
      .then((value) => {
        if (active) setPreview(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof ApiRequestError
              ? cause.message
              : 'Could not check this invitation. Please try again.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, inviteToken, retry]);

  async function join() {
    if (!preview || joining) return;
    setJoining(true);
    setError('');
    try {
      onAccepted(await acceptInvite(token, inviteToken));
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.code === 'ALREADY_MEMBER') {
        try {
          onAccepted(await getHousehold(token, preview.householdId));
          return;
        } catch {
          // Keep the original, useful membership error below.
        }
      }
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Could not join this household. Please try again.',
      );
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="onboard-page">
      <header className="onboard-header">
        <Brand />
      </header>
      <Card className="onboard-content invite-card">
        <span className="eyebrow">HOUSEHOLD INVITATION</span>
        <h1>
          Join your <em>people.</em>
        </h1>
        {loading ? (
          <p className="onboard-intro">
            <LoaderCircle className="spin" size={18} /> Checking invitation…
          </p>
        ) : preview ? (
          <>
            <p className="onboard-intro">
              You have been invited to <strong>{preview.householdName}</strong>.
              This link can be used once and expires on{' '}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
              }).format(new Date(preview.expiresAt))}
              .
            </p>
            <Button
              className="primary-button"
              type="button"
              onClick={join}
              disabled={joining}
            >
              <KeyRound size={17} /> {joining ? 'Joining…' : 'Join household'}{' '}
              <ArrowRight size={17} />
            </Button>
          </>
        ) : null}
        {error && (
          <p className="form-message error" role="alert">
            {error}
          </p>
        )}
        {error && !preview && (
          <Button
            variant="outline"
            className="secondary-button"
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Check again
          </Button>
        )}
        <Button
          variant="ghost"
          className="text-button join-cancel"
          type="button"
          onClick={onCancel}
        >
          {preview ? 'Not now' : 'Dismiss invitation'}
        </Button>
      </Card>
    </main>
  );
}
