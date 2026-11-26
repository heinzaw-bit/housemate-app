'use client';

import { ListFilter } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { SuccessNotice } from '@/components/success-notice';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WorkspaceLoading } from '@/components/workspace-loading';
import {
  ApiRequestError,
  type BalanceSummary,
  createSettlement,
  formatCurrency,
  getBalances,
  getSettlement,
  getSettlements,
  type Household,
  previewSettlement,
  type Settlement,
  type SettlementDraft,
  type SettlementPreview,
} from '@/lib/api';
import { balanceLabel, balancePresentation } from '@/lib/balance-presentation';
import { moneyHref } from '@/lib/dashboard';
import { confirmationFailure } from '@/lib/financial-confirmation';
import { useLeaveGuard, usePendingWork } from '@/lib/pending-work';
import { householdReadPath, recentRead } from '@/lib/recent-reads';
import { useRefreshOnReturn } from '@/lib/use-refresh-on-return';

const transferHistoryId = 'recorded-transfers';
const transferPageSize = 50;
const transferPreviewSize = 2;

function parseMinor(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const result = Number(
    BigInt(whole ?? '0') * BigInt(100) + BigInt(fraction.padEnd(2, '0')),
  );
  return Number.isSafeInteger(result) && result <= 999_999_999_999
    ? result
    : null;
}
function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
function readableDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}
function amountText(value: number, currency: Household['defaultCurrency']) {
  return formatCurrency(value, currency);
}
function balanceText(
  netMinor: number,
  currency: Household['defaultCurrency'],
  personal = false,
) {
  const label = balanceLabel(netMinor, personal);
  return netMinor === 0
    ? label
    : `${label} ${amountText(Math.abs(netMinor), currency)}`;
}
export function BalanceWorkspace({
  household,
  token,
  initialRecordId,
  settlementView = false,
}: {
  household: Household;
  token: string;
  initialRecordId?: string;
  settlementView?: boolean;
}) {
  const pendingWork = usePendingWork();
  const loadRequest = useRef(0);
  const transferPages = useRef(1);
  const [linkedTransfer, setLinkedTransfer] = useState<Settlement | null>(null);
  const [linkedError, setLinkedError] = useState('');
  const [linkedRetry, setLinkedRetry] = useState(0);
  const [summary, setSummary] = useState<BalanceSummary | null>(
    () =>
      recentRead<BalanceSummary>(
        token,
        householdReadPath(household.id, 'balances'),
      )?.value ?? null,
  );
  const [settlements, setSettlements] = useState<Settlement[]>(
    () =>
      recentRead<{ settlements: Settlement[] }>(
        token,
        householdReadPath(household.id, 'settlements?limit=50&offset=0'),
      )?.value.settlements ?? [],
  );
  const [hasMoreSettlements, setHasMoreSettlements] = useState(false);
  const [transfersExpanded, setTransfersExpanded] = useState(false);
  const transfersId = useId();
  const [loading, setLoading] = useState(true);
  const [loadingMoreSettlements, setLoadingMoreSettlements] = useState(false);
  const [loadError, setLoadError] = useState('');
  const summaryReady = summary !== null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry reloads the linked transfer.
  useEffect(() => {
    if (!initialRecordId) return;
    let active = true;
    setLinkedError('');
    getSettlement(token, household.id, initialRecordId)
      .then((record) => {
        if (active) setLinkedTransfer(record);
      })
      .catch((error: unknown) => {
        if (active)
          setLinkedError(
            error instanceof Error
              ? error.message
              : 'Could not open this transfer.',
          );
      });
    return () => {
      active = false;
    };
  }, [initialRecordId, household.id, token, linkedRetry]);

  useEffect(() => {
    if (initialRecordId && summaryReady && (linkedTransfer || linkedError)) {
      const detail = document.getElementById('linked-transfer');
      detail?.scrollIntoView({ block: 'start' });
      detail?.focus({ preventScroll: true });
    }
  }, [initialRecordId, summaryReady, linkedTransfer, linkedError]);

  useEffect(() => {
    // The history card may mount after the router handles the fragment.
    if (
      !settlementView ||
      !summaryReady ||
      window.location.hash !== `#${transferHistoryId}`
    )
      return;
    setTransfersExpanded(true);
    const history = document.getElementById(transferHistoryId);
    history?.scrollIntoView({ block: 'start' });
    history?.focus({ preventScroll: true });
  }, [settlementView, summaryReady]);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError('');
    try {
      const [nextSummary, pages] = await Promise.all([
        getBalances(token, household.id),
        Promise.all(
          Array.from({ length: transferPages.current }, (_, index) =>
            getSettlements(
              token,
              household.id,
              transferPageSize,
              index * transferPageSize,
            ),
          ),
        ),
      ]);
      if (request !== loadRequest.current) return;
      setSummary(nextSummary);
      setSettlements([
        ...new Map(
          pages.flat().map((transfer) => [transfer.id, transfer]),
        ).values(),
      ]);
      setHasMoreSettlements(pages.at(-1)?.length === transferPageSize);
    } catch (error) {
      if (request !== loadRequest.current) return;
      if (
        error instanceof ApiRequestError &&
        [401, 403, 404].includes(error.status)
      ) {
        setSummary(null);
        setSettlements([]);
        setLinkedTransfer(null);
      }
      setLoadError(
        error instanceof Error ? error.message : 'Could not load balances.',
      );
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [household.id, token]);

  useRefreshOnReturn(load, !pendingWork, 15_000, household.id);
  useEffect(() => {
    void load();
    return () => {
      loadRequest.current += 1;
    };
  }, [load]);

  async function loadMoreSettlements() {
    const request = loadRequest.current;
    setLoadingMoreSettlements(true);
    setLoadError('');
    try {
      const next = await getSettlements(
        token,
        household.id,
        transferPageSize,
        transferPages.current * transferPageSize,
      );
      if (request !== loadRequest.current) return;
      setSettlements((old) => [
        ...old,
        ...next.filter(
          (item) => !old.some((settlement) => settlement.id === item.id),
        ),
      ]);
      transferPages.current += 1;
      setHasMoreSettlements(next.length === transferPageSize);
    } catch (error) {
      if (request !== loadRequest.current) return;
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load more transfers.',
      );
    } finally {
      setLoadingMoreSettlements(false);
    }
  }

  // Match the API's transfer-date order, including a newly recorded backdated transfer.
  const orderedSettlements = [...settlements].sort(
    (a, b) =>
      b.settledOn.localeCompare(a.settledOn) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
  const visibleSettlements = orderedSettlements.slice(
    0,
    transfersExpanded ? undefined : transferPreviewSize,
  );
  const transferToggle = (settlements.length > transferPreviewSize ||
    hasMoreSettlements) && (
    <Button
      variant="ghost"
      size="sm"
      aria-label={
        transfersExpanded
          ? 'Show fewer recorded transfers'
          : 'View all recorded transfers'
      }
      aria-expanded={transfersExpanded}
      aria-controls={transfersId}
      onClick={() => setTransfersExpanded((old) => !old)}
    >
      {transfersExpanded ? 'Show less' : 'View all'}
    </Button>
  );
  const loadMoreTransfers = transfersExpanded && hasMoreSettlements && (
    <Button
      variant="outline"
      disabled={loading || loadingMoreSettlements}
      onClick={() => void loadMoreSettlements()}
    >
      {loadingMoreSettlements ? 'Loading…' : 'Load more transfers'}
    </Button>
  );
  return (
    <div className="content-inner space-y-6">
      {settlementView && (
        <h2 className="font-heading text-xl">Balances & transfers</h2>
      )}
      {loadError && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {loadError}{' '}
          {summary &&
            (settlementView
              ? 'Shown balances may be out of date.'
              : 'Shown transfers may be out of date.')}{' '}
          <Button variant="link" onClick={() => void load()}>
            Retry
          </Button>
        </p>
      )}
      {loading && !summary ? (
        <WorkspaceLoading kind="money" />
      ) : (
        summary && (
          <>
            {!settlementView && (
              <h2 className="font-heading text-xl">Member balances</h2>
            )}
            {settlementView && summary.pendingBillCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {summary.members.every(
                  (member) => member.expectedNetMinor !== undefined,
                )
                  ? 'Balances include unpaid bills using the planned payer.'
                  : 'Showing confirmed balances only.'}
              </p>
            )}
            <section
              aria-label="Member balances"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              {summary.members.map((member) => {
                const displayed = balancePresentation(
                  member,
                  summary.pendingBillCount,
                );
                return (
                  <div key={member.memberId} className="rounded-xl border p-4">
                    <span className="flex items-center justify-between gap-2">
                      <strong>
                        {member.displayName}
                        {member.memberId === summary.viewerMemberId
                          ? ' (you)'
                          : ''}
                      </strong>
                      {member.status !== 'active' && (
                        <small className="capitalize text-muted-foreground">
                          {member.status}
                        </small>
                      )}
                    </span>
                    <span
                      className={`mt-2 block text-lg font-semibold ${displayed.amountMinor < 0 ? 'text-destructive' : 'text-primary'}`}
                    >
                      {balanceText(
                        displayed.amountMinor,
                        summary.currency,
                        member.memberId === summary.viewerMemberId,
                      )}
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {displayed.note ?? 'Confirmed balance'}
                    </span>
                  </div>
                );
              })}
            </section>
            {!settlementView && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>Recent activity</CardTitle>
                    {transferToggle}
                  </div>
                </CardHeader>
                <CardContent
                  className="space-y-2"
                  id={transfersId}
                  data-motion-expanded={transfersExpanded}
                >
                  {visibleSettlements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No transfers recorded yet.
                    </p>
                  ) : (
                    visibleSettlements.map((settlement) => (
                      <Link
                        key={settlement.id}
                        href={moneyHref(
                          household.id,
                          'balances',
                          settlement.id,
                        )}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 hover:bg-muted/40"
                      >
                        <span className="min-w-0 break-words">
                          <strong>
                            {settlement.senderDisplayName} →{' '}
                            {settlement.recipientDisplayName}
                          </strong>
                          <span className="block text-xs text-muted-foreground">
                            Transfer · {readableDate(settlement.settledOn)}
                          </span>
                        </span>
                        <strong>
                          {amountText(
                            settlement.amountMinor,
                            settlement.currency,
                          )}
                        </strong>
                      </Link>
                    ))
                  )}
                  {loadMoreTransfers}
                </CardContent>
              </Card>
            )}
            {settlementView &&
              summary.members.every(
                (member) =>
                  balancePresentation(member, summary.pendingBillCount)
                    .amountMinor === 0,
              ) && (
                <p className="text-sm text-muted-foreground">
                  No outstanding balances. Add an expense, pay a bill, or review
                  a recorded transfer to see activity here.
                </p>
              )}
            {initialRecordId && (
              <Card id="linked-transfer" tabIndex={-1} className="scroll-mt-6">
                <CardHeader>
                  <CardTitle>Transfer detail</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {linkedError ? (
                    <>
                      <p role="alert" className="text-destructive">
                        {linkedError}
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setLinkedRetry((value) => value + 1)}
                      >
                        Retry transfer
                      </Button>
                    </>
                  ) : linkedTransfer ? (
                    <>
                      <p className="font-semibold">
                        {linkedTransfer.senderDisplayName} →{' '}
                        {linkedTransfer.recipientDisplayName}
                      </p>
                      <p>
                        {amountText(
                          linkedTransfer.amountMinor,
                          linkedTransfer.currency,
                        )}{' '}
                        · Transferred {readableDate(linkedTransfer.settledOn)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Recorded by {linkedTransfer.recordedByDisplayName} ·{' '}
                        {new Intl.DateTimeFormat('en', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: household.timezone,
                        }).format(new Date(linkedTransfer.createdAt))}
                      </p>
                      {linkedTransfer.method && (
                        <p>Method reported: {linkedTransfer.method}</p>
                      )}
                      {linkedTransfer.note && (
                        <p>Note: {linkedTransfer.note}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Reported by a member; HouseMate did not process or
                        verify this payment.
                      </p>
                    </>
                  ) : (
                    <p role="status">Loading transfer…</p>
                  )}
                </CardContent>
              </Card>
            )}
            {settlementView && (
              <Card
                id={transferHistoryId}
                tabIndex={-1}
                className="scroll-mt-6"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>Recorded transfers</CardTitle>
                    {transferToggle}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    These entries were reported by members; HouseMate did not
                    process or verify them.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div
                    id={transfersId}
                    data-motion-expanded={transfersExpanded}
                    className="space-y-3"
                  >
                    {settlements.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No transfers recorded yet.
                      </p>
                    ) : (
                      visibleSettlements.map((settlement) => (
                        <div
                          key={settlement.id}
                          className="flex flex-wrap items-start justify-between gap-3 border-t pt-3 text-sm"
                        >
                          <div>
                            <strong>
                              {settlement.senderDisplayName} →{' '}
                              {settlement.recipientDisplayName}
                            </strong>
                            <p className="text-muted-foreground">
                              Transferred {readableDate(settlement.settledOn)} ·
                              Recorded by {settlement.recordedByDisplayName}{' '}
                              {new Intl.DateTimeFormat('en', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }).format(new Date(settlement.createdAt))}
                            </p>
                            {settlement.method && (
                              <p>Method reported: {settlement.method}</p>
                            )}
                            {settlement.note && <p>Note: {settlement.note}</p>}
                          </div>
                          <strong>
                            {amountText(
                              settlement.amountMinor,
                              settlement.currency,
                            )}
                          </strong>
                        </div>
                      ))
                    )}
                    {loadMoreTransfers}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )
      )}
      {!loading && !summary && !loadError && (
        <p className="text-sm text-muted-foreground">
          {settlementView
            ? 'Balances are unavailable right now.'
            : 'Transfers are unavailable right now.'}
        </p>
      )}
      {settlementView && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ListFilter size={13} /> Transfer previews use confirmed balances.
        </p>
      )}
    </div>
  );
}

export function RecordTransferWorkspace({
  household,
  token,
  summary,
  loading,
  onMoneyChanged,
}: {
  household: Household;
  token: string;
  summary: BalanceSummary | null;
  loading: boolean;
  onMoneyChanged: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [direction, setDirection] = useState<'sent' | 'received'>('sent');
  const [counterpartId, setCounterpartId] = useState('');
  const [amount, setAmount] = useState('');
  const [settledOn, setSettledOn] = useState(localDate);
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [previewDraft, setPreviewDraft] = useState<SettlementDraft | null>(
    null,
  );
  const [retryKey, setRetryKey] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null);
  const [notice, setNotice] = useState('');
  useLeaveGuard(dirty || busy !== null);
  const activeOthers =
    summary?.members.filter(
      (member) =>
        member.status === 'active' &&
        member.memberId !== summary.viewerMemberId,
    ) ?? [];

  function invalidate() {
    setDirty(true);
    setNotice('');
    setPreview(null);
    setPreviewDraft(null);
    setRetryKey('');
    setFormError('');
  }

  function resetDraft() {
    setDirection('sent');
    setCounterpartId('');
    setAmount('');
    setSettledOn(localDate());
    setMethod('');
    setNote('');
    setPreview(null);
    setPreviewDraft(null);
    setRetryKey('');
    setFormError('');
    setDirty(false);
  }

  function buildDraft(): SettlementDraft {
    if (!summary) throw new Error('Load balances before recording a transfer.');
    if (!activeOthers.some((member) => member.memberId === counterpartId))
      throw new Error('Choose another active household member.');
    const amountMinor = parseMinor(amount);
    if (amountMinor === null || amountMinor < 1)
      throw new Error(
        'Enter a positive transfer amount with at most two decimals.',
      );
    if (!settledOn) throw new Error('Choose the date the transfer happened.');
    return {
      senderMemberId:
        direction === 'sent' ? summary.viewerMemberId : counterpartId,
      recipientMemberId:
        direction === 'sent' ? counterpartId : summary.viewerMemberId,
      amountMinor,
      currency: household.defaultCurrency,
      settledOn,
      ...(method.trim() ? { method: method.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
  }

  async function showPreview() {
    setFormError('');
    let draft: SettlementDraft;
    try {
      draft = buildDraft();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Check the transfer details.',
      );
      return;
    }
    setBusy('preview');
    try {
      const result = await previewSettlement(token, household.id, draft);
      setPreview(result);
      setPreviewDraft(draft);
      setRetryKey(crypto.randomUUID());
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Could not preview the transfer.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!preview || !previewDraft || !retryKey) return;
    setBusy('save');
    setFormError('');
    try {
      const recorded = await createSettlement(
        token,
        household.id,
        previewDraft,
        retryKey,
      );
      resetDraft();
      setNotice(
        `${recorded.senderDisplayName} → ${recorded.recipientDisplayName}: ${amountText(recorded.amountMinor, recorded.currency)} recorded.`,
      );
      onMoneyChanged();
    } catch (error) {
      setFormError(confirmationFailure(error, 'manual transfer'));
    } finally {
      setBusy(null);
    }
  }

  if (!summary) return loading ? <WorkspaceLoading kind="money" /> : null;

  return (
    <div className="content-inner space-y-6">
      {notice && (
        <SuccessNotice
          key={notice}
          className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary"
        >
          {notice}
        </SuccessNotice>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Record transfer</CardTitle>
          <p className="text-sm text-muted-foreground">
            Record a transfer you sent or received outside HouseMate.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <fieldset
            className="grid min-w-0 gap-4 md:grid-cols-2"
            disabled={busy !== null || activeOthers.length === 0}
          >
            <legend className="sr-only">Transfer details</legend>
            <label
              htmlFor="settlement-direction"
              className="space-y-1 text-sm font-medium"
            >
              What happened?
              <select
                id="settlement-direction"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3"
                value={direction}
                onChange={(event) => {
                  invalidate();
                  setDirection(event.target.value as 'sent' | 'received');
                }}
              >
                <option value="sent">I sent money</option>
                <option value="received">I received money</option>
              </select>
            </label>
            <label
              htmlFor="settlement-member"
              className="space-y-1 text-sm font-medium"
            >
              {direction === 'sent' ? 'Sent to' : 'Received from'}
              <select
                id="settlement-member"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3"
                value={counterpartId}
                onChange={(event) => {
                  invalidate();
                  setCounterpartId(event.target.value);
                }}
              >
                <option value="">Choose a member</option>
                {activeOthers.map((member) => (
                  <option key={member.memberId} value={member.memberId}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label
              htmlFor="settlement-amount"
              className="space-y-1 text-sm font-medium"
            >
              Amount ({household.defaultCurrency})
              <Input
                id="settlement-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  invalidate();
                  setAmount(event.target.value);
                }}
                placeholder="75.00"
              />
            </label>
            <label
              htmlFor="settlement-date"
              className="space-y-1 text-sm font-medium"
            >
              Date transferred
              <Input
                id="settlement-date"
                type="date"
                value={settledOn}
                onChange={(event) => {
                  invalidate();
                  setSettledOn(event.target.value);
                }}
              />
            </label>
            <label
              htmlFor="settlement-method"
              className="space-y-1 text-sm font-medium"
            >
              Method (optional)
              <Input
                id="settlement-method"
                maxLength={80}
                value={method}
                onChange={(event) => {
                  invalidate();
                  setMethod(event.target.value);
                }}
                placeholder="Cash, bank transfer…"
              />
            </label>
            <label
              htmlFor="settlement-note"
              className="space-y-1 text-sm font-medium"
            >
              Note (optional)
              <textarea
                id="settlement-note"
                maxLength={500}
                value={note}
                onChange={(event) => {
                  invalidate();
                  setNote(event.target.value);
                }}
                className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2"
                placeholder="What was this transfer for?"
              />
            </label>
          </fieldset>
          {activeOthers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Another active household member is needed to record a transfer.
            </p>
          )}
          {formError && (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy !== null || activeOthers.length === 0}
              onClick={() => void showPreview()}
            >
              {busy === 'preview' ? 'Calculating…' : 'Preview balance effect'}
            </Button>
            {dirty && (
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={resetDraft}
              >
                Discard draft
              </Button>
            )}
          </div>
          {preview && (
            <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
              <h3 className="font-heading text-lg">Review recorded transfer</h3>
              <p className="text-sm">
                <strong>{preview.senderDisplayName}</strong> →{' '}
                <strong>{preview.recipientDisplayName}</strong> ·{' '}
                {amountText(preview.amountMinor, preview.currency)} on{' '}
                {readableDate(preview.settledOn)}
              </p>
              <p className="text-xs text-muted-foreground">
                Suggested amount for these two members:{' '}
                {amountText(preview.recommendedAmountMinor, preview.currency)}.
                Your custom amount is allowed.
              </p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt>{preview.senderDisplayName} before</dt>
                  <dd>
                    {balanceText(preview.senderBeforeMinor, preview.currency)}
                  </dd>
                  <dt>After</dt>
                  <dd className="font-semibold">
                    {balanceText(preview.senderAfterMinor, preview.currency)}
                  </dd>
                </div>
                <div>
                  <dt>{preview.recipientDisplayName} before</dt>
                  <dd>
                    {balanceText(preview.receiverBeforeMinor, preview.currency)}
                  </dd>
                  <dt>After</dt>
                  <dd className="font-semibold">
                    {balanceText(preview.receiverAfterMinor, preview.currency)}
                  </dd>
                </div>
              </dl>
              {preview.warnings.map((warning) => (
                <p
                  key={warning}
                  role="alert"
                  className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900"
                >
                  {warning}
                </p>
              ))}
              <p className="text-sm font-medium">
                Confirm only after the transfer has taken place.
              </p>
              <Button disabled={busy !== null} onClick={() => void confirm()}>
                {busy === 'save' ? 'Recording…' : 'Confirm recorded transfer'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
