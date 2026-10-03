'use client';

import { ArrowRight, HandCoins, ListFilter } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { MoneyRecordPanel } from '@/components/money-record-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  type BalanceEntry,
  type BalanceSummary,
  createSettlement,
  formatCurrency,
  getBalanceEntries,
  getBalances,
  getSettlement,
  getSettlements,
  type Household,
  previewSettlement,
  type Settlement,
  type SettlementDraft,
  type SettlementPreview,
  type SettlementSuggestion,
} from '@/lib/api';
import { confirmationFailure } from '@/lib/financial-confirmation';
import { hasPendingWork, useLeaveGuard } from '@/lib/pending-work';

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
function balanceText(netMinor: number, currency: Household['defaultCurrency']) {
  if (netMinor < 0) return `Owes ${amountText(-netMinor, currency)}`;
  if (netMinor > 0) return `Owed ${amountText(netMinor, currency)}`;
  return 'Settled up';
}
function entryExplanation(
  entry: BalanceEntry,
  currency: Household['defaultCurrency'],
) {
  const parts: string[] = [];
  if (entry.paidMinor)
    parts.push(`Paid ${amountText(entry.paidMinor, currency)}`);
  if (entry.shareMinor)
    parts.push(`Own share ${amountText(entry.shareMinor, currency)}`);
  if (entry.sentMinor)
    parts.push(`Sent ${amountText(entry.sentMinor, currency)}`);
  if (entry.receivedMinor)
    parts.push(`Received ${amountText(entry.receivedMinor, currency)}`);
  return parts.join(' · ');
}

export function BalanceWorkspace({
  household,
  token,
  initialRecordId,
  onMoneyChanged,
}: {
  household: Household;
  token: string;
  initialRecordId?: string;
  onMoneyChanged: () => void;
}) {
  const [linkedTransfer, setLinkedTransfer] = useState<Settlement | null>(null);
  const [linkedError, setLinkedError] = useState('');
  const [linkedRetry, setLinkedRetry] = useState(0);
  const [summary, setSummary] = useState<BalanceSummary | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [hasMoreSettlements, setHasMoreSettlements] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [entries, setEntries] = useState<BalanceEntry[]>([]);
  const [hasMoreEntries, setHasMoreEntries] = useState(false);
  const [balanceView, setBalanceView] = useState<
    'entries' | 'suggestions' | 'transfers' | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [moreBusy, setMoreBusy] = useState<'entries' | 'settlements' | null>(
    null,
  );
  const [loadError, setLoadError] = useState('');
  const [entryError, setEntryError] = useState('');
  const [entryRetry, setEntryRetry] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  useLeaveGuard(formOpen);
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
    if (initialRecordId && !loading && (linkedTransfer || linkedError)) {
      document
        .getElementById('linked-transfer')
        ?.scrollIntoView({ block: 'start' });
      document
        .getElementById('linked-transfer')
        ?.focus({ preventScroll: true });
    }
  }, [initialRecordId, loading, linkedTransfer, linkedError]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [nextSummary, nextSettlements] = await Promise.all([
        getBalances(token, household.id),
        getSettlements(token, household.id),
      ]);
      setSummary(nextSummary);
      setSettlements(nextSettlements);
      setHasMoreSettlements(nextSettlements.length === 50);
      setSelectedMemberId((old) =>
        nextSummary.members.some((member) => member.memberId === old)
          ? old
          : nextSummary.viewerMemberId,
      );
      setCounterpartId(
        (old) =>
          old ||
          nextSummary.members.find(
            (member) =>
              member.status === 'active' &&
              member.memberId !== nextSummary.viewerMemberId,
          )?.memberId ||
          '',
      );
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Could not load balances.',
      );
    } finally {
      setLoading(false);
    }
  }, [household.id, token]);

  useEffect(() => {
    void load();
  }, [load]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry reloads the selected member's sources.
  useEffect(() => {
    if (!selectedMemberId) return;
    let current = true;
    setEntries([]);
    setHasMoreEntries(false);
    setEntriesLoading(true);
    setEntryError('');
    void getBalanceEntries(token, household.id, selectedMemberId)
      .then((result) => {
        if (current) {
          setEntries(result);
          setHasMoreEntries(result.length === 50);
        }
      })
      .catch((error) => {
        if (current)
          setEntryError(
            error instanceof Error
              ? error.message
              : 'Could not load balance sources.',
          );
      })
      .finally(() => {
        if (current) setEntriesLoading(false);
      });
    return () => {
      current = false;
    };
  }, [household.id, selectedMemberId, token, entryRetry]);

  function invalidate() {
    setPreview(null);
    setPreviewDraft(null);
    setRetryKey('');
    setFormError('');
  }

  function prefillSuggestion(suggestion: SettlementSuggestion) {
    if (!summary || hasPendingWork()) return;
    setBalanceView(null);
    if (summary.viewerMemberId === suggestion.senderMemberId) {
      setDirection('sent');
      setCounterpartId(suggestion.recipientMemberId);
    } else if (summary.viewerMemberId === suggestion.recipientMemberId) {
      setDirection('received');
      setCounterpartId(suggestion.senderMemberId);
    } else return;
    setAmount((suggestion.amountMinor / 100).toFixed(2));
    setFormOpen(true);
    setNotice('');
    invalidate();
  }

  function buildDraft(): SettlementDraft {
    if (!summary) throw new Error('Load balances before recording a transfer.');
    if (!counterpartId || counterpartId === summary.viewerMemberId)
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
      setSettlements((old) => [
        recorded,
        ...old.filter((item) => item.id !== recorded.id),
      ]);
      onMoneyChanged();
      setNotice(
        `${recorded.senderDisplayName} → ${recorded.recipientDisplayName}: ${amountText(recorded.amountMinor, recorded.currency)} recorded as transferred outside HouseMate. No payment was processed or verified.`,
      );
      setFormOpen(false);
      setAmount('');
      setMethod('');
      setNote('');
      setPreview(null);
      setPreviewDraft(null);
      setRetryKey('');
      const refreshed = await Promise.allSettled([
        getBalances(token, household.id),
        getBalanceEntries(
          token,
          household.id,
          selectedMemberId || recorded.senderMemberId,
        ),
      ]);
      if (refreshed[0].status === 'fulfilled') setSummary(refreshed[0].value);
      else
        setLoadError(
          'Transfer recorded, but balances could not refresh. Use Retry.',
        );
      if (refreshed[1].status === 'fulfilled') {
        setEntries(refreshed[1].value);
        setHasMoreEntries(refreshed[1].value.length === 50);
      } else
        setEntryError(
          'Transfer recorded, but balance sources could not refresh.',
        );
    } catch (error) {
      setFormError(confirmationFailure(error, 'manual transfer'));
    } finally {
      setBusy(null);
    }
  }

  async function loadMoreEntries() {
    if (!selectedMemberId) return;
    setMoreBusy('entries');
    setEntryError('');
    try {
      const next = await getBalanceEntries(
        token,
        household.id,
        selectedMemberId,
        50,
        entries.length,
      );
      setEntries((old) => [
        ...old,
        ...next.filter(
          (item) =>
            !old.some(
              (entry) =>
                entry.sourceType === item.sourceType &&
                entry.sourceId === item.sourceId,
            ),
        ),
      ]);
      setHasMoreEntries(next.length === 50);
    } catch (error) {
      setEntryError(
        error instanceof Error ? error.message : 'Could not load more sources.',
      );
    } finally {
      setMoreBusy(null);
    }
  }

  async function loadMoreSettlements() {
    setMoreBusy('settlements');
    setLoadError('');
    try {
      const next = await getSettlements(
        token,
        household.id,
        50,
        settlements.length,
      );
      setSettlements((old) => [
        ...old,
        ...next.filter(
          (item) => !old.some((settlement) => settlement.id === item.id),
        ),
      ]);
      setHasMoreSettlements(next.length === 50);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load more transfers.',
      );
    } finally {
      setMoreBusy(null);
    }
  }

  const activeOthers =
    summary?.members.filter(
      (member) =>
        member.status === 'active' &&
        member.memberId !== summary.viewerMemberId,
    ) ?? [];
  const selected = summary?.members.find(
    (member) => member.memberId === selectedMemberId,
  );
  // Match the API's transfer-date order, including a newly recorded backdated transfer.
  const orderedSettlements = [...settlements].sort(
    (a, b) =>
      b.settledOn.localeCompare(a.settledOn) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.id.localeCompare(a.id),
  );

  const renderEntries = (records: BalanceEntry[]) =>
    records.map((entry) => (
      <div
        key={`${entry.sourceType}-${entry.sourceId}`}
        className="flex items-start justify-between gap-3 border-t pt-3 text-sm"
      >
        <div>
          <strong>{entry.title}</strong>
          <p className="capitalize text-muted-foreground">
            {entry.sourceType} · {readableDate(entry.occurredOn)}
          </p>
          <p className="text-muted-foreground">
            {entryExplanation(entry, household.defaultCurrency)}
          </p>
        </div>
        <strong
          className={
            entry.effectMinor < 0 ? 'text-destructive' : 'text-primary'
          }
        >
          {entry.effectMinor < 0 ? '−' : '+'}
          {amountText(Math.abs(entry.effectMinor), household.defaultCurrency)}
        </strong>
      </div>
    ));
  const renderSuggestions = (records: SettlementSuggestion[]) =>
    summary
      ? records.map((suggestion) => (
          <div
            key={`${suggestion.senderMemberId}-${suggestion.recipientMemberId}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
          >
            <div>
              <span className="font-medium">
                {suggestion.senderDisplayName}
              </span>{' '}
              <ArrowRight size={14} className="inline" />{' '}
              <span className="font-medium">
                {suggestion.recipientDisplayName}
              </span>
              <strong className="block text-primary">
                {amountText(suggestion.amountMinor, summary.currency)}
              </strong>
            </div>
            {(summary.viewerMemberId === suggestion.senderMemberId ||
              summary.viewerMemberId === suggestion.recipientMemberId) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => prefillSuggestion(suggestion)}
              >
                Record transfer
              </Button>
            )}
          </div>
        ))
      : null;
  const renderTransfers = (records: Settlement[], compact = false) =>
    records.map((settlement) => (
      <div
        key={settlement.id}
        className="flex flex-wrap items-start justify-between gap-3 border-t pt-3 text-sm"
      >
        <div>
          <strong>
            {settlement.senderDisplayName} → {settlement.recipientDisplayName}
          </strong>
          <p className="text-muted-foreground">
            {readableDate(settlement.settledOn)}
            {!compact && (
              <>
                {' '}
                · Recorded by {settlement.recordedByDisplayName}{' '}
                {new Intl.DateTimeFormat('en', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: household.timezone,
                }).format(new Date(settlement.createdAt))}
              </>
            )}
          </p>
          {!compact && settlement.method && (
            <p>Method reported: {settlement.method}</p>
          )}
          {!compact && settlement.note && <p>Note: {settlement.note}</p>}
        </div>
        <strong>
          {amountText(settlement.amountMinor, settlement.currency)}
        </strong>
      </div>
    ));
  return (
    <div className="content-inner space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl">Balances & transfers</h2>
          <p className="text-sm text-muted-foreground">
            Confirmed expenses, Paid bills, and transfers recorded outside
            HouseMate. Positive means owed to a member; negative means they owe.
          </p>
        </div>
        <Button
          disabled={!summary || activeOthers.length === 0}
          onClick={() => {
            setFormOpen((old) => !old);
            setNotice('');
          }}
        >
          <HandCoins size={16} /> {formOpen ? 'Close form' : 'Record transfer'}
        </Button>
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary"
        >
          {notice}
        </p>
      )}
      {loadError && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {loadError}{' '}
          <Button variant="link" onClick={() => void load()}>
            Retry
          </Button>
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading balances…</p>
      ) : (
        summary && (
          <>
            <section
              aria-label="Member balances"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              {summary.members.map((member) => (
                <button
                  type="button"
                  key={member.memberId}
                  onClick={() => setSelectedMemberId(member.memberId)}
                  className={`rounded-xl border p-4 text-left transition-colors hover:bg-muted/30 ${selectedMemberId === member.memberId ? 'border-primary bg-primary/5' : ''}`}
                >
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
                    className={`mt-2 block text-lg font-semibold ${member.netMinor < 0 ? 'text-destructive' : 'text-primary'}`}
                  >
                    {balanceText(member.netMinor, summary.currency)}
                  </span>
                </button>
              ))}
            </section>
            {summary.members.every((member) => member.netMinor === 0) && (
              <p className="text-sm text-muted-foreground">
                No outstanding balances. Add an expense, pay a bill, or review a
                recorded transfer to see activity here.
              </p>
            )}
            <div className="grid items-start gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Why this balance?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="font-medium">
                    {selected
                      ? `${selected.displayName}: ${balanceText(selected.netMinor, summary.currency)}`
                      : 'Select a member above.'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Confirmed expenses, paid bills and recorded transfers
                    contribute to this balance.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!selected || formOpen}
                    onClick={() => setBalanceView('entries')}
                  >
                    View breakdown
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <CardTitle>Suggested transfers</CardTitle>
                  {summary.suggestions.length > 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBalanceView('suggestions')}
                      disabled={formOpen}
                    >
                      View all suggestions
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {summary.suggestions.length ? (
                    renderSuggestions(summary.suggestions.slice(0, 2))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No transfer suggested right now.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Record a transfer only after paying outside HouseMate.
                  </p>
                </CardContent>
              </Card>
            </div>
            <MoneyRecordPanel
              open={balanceView === 'entries'}
              title="Balance breakdown"
              onClose={() => setBalanceView(null)}
            >
              <div className="space-y-4">
                <p className="font-medium">
                  {selected?.displayName} ·{' '}
                  {selected && balanceText(selected.netMinor, summary.currency)}
                </p>
                {entryError && (
                  <div className="space-y-2">
                    <p role="alert" className="text-destructive">
                      {entryError}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={entriesLoading}
                      onClick={() => setEntryRetry((value) => value + 1)}
                    >
                      Retry breakdown
                    </Button>
                  </div>
                )}
                {entriesLoading ? (
                  <p role="status">Loading sources…</p>
                ) : entries.length ? (
                  renderEntries(entries)
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No confirmed expenses, paid bills or transfers for this
                    member.
                  </p>
                )}
                {hasMoreEntries && (
                  <Button
                    variant="outline"
                    disabled={moreBusy !== null}
                    onClick={() => void loadMoreEntries()}
                  >
                    {moreBusy === 'entries' ? 'Loading…' : 'Load more sources'}
                  </Button>
                )}
              </div>
            </MoneyRecordPanel>
            <MoneyRecordPanel
              open={balanceView === 'suggestions'}
              title="All suggested transfers"
              onClose={() => setBalanceView(null)}
            >
              <div className="space-y-3">
                {renderSuggestions(summary.suggestions)}
                <p className="text-xs text-muted-foreground">
                  Record a transfer only after paying outside HouseMate.
                </p>
              </div>
            </MoneyRecordPanel>
            {formOpen && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    Record money transferred outside HouseMate
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Only record a transfer that actually happened. This entry
                    changes balances but does not send money or verify a bank
                    payment.
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
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
                          setDirection(
                            event.target.value as 'sent' | 'received',
                          );
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
                  </div>
                  {formError && (
                    <p
                      role="alert"
                      className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
                    >
                      {formError}
                    </p>
                  )}
                  <Button
                    disabled={busy !== null}
                    onClick={() => void showPreview()}
                  >
                    {busy === 'preview'
                      ? 'Calculating…'
                      : 'Preview balance effect'}
                  </Button>
                  {preview && (
                    <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
                      <h3 className="font-heading text-lg">
                        Review recorded transfer
                      </h3>
                      <p className="text-sm">
                        <strong>{preview.senderDisplayName}</strong> →{' '}
                        <strong>{preview.recipientDisplayName}</strong> ·{' '}
                        {amountText(preview.amountMinor, preview.currency)} on{' '}
                        {readableDate(preview.settledOn)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Suggested amount for these two members:{' '}
                        {amountText(
                          preview.recommendedAmountMinor,
                          preview.currency,
                        )}
                        . Your custom amount is allowed.
                      </p>
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt>{preview.senderDisplayName} before</dt>
                          <dd>
                            {balanceText(
                              preview.senderBeforeMinor,
                              preview.currency,
                            )}
                          </dd>
                          <dt>After</dt>
                          <dd className="font-semibold">
                            {balanceText(
                              preview.senderAfterMinor,
                              preview.currency,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>{preview.recipientDisplayName} before</dt>
                          <dd>
                            {balanceText(
                              preview.receiverBeforeMinor,
                              preview.currency,
                            )}
                          </dd>
                          <dt>After</dt>
                          <dd className="font-semibold">
                            {balanceText(
                              preview.receiverAfterMinor,
                              preview.currency,
                            )}
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
                        Confirm only if money already moved outside HouseMate.
                        No payment will be processed or verified here.
                      </p>
                      <Button
                        disabled={busy !== null}
                        onClick={() => void confirm()}
                      >
                        {busy === 'save'
                          ? 'Recording…'
                          : 'Confirm recorded transfer'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
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
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>Recorded transfers</CardTitle>
                {settlements.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBalanceView('transfers')}
                    disabled={formOpen}
                  >
                    View all transfers
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {settlements.length ? (
                  renderTransfers(orderedSettlements.slice(0, 3), true)
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No transfers recorded yet.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Reported by members; no payment processed or verified.
                </p>
              </CardContent>
            </Card>
            <MoneyRecordPanel
              open={balanceView === 'transfers'}
              title="All recorded transfers"
              onClose={() => setBalanceView(null)}
            >
              <div className="space-y-3">
                {renderTransfers(orderedSettlements)}
                {loadError && (
                  <p role="alert" className="text-destructive">
                    {loadError}
                  </p>
                )}
                {hasMoreSettlements && (
                  <Button
                    variant="outline"
                    disabled={moreBusy !== null}
                    onClick={() => void loadMoreSettlements()}
                  >
                    {moreBusy === 'settlements'
                      ? 'Loading…'
                      : 'Load more transfers'}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Reported by members; no payment processed or verified.
                </p>
              </div>
            </MoneyRecordPanel>
          </>
        )
      )}
      {!loading && !summary && !loadError && (
        <p className="text-sm text-muted-foreground">
          Balances are unavailable right now.
        </p>
      )}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ListFilter size={13} /> Balances use confirmed expenses and Paid bills.
        Unpaid bills are shown separately.
      </p>
    </div>
  );
}
