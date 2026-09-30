'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError, formatCurrency, type VoidPreview } from '@/lib/api';
import { confirmationFailure } from '@/lib/financial-confirmation';
import { useLeaveGuard } from '@/lib/pending-work';

interface VoidRecord {
  id: string;
  title: string;
  revision: number;
  currency: 'USD' | 'THB';
}

export function VoidConfirmation<T extends VoidRecord>({
  record,
  kind,
  pendingBill = false,
  onCancel,
  onVoided,
  previewAction,
  confirmAction,
}: {
  record: T;
  kind: 'expense' | 'bill';
  pendingBill?: boolean;
  onCancel: () => void;
  onVoided: (record: T) => void;
  previewAction: (reason: string) => Promise<VoidPreview>;
  confirmAction: (
    reason: string,
    previewId: string,
    idempotencyKey: string,
  ) => Promise<T>;
}) {
  useLeaveGuard(true);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<VoidPreview | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [retryKey, setRetryKey] = useState('');
  const [busy, setBusy] = useState<'preview' | 'confirm' | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);

  function changeReason(value: string) {
    generation.current += 1;
    setReason(value);
    setPreview(null);
    setAccepted(false);
    setRetryKey('');
    setError('');
  }

  async function showEffect() {
    const cleanedReason = reason.trim();
    if (!cleanedReason) {
      setError('Enter a reason for removing this mistaken record.');
      return;
    }
    const currentGeneration = ++generation.current;
    setBusy('preview');
    setError('');
    setPreview(null);
    setAccepted(false);
    try {
      const result = await previewAction(cleanedReason);
      if (currentGeneration !== generation.current) return;
      setPreview(result);
      setRetryKey(crypto.randomUUID());
    } catch (cause) {
      if (currentGeneration === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not preview the void.',
        );
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!preview || !accepted || !retryKey) return;
    if (
      Date.now() >= Date.parse(preview.expiresAt) &&
      !error.startsWith('Not yet confirmed: HouseMate')
    ) {
      setPreview(null);
      setAccepted(false);
      setError('This preview expired. Preview the effect again.');
      return;
    }
    setBusy('confirm');
    setError('');
    try {
      const result = await confirmAction(
        preview.reason ?? reason.trim(),
        preview.previewId,
        retryKey,
      );
      onVoided(result);
    } catch (cause) {
      if (
        cause instanceof ApiRequestError &&
        ['PREVIEW_REQUIRED', 'STALE_RECORD', 'ALREADY_VOIDED'].includes(
          cause.code,
        )
      ) {
        setPreview(null);
        setAccepted(false);
        setRetryKey('');
      }
      setError(confirmationFailure(cause, 'mistaken-record removal'));
    } finally {
      setBusy(null);
    }
  }

  const money = (amount: number) =>
    `${formatCurrency(amount, record.currency)} ${record.currency}`;
  return (
    <section
      className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
      aria-label={`Remove mistaken ${kind}`}
    >
      <h4 className="font-medium">
        Remove mistaken {kind}: {record.title}?
      </h4>
      <p className="text-muted-foreground">
        This will void the {kind}. It will remain in history with your reason.{' '}
        {pendingBill
          ? 'It will leave pending bills without changing member balances.'
          : 'Its shares will no longer count toward member balances.'}{' '}
        Recorded settlements remain unchanged. You cannot edit it after voiding.
        {kind === 'bill' && ' Its provider status cannot be changed.'}
      </p>
      <label htmlFor={`void-reason-${record.id}`} className="block space-y-1">
        <span>Reason</span>
        <Input
          id={`void-reason-${record.id}`}
          value={reason}
          maxLength={500}
          onChange={(event) => changeReason(event.target.value)}
          placeholder="What was entered by mistake?"
          required
          disabled={busy === 'confirm'}
        />
      </label>
      <Button
        variant="outline"
        disabled={busy !== null}
        onClick={() => void showEffect()}
      >
        {busy === 'preview' ? 'Calculating…' : 'Preview removal effect'}
      </Button>
      {preview && (
        <div className="space-y-2 rounded-lg border border-border bg-background p-3">
          <p className="font-medium">
            Balance effect based on current records:
          </p>
          {preview.balanceEffects.length ? (
            <ul className="space-y-1">
              {preview.balanceEffects.map((effect) => (
                <li
                  key={effect.memberId}
                  className="flex flex-wrap justify-between gap-2"
                >
                  <span>{effect.displayName} balance</span>
                  <span>
                    {money(effect.beforeMinor)} → {money(effect.afterMinor)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No member balance changes.</p>
          )}
          {preview.pendingBillCountBefore !== preview.pendingBillCountAfter && (
            <p>
              Pending bills: {preview.pendingBillCountBefore} →{' '}
              {preview.pendingBillCountAfter}; total{' '}
              {money(preview.pendingBillAmountMinorBefore)} →{' '}
              {money(preview.pendingBillAmountMinorAfter)}.
            </p>
          )}
          <label className="flex items-start gap-2 pt-2">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="mt-1"
            />
            <span>
              I understand this {kind} will be voided, removed from active
              totals, and kept in history.
            </span>
          </label>
          <Button
            variant="destructive"
            disabled={!accepted || busy !== null}
            onClick={() => void confirm()}
          >
            {busy === 'confirm' ? 'Removing…' : `Remove mistaken ${kind}`}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button variant="ghost" disabled={busy === 'confirm'} onClick={onCancel}>
        Cancel
      </Button>
    </section>
  );
}
