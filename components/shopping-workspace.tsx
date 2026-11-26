'use client';

import { Check, Pencil, ShoppingBasket, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SuccessNotice } from '@/components/success-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ApiRequestError,
  cancelShoppingItem,
  createShoppingItem,
  type ExpenseDraft,
  type ExpensePreview,
  editShoppingItem,
  formatCurrency,
  getMembers,
  getShoppingItem,
  getShoppingItems,
  type Household,
  type HouseholdMember,
  previewExpense,
  purchaseShoppingItem,
  purchaseShoppingWithExpense,
  type ShoppingDraft,
  type ShoppingItem,
  type SplitMethod,
} from '@/lib/api';
import { confirmationFailure } from '@/lib/financial-confirmation';
import { useLeaveGuard } from '@/lib/pending-work';
import { useHouseRecords } from '@/lib/use-house-records';
import { RecordRefreshButton } from './communication-parts';
import { HouseTaskRow, useHouseTaskFocus } from './house-task-list';
import { SavedDraftNotice, useSavedDraft } from './saved-draft';
import { WorkspaceLoading } from './workspace-loading';

function parseMoney(value: string): number | null {
  const clean = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ''] = clean.split('.');
  const amount = Number(
    BigInt(whole ?? '0') * BigInt(100) + BigInt(fraction.padEnd(2, '0')),
  );
  return Number.isSafeInteger(amount) && amount <= 999999999999 ? amount : null;
}
function amountInput(minor: number | null): string {
  return minor === null ? '' : (minor / 100).toFixed(2);
}
function householdToday(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = Object.fromEntries(
    parts.map((entry) => [entry.type, entry.value]),
  );
  return `${part.year}-${part.month}-${part.day}`;
}
function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

function loadPage(
  token: string,
  householdId: string,
  _scope: 'all',
  limit: number,
  offset: number,
) {
  return getShoppingItems(token, householdId, limit, offset);
}

export function ShoppingWorkspace({
  household,
  token,
  focusedId = '',
  focusSignal = 0,
  createRequest = 0,
  onHouseChanged = () => {},
}: {
  household: Household;
  token: string;
  focusedId?: string;
  focusSignal?: number;
  createRequest?: number;
  onHouseChanged?: () => void;
}) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [filter, setFilter] = useState<'needed' | 'history'>('needed');
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [memberError, setMemberError] = useState('');
  const memberRequest = useRef(0);
  const handledCreate = useRef(0);
  const handledLink = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<ShoppingDraft['priority']>('normal');
  const [buyer, setBuyer] = useState('');
  const [estimate, setEstimate] = useState('');
  const [cancelTarget, setCancelTarget] = useState<ShoppingItem | null>(null);
  const [purchaseTarget, setPurchaseTarget] = useState<ShoppingItem | null>(
    null,
  );
  const cancelConfirm = cancelTarget !== null;
  const purchasing = purchaseTarget !== null;
  useLeaveGuard(formOpen || purchasing || cancelConfirm || busy);
  const [actualPrice, setActualPrice] = useState('');
  const [addExpense, setAddExpense] = useState(false);
  const [payerId, setPayerId] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [spentOn, setSpentOn] = useState(() =>
    householdToday(household.timezone),
  );
  const [preview, setPreview] = useState<ExpensePreview | null>(null);
  const [previewDraft, setPreviewDraft] = useState<ExpenseDraft | null>(null);
  const [retryKey, setRetryKey] = useState('');
  const previewGeneration = useRef(0);
  const browser = useHouseRecords({
    token,
    householdId: household.id,
    scope: 'all',
    loadPage,
    getRecord: getShoppingItem,
    focusedId,
    focusSignal,
    pauseRefresh: formOpen || purchasing || cancelConfirm || busy,
  });
  const {
    records: items,
    selected: selectedRecord,
    loading,
    hasMore,
    loadingMore,
    open,
    close,
    accept,
  } = browser;
  const selected = purchaseTarget ?? cancelTarget ?? selectedRecord;
  const focus = useHouseTaskFocus(formOpen, createRequest, selected?.id);
  const selectedId = selected?.id;

  const money = (value: number, currency = household.defaultCurrency) =>
    `${formatCurrency(value, currency)} ${currency}`;

  const savedDraft = useSavedDraft({
    kind: 'shopping',
    enabled: formOpen && !editing,
    value: { title, quantity, unit, note, priority, buyer, estimate },
    restore(snapshot) {
      setTitle(snapshot.title);
      setQuantity(snapshot.quantity);
      setUnit(snapshot.unit);
      setNote(snapshot.note);
      setPriority(snapshot.priority);
      setBuyer(snapshot.buyer);
      setEstimate(snapshot.estimate);
      setFormOpen(true);
      setEditing(null);
    },
  });

  const loadMembers = useCallback(async () => {
    const request = ++memberRequest.current;
    setLoadingMembers(true);
    setMemberError('');
    try {
      const next = await getMembers(token, household.id);
      if (request !== memberRequest.current) return;
      setMembers(next);
    } catch (failure) {
      if (request !== memberRequest.current) return;
      setMembers([]);
      setMemberError(errorText(failure));
    } finally {
      if (request === memberRequest.current) setLoadingMembers(false);
    }
  }, [token, household.id]);

  useEffect(() => {
    void loadMembers();
    return () => {
      memberRequest.current += 1;
    };
  }, [loadMembers]);

  useEffect(() => {
    if (!createRequest || createRequest === handledCreate.current) return;
    handledCreate.current = createRequest;
    if (busy || purchasing || cancelConfirm) {
      setError('Finish or cancel the open action before adding an item.');
      return;
    }
    if (formOpen) return;
    setEditing(null);
    setTitle('');
    setQuantity('');
    setUnit('');
    setNote('');
    setPriority('normal');
    setBuyer('');
    setEstimate('');
    setError('');
    setNotice('');
    setFormOpen(true);
  }, [createRequest, busy, purchasing, cancelConfirm, formOpen]);

  useEffect(() => {
    if (
      !focusSignal ||
      handledLink.current === focusSignal ||
      selected?.id !== focusedId ||
      !selected
    )
      return;
    handledLink.current = focusSignal;
    setFilter(
      selected.status === 'needed' || selected.status === 'assigned'
        ? 'needed'
        : 'history',
    );
  }, [focusedId, focusSignal, selected]);

  function clearPurchasePreview() {
    previewGeneration.current += 1;
    setPreview(null);
    setPreviewDraft(null);
    setRetryKey('');
  }
  function openForm(item: ShoppingItem | null) {
    setEditing(item);
    setTitle(item?.title ?? '');
    setQuantity(item?.quantity?.toString() ?? '');
    setUnit(item?.unit ?? '');
    setNote(item?.note ?? '');
    setPriority(item?.priority ?? 'normal');
    setBuyer(item?.assignedBuyerMemberId ?? '');
    setEstimate(amountInput(item?.estimatedPriceMinor ?? null));
    setFormOpen(true);
    setPurchaseTarget(null);
    setCancelTarget(null);
    setError('');
    setNotice('');
  }
  function buildItemDraft(): ShoppingDraft {
    const parsedQuantity = quantity.trim() ? Number(quantity.trim()) : null;
    if (
      parsedQuantity !== null &&
      (!Number.isFinite(parsedQuantity) ||
        parsedQuantity <= 0 ||
        parsedQuantity > 999999999 ||
        Math.abs(Math.round(parsedQuantity * 1000) - parsedQuantity * 1000) >
          0.000001)
    )
      throw new Error('Quantity must be positive with at most three decimals.');
    const estimatedPriceMinor = estimate.trim() ? parseMoney(estimate) : null;
    if (estimate.trim() && estimatedPriceMinor === null)
      throw new Error(
        'Enter a valid estimated price with at most two decimals.',
      );
    if (!title.trim()) throw new Error('Enter an item name.');
    return {
      title: title.trim(),
      quantity: parsedQuantity,
      unit: unit.trim() || null,
      note: note.trim() || null,
      priority,
      assignedBuyerMemberId: buyer || null,
      estimatedPriceMinor,
    };
  }
  async function saveItem(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    let draft: ShoppingDraft;
    try {
      draft = buildItemDraft();
    } catch (failure) {
      setError(errorText(failure));
      return;
    }
    setBusy(true);
    try {
      const saved = editing
        ? await editShoppingItem(
            token,
            household.id,
            editing.id,
            draft,
            editing.revision,
          )
        : await createShoppingItem(
            token,
            household.id,
            draft,
            savedDraft.confirmationKey(draft),
          );
      accept(saved);
      void browser.refresh(true);
      if (!editing) savedDraft.clear();
      setFormOpen(false);
      setEditing(null);
      setNotice(editing ? 'Shopping item updated.' : 'Shopping item added.');
      setFilter('needed');
      onHouseChanged();
    } catch (failure) {
      savedDraft.reject(failure);
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  async function cancelItem() {
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      accept(
        await cancelShoppingItem(
          token,
          household.id,
          selected.id,
          selected.revision,
        ),
      );
      setCancelTarget(null);
      setNotice('Item cancelled.');
      setFilter('history');
      onHouseChanged();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  function beginPurchase(item: ShoppingItem) {
    setPurchaseTarget(item);
    setFormOpen(false);
    setCancelTarget(null);
    setActualPrice(amountInput(item.estimatedPriceMinor));
    setAddExpense(false);
    setPayerId(item.viewerMemberId);
    setParticipantIds(members.map((member) => member.id));
    setSplitMethod('equal');
    setSplitValues({});
    setSpentOn(householdToday(household.timezone));
    clearPurchasePreview();
    setError('');
    setNotice('');
  }
  function buildExpenseDraft(item: ShoppingItem): ExpenseDraft {
    const amountMinor = parseMoney(actualPrice);
    if (amountMinor === null || amountMinor < 1)
      throw new Error(
        'Enter the actual price, greater than zero, before adding an expense.',
      );
    if (!payerId) throw new Error('Choose who paid.');
    if (!participantIds.length)
      throw new Error('Choose at least one participant.');
    const shares = participantIds.map((memberId) => {
      if (splitMethod === 'equal') return { memberId };
      const raw = splitValues[memberId]?.trim() ?? '';
      const value =
        splitMethod === 'ratio'
          ? /^[1-9]\d*$/.test(raw)
            ? Number(raw)
            : null
          : parseMoney(raw);
      if (
        value === null ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        (splitMethod === 'ratio' && value < 1)
      )
        throw new Error(
          `Enter a valid ${splitMethod === 'ratio' ? 'whole-number ratio' : splitMethod === 'percentage' ? 'percentage' : 'share'} for every participant.`,
        );
      return { memberId, value };
    });
    return {
      title: `Shopping: ${Array.from(item.title).slice(0, 150).join('')}`,
      amountMinor,
      currency: household.defaultCurrency,
      spentOn,
      payerMemberId: payerId,
      split: { method: splitMethod, shares },
    };
  }
  async function showExpensePreview() {
    if (!selected) return;
    clearPurchasePreview();
    const generation = previewGeneration.current;
    setError('');
    setNotice('');
    let draft: ExpenseDraft;
    try {
      draft = buildExpenseDraft(selected);
    } catch (failure) {
      setError(errorText(failure));
      return;
    }
    setBusy(true);
    try {
      const next = await previewExpense(token, household.id, draft);
      if (generation !== previewGeneration.current) return;
      setPreview(next);
      setPreviewDraft(draft);
      setRetryKey(crypto.randomUUID());
    } catch (failure) {
      if (generation === previewGeneration.current)
        setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  async function confirmPurchase() {
    if (!selected) return;
    setError('');
    setNotice('');
    const amount = actualPrice.trim() ? parseMoney(actualPrice) : null;
    if (actualPrice.trim() && amount === null) {
      setError('Enter a valid actual price with at most two decimals.');
      return;
    }
    if (addExpense && (!preview || !previewDraft || !retryKey)) {
      setError('Preview the expense shares before confirmation.');
      return;
    }
    setBusy(true);
    try {
      const item =
        addExpense && previewDraft
          ? (
              await purchaseShoppingWithExpense(
                token,
                household.id,
                selected.id,
                selected.revision,
                previewDraft,
                retryKey,
              )
            ).item
          : await purchaseShoppingItem(
              token,
              household.id,
              selected.id,
              selected.revision,
              amount,
            );
      accept(item);
      setPurchaseTarget(null);
      clearPurchasePreview();
      setNotice(
        item.linkedExpenseId
          ? 'Item purchased and expense confirmed.'
          : 'Item marked purchased. No expense was added.',
      );
      setFilter('history');
      onHouseChanged();
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.code === 'STALE_ITEM') {
        clearPurchasePreview();
        setPurchaseTarget(null);
        await browser.refresh(true);
      }
      setError(
        confirmationFailure(
          failure,
          addExpense ? 'purchase and expense' : 'purchase',
          addExpense,
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const canChange =
    selected?.status === 'needed' || selected?.status === 'assigned';
  const groups = {
    needed: items.filter(
      (item) => item.status === 'needed' || item.status === 'assigned',
    ),
    history: items
      .filter(
        (item) => item.status === 'purchased' || item.status === 'cancelled',
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
  const visible = groups[filter];

  return (
    <div className="content-inner space-y-6">
      <SavedDraftNotice
        draft={savedDraft}
        disabled={busy}
        resumeDisabled={loadingMembers || !members.length || !!editing}
      />
      {(error || browser.error) && (
        <p role="alert" className="form-message error">
          {error || browser.error}
        </p>
      )}
      {memberError && (
        <p role="alert" className="form-message error">
          {memberError}{' '}
          <Button
            type="button"
            variant="link"
            disabled={loadingMembers}
            onClick={() => void loadMembers()}
          >
            Retry members
          </Button>
        </p>
      )}
      {notice && (
        <SuccessNotice key={notice} className="form-message">
          {notice}
        </SuccessNotice>
      )}
      {formOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {editing ? 'Edit shopping item' : 'Add shopping item'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveItem} className="scroll-mt-6 space-y-4">
              <fieldset disabled={busy} className="min-w-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium">
                    Item name
                    <input
                      ref={focus.name}
                      className="h-10 rounded-md border bg-background px-3"
                      required
                      maxLength={160}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Quantity (optional)
                    <input
                      className="h-10 rounded-md border bg-background px-3"
                      type="number"
                      min="0.001"
                      max="999999999"
                      step="0.001"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Unit (optional)
                    <input
                      className="h-10 rounded-md border bg-background px-3"
                      maxLength={40}
                      placeholder="packs, kg, bottles"
                      value={unit}
                      onChange={(event) => setUnit(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Priority
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={priority}
                      onChange={(event) =>
                        setPriority(
                          event.target.value as ShoppingDraft['priority'],
                        )
                      }
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Assign buyer (optional)
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={buyer}
                      onChange={(event) => setBuyer(event.target.value)}
                    >
                      <option value="">Nobody assigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Estimated price · {household.defaultCurrency} (optional)
                    <input
                      className="h-10 rounded-md border bg-background px-3"
                      inputMode="decimal"
                      value={estimate}
                      onChange={(event) => setEstimate(event.target.value)}
                      placeholder="0.00"
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-sm font-medium">
                  Note (optional)
                  <textarea
                    className="min-h-20 rounded-md border bg-background p-3"
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (!editing) savedDraft.clear();
                    setFormOpen(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <fieldset
              className="board-record-filters min-w-0"
              ref={focus.filters}
            >
              <legend className="sr-only">Filter shopping</legend>
              {(
                [
                  ['needed', 'To buy'],
                  ['history', 'History'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  disabled={busy || purchasing || cancelConfirm}
                  variant={filter === key ? 'default' : 'outline'}
                  aria-pressed={filter === key}
                  onClick={() => {
                    focus.row.current = null;
                    setError('');
                    setNotice('');
                    close();
                    setFilter(key);
                  }}
                >
                  {label}
                </Button>
              ))}
            </fieldset>
            <RecordRefreshButton
              label="shopping"
              loading={loading || busy || purchasing || cancelConfirm}
              onRefresh={() => {
                setError('');
                void browser.refresh();
                void loadMembers();
              }}
            />
          </div>
          {browser.detailLoading && (
            <p role="status" className="text-sm text-muted-foreground">
              Opening item…
            </p>
          )}
          {loading && visible.length === 0 && !selected && <WorkspaceLoading />}
          {!loading && visible.length === 0 && !selected && !browser.error && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <ShoppingBasket
                  size={32}
                  className="text-primary"
                  aria-hidden="true"
                />
                <p className="font-heading text-lg">
                  {filter === 'needed'
                    ? 'Nothing to buy right now.'
                    : hasMore
                      ? 'Load more to see older shopping items.'
                      : 'No purchased or cancelled items yet.'}
                </p>
              </CardContent>
            </Card>
          )}
          {(visible.length > 0 || selected) && (
            <div
              className={
                selected && visible.length
                  ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]'
                  : 'space-y-4'
              }
            >
              {visible.length > 0 && (
                <Card className={selected ? 'max-lg:hidden' : undefined}>
                  <CardContent className="space-y-2">
                    {visible.map((item) => (
                      <HouseTaskRow
                        key={item.id}
                        title={item.title}
                        status={item.status}
                        icon={ShoppingBasket}
                        tone="lilac"
                        active={selectedId === item.id}
                        disabled={busy || purchasing || cancelConfirm}
                        onClick={(event) => {
                          focus.row.current = event.currentTarget;
                          setError('');
                          setNotice('');

                          void open(item.id);
                        }}
                      >
                        {item.quantity !== null && (
                          <>
                            {item.quantity} {item.unit} ·{' '}
                          </>
                        )}
                        {item.assignedBuyerDisplayName ?? 'Unassigned'}
                        {item.priority === 'high' && ' · High priority'}
                      </HouseTaskRow>
                    ))}
                  </CardContent>
                </Card>
              )}
              {selected && (
                <Card ref={focus.detail} tabIndex={-1} className="scroll-mt-6">
                  <CardHeader>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mb-2 self-start"
                      disabled={busy || purchasing || cancelConfirm}
                      onClick={() => focus.back(close)}
                    >
                      Back to shopping
                    </Button>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{selected.title}</CardTitle>
                      <Badge variant="outline" className="capitalize">
                        {selected.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Added by {selected.createdByDisplayName} ·{' '}
                      {selected.priority} priority
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-5 text-sm">
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Quantity</dt>
                        <dd>
                          {selected.quantity === null
                            ? 'Not specified'
                            : `${selected.quantity} ${selected.unit ?? ''}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          Assigned buyer
                        </dt>
                        <dd>
                          {selected.assignedBuyerDisplayName ??
                            'Nobody assigned'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          Estimated price
                        </dt>
                        <dd>
                          {selected.estimatedPriceMinor === null
                            ? 'Not specified'
                            : money(
                                selected.estimatedPriceMinor,
                                selected.currency,
                              )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          Purchased price
                        </dt>
                        <dd>
                          {selected.purchasedPriceMinor === null
                            ? 'Not specified'
                            : money(
                                selected.purchasedPriceMinor,
                                selected.currency,
                              )}
                        </dd>
                      </div>
                    </dl>
                    {selected.note && (
                      <p>
                        <strong>Note:</strong> {selected.note}
                      </p>
                    )}
                    {selected.status === 'purchased' && (
                      <p>Purchased by {selected.purchasedByDisplayName}.</p>
                    )}
                    {selected.linkedExpenseId && (
                      <p>
                        <Link
                          className="text-primary underline"
                          href={`/money?household=${encodeURIComponent(household.id)}&view=expenses&record=${encodeURIComponent(selected.linkedExpenseId)}`}
                        >
                          View linked expense
                          {selected.linkedExpenseVoidedAt ? ' (voided)' : ''}
                        </Link>
                      </p>
                    )}
                    {canChange && !purchasing && !cancelConfirm && (
                      <div className="flex flex-wrap gap-2 border-t pt-4">
                        <Button
                          variant="outline"
                          disabled={busy || browser.detailLoading}
                          onClick={() => openForm(selected)}
                        >
                          <Pencil size={16} /> Edit
                        </Button>
                        <Button
                          disabled={busy || browser.detailLoading}
                          onClick={() => beginPurchase(selected)}
                        >
                          <Check size={16} /> Mark purchased
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy || browser.detailLoading}
                          onClick={() => {
                            setCancelTarget(selected);
                            setPurchaseTarget(null);
                          }}
                        >
                          <X size={16} /> Cancel item
                        </Button>
                      </div>
                    )}
                    {cancelConfirm && canChange && (
                      <div className="space-y-3 rounded-lg border p-4">
                        <p>
                          Cancel this item? It will stay visible in the list.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            disabled={busy}
                            onClick={() => void cancelItem()}
                          >
                            {busy ? 'Cancelling…' : 'Confirm cancellation'}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => setCancelTarget(null)}
                          >
                            Keep item
                          </Button>
                        </div>
                      </div>
                    )}
                    {purchasing && canChange && (
                      <div className="space-y-4 rounded-lg border p-4">
                        <h3 className="font-semibold">Confirm purchase</h3>
                        <label className="grid gap-1 font-medium">
                          Actual price · {household.defaultCurrency} (optional
                          without expense)
                          <input
                            className="h-10 rounded-md border bg-background px-3"
                            inputMode="decimal"
                            value={actualPrice}
                            onChange={(event) => {
                              setActualPrice(event.target.value);
                              clearPurchasePreview();
                            }}
                            placeholder="0.00"
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={addExpense}
                            onChange={(event) => {
                              setAddExpense(event.target.checked);
                              clearPurchasePreview();
                            }}
                          />
                          Add a shared expense
                        </label>
                        {addExpense && (
                          <div className="space-y-4 border-t pt-4">
                            <p className="text-muted-foreground">
                              The expense affects balances only after you review
                              the API-calculated shares and confirm.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="grid gap-1 font-medium">
                                Expense date · {household.timezone}
                                <input
                                  className="h-10 rounded-md border bg-background px-3"
                                  type="date"
                                  value={spentOn}
                                  onChange={(event) => {
                                    setSpentOn(event.target.value);
                                    clearPurchasePreview();
                                  }}
                                />
                              </label>
                              <label className="grid gap-1 font-medium">
                                Who paid?
                                <select
                                  className="h-10 rounded-md border bg-background px-3"
                                  value={payerId}
                                  onChange={(event) => {
                                    setPayerId(event.target.value);
                                    clearPurchasePreview();
                                  }}
                                >
                                  {members.map((member) => (
                                    <option key={member.id} value={member.id}>
                                      {member.displayName}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <fieldset>
                              <legend className="mb-2 font-medium">
                                Who shares this expense?
                              </legend>
                              <div className="flex flex-wrap gap-2">
                                {members.map((member) => (
                                  <label
                                    key={member.id}
                                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={participantIds.includes(
                                        member.id,
                                      )}
                                      onChange={() => {
                                        setParticipantIds((current) =>
                                          current.includes(member.id)
                                            ? current.filter(
                                                (id) => id !== member.id,
                                              )
                                            : [...current, member.id],
                                        );
                                        clearPurchasePreview();
                                      }}
                                    />
                                    {member.displayName}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <label className="grid gap-1 font-medium">
                              Split method
                              <select
                                className="h-10 rounded-md border bg-background px-3"
                                value={splitMethod}
                                onChange={(event) => {
                                  setSplitMethod(
                                    event.target.value as SplitMethod,
                                  );
                                  setSplitValues({});
                                  clearPurchasePreview();
                                }}
                              >
                                <option value="equal">Equal</option>
                                <option value="exact">Exact amounts</option>
                                <option value="percentage">Percentages</option>
                                <option value="ratio">
                                  Whole-number ratios
                                </option>
                              </select>
                            </label>
                            {splitMethod !== 'equal' && (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {members
                                  .filter((member) =>
                                    participantIds.includes(member.id),
                                  )
                                  .map((member) => (
                                    <label
                                      key={member.id}
                                      className="grid gap-1 font-medium"
                                    >
                                      {member.displayName} ·{' '}
                                      {splitMethod === 'exact'
                                        ? household.defaultCurrency
                                        : splitMethod === 'percentage'
                                          ? '%'
                                          : 'ratio'}
                                      <input
                                        className="h-10 rounded-md border bg-background px-3"
                                        inputMode="decimal"
                                        value={splitValues[member.id] ?? ''}
                                        onChange={(event) => {
                                          setSplitValues((current) => ({
                                            ...current,
                                            [member.id]: event.target.value,
                                          }));
                                          clearPurchasePreview();
                                        }}
                                      />
                                    </label>
                                  ))}
                              </div>
                            )}
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => void showExpensePreview()}
                            >
                              {busy ? 'Calculating…' : 'Preview expense shares'}
                            </Button>
                            {preview && (
                              <div className="space-y-2 rounded-lg bg-muted/40 p-4">
                                <p className="font-semibold">
                                  Expense preview · {money(preview.amountMinor)}
                                </p>
                                <ul>
                                  {preview.shares.map((share) => (
                                    <li
                                      key={share.memberId}
                                      className="flex justify-between gap-2 py-1"
                                    >
                                      <span>{share.displayName}</span>
                                      <strong>
                                        {money(share.amountMinor)}
                                      </strong>
                                    </li>
                                  ))}
                                </ul>
                                <p className="text-muted-foreground">
                                  Payer:{' '}
                                  {
                                    members.find(
                                      (member) =>
                                        member.id === preview.payerMemberId,
                                    )?.displayName
                                  }
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                        {!addExpense && (
                          <p className="text-muted-foreground">
                            Marking purchased alone does not change household
                            balances.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={busy || (addExpense && !preview)}
                            onClick={() => void confirmPurchase()}
                          >
                            {busy
                              ? 'Saving…'
                              : addExpense
                                ? 'Confirm purchase and expense'
                                : 'Confirm purchase'}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setPurchaseTarget(null);
                              clearPurchasePreview();
                              setError('');
                            }}
                          >
                            Close
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          {hasMore && !loading && (
            <Button
              variant="outline"
              onClick={() => void browser.loadMore()}
              disabled={loadingMore || busy || purchasing || cancelConfirm}
              className={selected ? 'max-lg:hidden' : undefined}
            >
              {loadingMore ? 'Loading…' : 'Load more shopping items'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
