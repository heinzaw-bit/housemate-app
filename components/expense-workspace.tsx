'use client';

import { ArrowRight, Plus, ReceiptText } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FinancialHistory } from '@/components/financial-history';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { VoidConfirmation } from '@/components/void-confirmation';
import {
  ApiRequestError,
  createExpense,
  type Expense,
  type ExpenseDraft,
  type ExpensePreview,
  editExpense,
  formatCurrency,
  getEvent,
  getExpense,
  getExpenses,
  getMembers,
  type Household,
  type HouseholdMember,
  previewExpense,
  previewExpenseEdit,
  previewExpenseVoid,
  type SplitMethod,
  voidExpense,
} from '@/lib/api';
import { formatRecordDate as readableDate } from '@/lib/date-format';
import { suggestedEventParticipants } from '@/lib/event-expense';
import { confirmationFailure } from '@/lib/financial-confirmation';
import { useLeaveGuard } from '@/lib/pending-work';
import { appendRecords } from '@/lib/record-pages';
import { SavedDraftNotice, useSavedDraft } from './saved-draft';

const methods: { id: SplitMethod; label: string; hint: string }[] = [
  {
    id: 'equal',
    label: 'Equal',
    hint: 'Everyone selected pays an equal share.',
  },
  { id: 'exact', label: 'Exact amounts', hint: 'Enter each person’s share.' },
  {
    id: 'percentage',
    label: 'Percentage',
    hint: 'Percentages must total 100%.',
  },
  {
    id: 'ratio',
    label: 'Ratio',
    hint: 'Use whole-number weights, such as 2:1.',
  },
];

function parseMinor(value: string): number | null {
  const clean = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ''] = clean.split('.');
  const minor = Number(
    BigInt(whole ?? '0') * BigInt(100) + BigInt(fraction.padEnd(2, '0')),
  );
  return Number.isSafeInteger(minor) && minor <= 999_999_999_999 ? minor : null;
}

function parsePercent(value: string): number | null {
  const minor = parseMinor(value);
  return minor !== null && minor <= 10000 ? minor : null;
}

function money(minor: number, currency: Household['defaultCurrency']) {
  return `${formatCurrency(minor, currency)} ${currency}`;
}

function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export function ExpenseWorkspace({
  household,
  token,
  initialRecordId,
  initialCreate = false,
  initialEventId,
  onMoneyChanged,
}: {
  household: Household;
  token: string;
  initialRecordId?: string;
  initialCreate?: boolean;
  initialEventId?: string;
  onMoneyChanged: () => void;
}) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const historyPanelId = useId();
  const detailsPanelId = useId();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [formOpen, setFormOpen] = useState(initialCreate);
  useLeaveGuard(formOpen);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState(todayLocal);
  const [payer, setPayer] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [method, setMethod] = useState<SplitMethod>('equal');
  const [values, setValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ExpensePreview | null>(null);
  const [previewDraft, setPreviewDraft] = useState<ExpenseDraft | null>(null);
  const [retryKey, setRetryKey] = useState('');
  const [editPreviewId, setEditPreviewId] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null);
  const [notice, setNotice] = useState('');
  const [eventSuggestion, setEventSuggestion] = useState('');
  const pageOffset = useRef(0);
  const moreInFlight = useRef(false);
  const previewGeneration = useRef(0);

  const savedDraft = useSavedDraft({
    kind: 'expense',
    enabled: formOpen && !editing,
    value: { title, amount, spentOn, payer, participants, method, values },
    restore(snapshot) {
      setTitle(snapshot.title);
      setAmount(snapshot.amount);
      setSpentOn(snapshot.spentOn);
      setPayer(snapshot.payer);
      setParticipants(snapshot.participants);
      setMethod(snapshot.method);
      setValues(snapshot.values);
      setFormOpen(true);
      invalidate();
      setEditing(null);
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [nextMembers, nextExpenses] = await Promise.all([
        getMembers(token, household.id),
        getExpenses(token, household.id),
      ]);
      setMembers(nextMembers);
      setExpenses(nextExpenses);
      pageOffset.current = nextExpenses.length;
      setHasMore(nextExpenses.length === 50);
      setPayer((old) => old || nextMembers[0]?.id || '');
      if (initialEventId && initialCreate) {
        try {
          const event = await getEvent(token, household.id, initialEventId);
          const going = suggestedEventParticipants(event, nextMembers);
          setTitle(event.title);
          setParticipants(going);
          setEventSuggestion(
            going.length
              ? `${going.length} Going ${going.length === 1 ? 'member is' : 'members are'} suggested from “${event.title}”. Review everyone before confirming.`
              : `No active members have answered Going for “${event.title}” yet. Choose the people sharing this cost.`,
          );
        } catch (failure) {
          setParticipants(nextMembers.map((member) => member.id));
          setEventSuggestion(
            `Event suggestions are unavailable: ${failure instanceof Error ? failure.message : 'Could not load the event.'} Choose participants manually.`,
          );
        }
      } else {
        setParticipants((old) =>
          old.length ? old : nextMembers.map((member) => member.id),
        );
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Could not load expenses.',
      );
    } finally {
      setLoading(false);
    }
  }, [household.id, token, initialEventId, initialCreate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!initialRecordId) return;
    let active = true;
    setDetailsExpanded(true);
    setDetailError('');
    getExpense(token, household.id, initialRecordId)
      .then((record) => {
        if (active) setSelected(record);
      })
      .catch((error: unknown) => {
        if (active)
          setDetailError(
            error instanceof Error
              ? error.message
              : 'Could not open this expense.',
          );
      });
    return () => {
      active = false;
    };
  }, [initialRecordId, token, household.id]);

  useEffect(() => {
    if (initialRecordId && !loading && (selected || detailError)) {
      document
        .getElementById('expense-detail')
        ?.scrollIntoView({ block: 'start' });
      document.getElementById('expense-detail')?.focus({ preventScroll: true });
    }
  }, [initialRecordId, loading, selected, detailError]);

  function invalidate() {
    previewGeneration.current += 1;
    setPreview(null);
    setPreviewDraft(null);
    setRetryKey('');
    setEditPreviewId('');
    setFormError('');
  }

  function startEdit(expense: Expense) {
    setVoidOpen(false);
    setEditing(expense);
    setTitle(expense.title);
    setAmount((expense.amountMinor / 100).toFixed(2));
    setSpentOn(expense.spentOn);
    const activeIds = new Set(members.map((member) => member.id));
    setPayer(activeIds.has(expense.payerMemberId) ? expense.payerMemberId : '');
    setParticipants(
      expense.splitInput.shares
        .map((share) => share.memberId)
        .filter((id) => activeIds.has(id)),
    );
    setMethod(expense.splitInput.method);
    setValues(
      Object.fromEntries(
        expense.splitInput.shares.map((share) => [
          share.memberId,
          expense.splitInput.method === 'ratio'
            ? String(share.value ?? '')
            : share.value === undefined
              ? ''
              : (share.value / 100).toFixed(2),
        ]),
      ),
    );
    setFormOpen(true);
    setNotice('');
    invalidate();
  }

  function buildDraft(): ExpenseDraft {
    const amountMinor = parseMinor(amount);
    if (amountMinor === null || amountMinor < 1)
      throw new Error(
        'Enter an amount greater than zero with at most two decimals.',
      );
    if (!title.trim()) throw new Error('Enter an expense title.');
    if (!spentOn) throw new Error('Choose an expense date.');
    if (!payer) throw new Error('Choose who paid.');
    if (!participants.length)
      throw new Error('Choose at least one participant.');
    const shares = participants.map((memberId) => {
      if (method === 'equal') return { memberId };
      const raw = values[memberId] ?? '';
      const value =
        method === 'exact'
          ? parseMinor(raw)
          : method === 'percentage'
            ? parsePercent(raw)
            : /^\d+$/.test(raw.trim())
              ? Number(raw)
              : null;
      if (value === null || !Number.isSafeInteger(value))
        throw new Error(
          `Enter a valid ${method === 'exact' ? 'amount' : method === 'percentage' ? 'percentage' : 'whole-number ratio'} for ${members.find((member) => member.id === memberId)?.displayName ?? 'each participant'}.`,
        );
      return { memberId, value };
    });
    return {
      title: title.trim(),
      amountMinor,
      currency: household.defaultCurrency,
      spentOn,
      payerMemberId: payer,
      split: { method, shares },
    };
  }

  async function showPreview() {
    const generation = ++previewGeneration.current;
    setFormError('');
    setPreview(null);
    setPreviewDraft(null);
    setRetryKey('');
    setEditPreviewId('');
    let draft: ExpenseDraft;
    try {
      draft = buildDraft();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Check the expense details.',
      );
      return;
    }
    setBusy('preview');
    try {
      const result = editing
        ? await previewExpenseEdit(
            token,
            household.id,
            editing.id,
            draft,
            editing.revision,
          )
        : await previewExpense(token, household.id, draft);
      if (generation !== previewGeneration.current) return;
      setPreview(result);
      setPreviewDraft(draft);
      setEditPreviewId(
        'previewId' in result && typeof result.previewId === 'string'
          ? result.previewId
          : '',
      );
      setRetryKey(crypto.randomUUID());
    } catch (error) {
      if (generation === previewGeneration.current)
        setFormError(
          error instanceof Error
            ? error.message
            : 'Could not calculate shares.',
        );
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!preview || !previewDraft || !retryKey || (editing && !editPreviewId))
      return;
    setBusy('save');
    setFormError('');
    try {
      const created = editing
        ? await editExpense(
            token,
            household.id,
            editing.id,
            previewDraft,
            editing.revision,
            editPreviewId,
            retryKey,
          )
        : await createExpense(
            token,
            household.id,
            previewDraft,
            savedDraft.confirmationKey(previewDraft, retryKey),
          );
      setExpenses((old) =>
        [created, ...old.filter((item) => item.id !== created.id)].sort(
          (a, b) => b.spentOn.localeCompare(a.spentOn),
        ),
      );
      if (!editing) savedDraft.clear();
      setSelected(created);
      onMoneyChanged();
      setNotice(
        editing
          ? 'Expense updated. Balances now use the revised shares.'
          : 'Expense confirmed and shared with your household.',
      );
      setFormOpen(false);
      setEditing(null);
      setTitle('');
      setAmount('');
      setMethod('equal');
      setValues({});
      setPreview(null);
      setPreviewDraft(null);
      setRetryKey('');
      setEditPreviewId('');
    } catch (error) {
      savedDraft.reject(error);
      if (
        error instanceof ApiRequestError &&
        (error.code === 'PREVIEW_REQUIRED' || error.code === 'STALE_RECORD')
      )
        invalidate();
      setFormError(
        error instanceof Error
          ? error instanceof ApiRequestError && error.code === 'STALE_RECORD'
            ? `${error.message} Close this form and reopen Edit to review the latest version.`
            : confirmationFailure(error, 'expense')
          : confirmationFailure(error, 'expense'),
      );
    } finally {
      setBusy(null);
    }
  }

  async function selectExpense(id: string) {
    setDetailsExpanded(true);
    setVoidOpen(false);
    setDetailError('');
    try {
      setSelected(await getExpense(token, household.id, id));
    } catch (error) {
      setDetailError(
        error instanceof Error
          ? error.message
          : 'Could not load expense detail.',
      );
    }
  }

  async function more() {
    if (moreInFlight.current) return;
    moreInFlight.current = true;
    setLoadingMore(true);
    setLoadError('');
    try {
      const next = await getExpenses(
        token,
        household.id,
        50,
        pageOffset.current,
      );
      setExpenses((old) => appendRecords(old, next));
      pageOffset.current += next.length;
      setHasMore(next.length === 50);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load more expenses.',
      );
    } finally {
      moreInFlight.current = false;
      setLoadingMore(false);
    }
  }

  return (
    <div className="content-inner space-y-6">
      <SavedDraftNotice
        draft={savedDraft}
        disabled={busy === 'save'}
        resumeDisabled={loading || !!loadError || !!editing}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl">Expenses</h2>
          <p className="text-sm text-muted-foreground">
            Confirmed costs for {household.name}
          </p>
        </div>
        <Button
          variant={formOpen ? 'outline' : 'default'}
          disabled={busy === 'save'}
          onClick={() => {
            if (formOpen && !editing) savedDraft.clear();
            setFormOpen((old) => !old);
            setEditing(null);
            setTitle('');
            setAmount('');
            setSpentOn(todayLocal());
            setPayer(members[0]?.id ?? '');
            setParticipants(members.map((member) => member.id));
            setEventSuggestion('');
            setMethod('equal');
            setValues({});
            invalidate();
            setNotice('');
          }}
        >
          {!formOpen && <Plus size={16} />}
          {formOpen
            ? editing
              ? 'Cancel edit'
              : 'Discard draft'
            : 'Add expense'}
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
      {formOpen && (!loading || !initialEventId) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editing ? `Edit ${editing.title}` : 'Add a shared expense'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {editing
                ? 'A new API preview is required before saving changes to this confirmed expense.'
                : 'Preview the exact shares before confirming.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {eventSuggestion && !editing && (
              <p className="rounded-xl bg-primary/10 p-3 text-sm text-primary">
                {eventSuggestion}
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <label
                htmlFor="expense-title"
                className="space-y-1.5 text-sm font-medium"
              >
                What was it for?
                <Input
                  id="expense-title"
                  value={title}
                  maxLength={160}
                  disabled={!!busy}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    invalidate();
                  }}
                  placeholder="Groceries"
                />
              </label>
              <label
                htmlFor="expense-amount"
                className="space-y-1.5 text-sm font-medium"
              >
                Total ({household.defaultCurrency})
                <Input
                  id="expense-amount"
                  value={amount}
                  inputMode="decimal"
                  disabled={!!busy}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    invalidate();
                  }}
                  placeholder="0.00"
                />
              </label>
              <label
                htmlFor="expense-date"
                className="space-y-1.5 text-sm font-medium"
              >
                Expense date
                <Input
                  id="expense-date"
                  type="date"
                  value={spentOn}
                  disabled={!!busy}
                  onChange={(e) => {
                    setSpentOn(e.target.value);
                    invalidate();
                  }}
                />
              </label>
              <label
                htmlFor="expense-payer"
                className="space-y-1.5 text-sm font-medium"
              >
                Paid by
                <select
                  id="expense-payer"
                  value={payer}
                  disabled={!!busy}
                  onChange={(e) => {
                    setPayer(e.target.value);
                    invalidate();
                  }}
                  className="h-8 w-full rounded-2xl bg-input/50 px-3 font-normal"
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Who shared this cost?
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {members.map((member) => (
                  <label
                    key={member.id}
                    className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={participants.includes(member.id)}
                      disabled={!!busy}
                      onChange={() => {
                        setParticipants((old) =>
                          old.includes(member.id)
                            ? old.filter((id) => id !== member.id)
                            : [...old, member.id],
                        );
                        invalidate();
                      }}
                    />
                    {member.displayName}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                How should it be split?
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {methods.map((option) => (
                  <label
                    key={option.id}
                    className="flex gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="split-method"
                      value={option.id}
                      checked={method === option.id}
                      disabled={!!busy}
                      onChange={() => {
                        setMethod(option.id);
                        invalidate();
                      }}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {option.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {method !== 'equal' && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {method === 'exact'
                    ? `Share in ${household.defaultCurrency}`
                    : method === 'percentage'
                      ? 'Percentage share'
                      : 'Ratio weight'}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {members
                    .filter((member) => participants.includes(member.id))
                    .map((member) => (
                      <label
                        htmlFor={`share-${member.id}`}
                        key={member.id}
                        className="space-y-1 text-sm"
                      >
                        {member.displayName}
                        <Input
                          id={`share-${member.id}`}
                          value={values[member.id] ?? ''}
                          inputMode={method === 'ratio' ? 'numeric' : 'decimal'}
                          disabled={!!busy}
                          placeholder={method === 'ratio' ? '1' : '0.00'}
                          onChange={(e) => {
                            setValues((old) => ({
                              ...old,
                              [member.id]: e.target.value,
                            }));
                            invalidate();
                          }}
                        />
                      </label>
                    ))}
                </div>
              </div>
            )}
            {formError && (
              <p
                role="alert"
                className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </p>
            )}
            {!preview && (
              <Button
                onClick={() => void showPreview()}
                disabled={!!busy || loading}
              >
                {busy === 'preview'
                  ? 'Calculating…'
                  : editing
                    ? 'Preview revised shares'
                    : 'Preview shares'}{' '}
                <ArrowRight size={16} />
              </Button>
            )}
            {preview && (
              <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <strong className="text-base">
                      Review before confirming
                    </strong>
                    <p className="text-xs text-muted-foreground">
                      {editing
                        ? `Revision ${editing.revision} will be replaced only after you confirm.`
                        : savedDraft.hasAttempt ||
                            formError.startsWith('Not yet confirmed:')
                          ? 'Confirmation has not been verified. Use this same review to retry.'
                          : 'No expense has been saved yet.'}
                    </p>
                  </div>
                  <strong>
                    {money(preview.amountMinor, preview.currency)}
                  </strong>
                </div>
                {preview.shares.map((share) => (
                  <div
                    key={share.memberId}
                    className="flex justify-between gap-3 border-t border-border pt-2 text-sm"
                  >
                    <span>{share.displayName}</span>
                    <strong>
                      {money(share.amountMinor, preview.currency)}
                    </strong>
                  </div>
                ))}
                <Button onClick={() => void confirm()} disabled={!!busy}>
                  {busy === 'save'
                    ? 'Saving…'
                    : editing
                      ? 'Save revised expense'
                      : 'Confirm expense'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading expenses…
        </p>
      )}
      {loadError && (
        <div
          role="alert"
          className="space-x-3 rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
        >
          {loadError}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}
      {!loading && !loadError && expenses.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <ReceiptText size={42} className="text-primary" />
            <h3 className="font-heading text-lg">No shared expenses yet</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add the first cost and choose who shares it. You will see the
              exact breakdown before saving.
            </p>
          </CardContent>
        </Card>
      )}
      {expenses.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
          <Card className={selected ? 'max-lg:hidden' : undefined}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Expense history</CardTitle>
                {(expenses.length > 3 || hasMore) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={historyExpanded}
                    aria-controls={historyPanelId}
                    onClick={() => setHistoryExpanded((open) => !open)}
                  >
                    {historyExpanded ? 'Show less' : 'View all expenses'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent id={historyPanelId} className="space-y-2">
              {expenses
                .slice(0, historyExpanded ? undefined : 3)
                .map((expense) => (
                  <button
                    type="button"
                    key={expense.id}
                    onClick={() => void selectExpense(expense.id)}
                    className={`history-row flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 ${selected?.id === expense.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                  >
                    <span>
                      <strong className="block">{expense.title}</strong>
                      {expense.voidedAt && (
                        <small className="text-destructive">
                          Voided · excluded from balances
                        </small>
                      )}
                      <small className="text-muted-foreground">
                        {readableDate(expense.spentOn)} · Paid by{' '}
                        {expense.payerDisplayName}
                      </small>
                    </span>
                    <strong className="shrink-0 text-sm">
                      {money(expense.amountMinor, expense.currency)}
                    </strong>
                  </button>
                ))}
              {historyExpanded && hasMore && (
                <Button
                  variant="outline"
                  onClick={() => void more()}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              )}
            </CardContent>
          </Card>
          <Card
            id="expense-detail"
            tabIndex={-1}
            className={`scroll-mt-6 ${selected || detailError ? '' : 'max-lg:hidden'}`}
          >
            <CardHeader>
              {selected && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-2 self-start lg:hidden"
                  onClick={() => {
                    setSelected(null);
                    setVoidOpen(false);
                  }}
                >
                  Back to expenses
                </Button>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Expense details</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={detailsExpanded}
                  aria-controls={detailsPanelId}
                  onClick={() => setDetailsExpanded((open) => !open)}
                >
                  {detailsExpanded ? 'Hide details' : 'View details'}
                </Button>
              </div>
            </CardHeader>
            <CardContent id={detailsPanelId} hidden={!detailsExpanded}>
              {detailError && (
                <p role="alert" className="text-sm text-destructive">
                  {detailError}
                </p>
              )}
              {!selected && (
                <p className="text-sm text-muted-foreground">
                  Select an expense to see its full breakdown.
                </p>
              )}
              {selected && (
                <div className="space-y-4 text-sm">
                  <div>
                    <h3 className="font-heading text-lg">{selected.title}</h3>
                    <strong className="text-xl text-primary">
                      {money(selected.amountMinor, selected.currency)}
                    </strong>
                    {selected.voidedAt && (
                      <p className="mt-2 rounded-lg bg-muted p-2 text-muted-foreground">
                        Voided by {selected.voidedByDisplayName ?? 'a member'}{' '}
                        on {readableDate(selected.voidedAt)}. Excluded from
                        balances.
                        {selected.voidReason && (
                          <> Reason: {selected.voidReason}</>
                        )}
                      </p>
                    )}
                    {selected.canEdit && (
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(selected)}
                        >
                          Edit expense
                        </Button>
                      </div>
                    )}
                    {selected.canVoid && !voidOpen && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          setFormOpen(false);
                          setVoidOpen(true);
                        }}
                      >
                        Remove mistaken expense
                      </Button>
                    )}
                  </div>
                  {voidOpen && selected.canVoid && (
                    <VoidConfirmation
                      key={`${selected.id}-${selected.revision}`}
                      record={selected}
                      kind="expense"
                      onCancel={() => setVoidOpen(false)}
                      previewAction={(reason) =>
                        previewExpenseVoid(
                          token,
                          household.id,
                          selected.id,
                          selected.revision,
                          reason,
                        )
                      }
                      confirmAction={(reason, previewId, key) =>
                        voidExpense(
                          token,
                          household.id,
                          selected.id,
                          selected.revision,
                          reason,
                          previewId,
                          key,
                        )
                      }
                      onVoided={(result) => {
                        setExpenses((old) =>
                          old.map((item) =>
                            item.id === result.id ? result : item,
                          ),
                        );
                        setSelected(result);
                        onMoneyChanged();
                        setVoidOpen(false);
                        setNotice(
                          'Mistaken expense removed from active balances and kept in history.',
                        );
                      }}
                    />
                  )}
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-muted-foreground">Date</dt>
                      <dd>{readableDate(selected.spentOn)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Paid by</dt>
                      <dd>{selected.payerDisplayName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Split</dt>
                      <dd className="capitalize">{selected.splitMethod}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Added by</dt>
                      <dd>{selected.createdByDisplayName}</dd>
                    </div>
                  </dl>
                  <div>
                    <h4 className="mb-2 font-medium">Each person’s share</h4>
                    {selected.shares.map((share) => (
                      <div
                        key={share.memberId}
                        className="flex justify-between gap-2 border-t border-border py-2"
                      >
                        <span>{share.displayName}</span>
                        <strong>
                          {money(share.amountMinor, selected.currency)}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <FinancialHistory
                    key={`history-${selected.id}-${selected.revision}`}
                    token={token}
                    householdId={household.id}
                    recordId={selected.id}
                    kind="expense"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
