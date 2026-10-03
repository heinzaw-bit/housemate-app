'use client';

import { ChevronDown, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FinancialHistory } from '@/components/financial-history';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { VoidConfirmation } from '@/components/void-confirmation';
import {
  ApiRequestError,
  type Bill,
  type BillAdjustmentKind,
  type BillDraft,
  type BillPreview,
  createBill,
  editBill,
  formatCurrency,
  getBill,
  getBills,
  getMembers,
  type Household,
  type HouseholdMember,
  previewBill,
  previewBillEdit,
  previewBillVoid,
  setBillStatus,
  voidBill,
} from '@/lib/api';
import { displayBillPreview } from '@/lib/bill-presentation';
import { formatRecordDate as date } from '@/lib/date-format';
import { confirmationFailure } from '@/lib/financial-confirmation';
import { useLeaveGuard } from '@/lib/pending-work';
import { appendRecords } from '@/lib/record-pages';

type AdjustmentRow = {
  id: string;
  label: string;
  kind: BillAdjustmentKind | 'excluded' | '';
  amount: string;
  memberIds: string[];
};
const types: BillDraft['billType'][] = [
  'electricity',
  'water',
  'internet',
  'rent',
  'other',
];
const kinds: { value: BillAdjustmentKind | 'excluded'; label: string }[] = [
  { value: 'individual_charge', label: 'Charge one person' },
  { value: 'shared_charge', label: 'Share this charge' },
  { value: 'individual_credit', label: 'Credit / deduction for one person' },
  { value: 'shared_credit', label: 'Share this credit / deduction' },
  { value: 'excluded', label: 'Outside this household' },
];

function minor(value: string): number | null {
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
function monthStart() {
  return `${localDate().slice(0, 7)}-01`;
}
function money(value: number, currency: Household['defaultCurrency']) {
  return formatCurrency(value, currency);
}

export function BillWorkspace({
  household,
  token,
  initialRecordId,
  initialCreate = false,
  onMoneyChanged,
}: {
  household: Household;
  token: string;
  initialRecordId?: string;
  initialCreate?: boolean;
  onMoneyChanged: () => void;
}) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [selected, setSelected] = useState<Bill | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const historyPanelId = useId();
  const detailsPanelId = useId();
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(initialCreate);
  useLeaveGuard(formOpen);
  const [formStep, setFormStep] = useState<'details' | 'split' | 'review'>(
    'details',
  );
  const [editing, setEditing] = useState<Bill | null>(null);
  const [editScrollRequest, setEditScrollRequest] = useState(0);
  const [voidOpen, setVoidOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [billType, setBillType] =
    useState<BillDraft['billType']>('electricity');
  const [provider, setProvider] = useState('');
  const [amount, setAmount] = useState('');
  const [periodStart, setPeriodStart] = useState(monthStart);
  const [periodEnd, setPeriodEnd] = useState(localDate);
  const [dueDate, setDueDate] = useState(localDate);
  const [payer, setPayer] = useState('');
  const [paymentStatus, setPaymentStatus] =
    useState<BillDraft['paymentStatus']>('unpaid');
  const [participants, setParticipants] = useState<string[]>([]);
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const [preview, setPreview] = useState<BillPreview | null>(null);
  const [previewDraft, setPreviewDraft] = useState<BillDraft | null>(null);
  const [retryKey, setRetryKey] = useState('');
  const [editPreviewId, setEditPreviewId] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState<'preview' | 'save' | 'status' | null>(null);
  const pageOffset = useRef(0);
  const moreInFlight = useRef(false);
  const previewGeneration = useRef(0);
  const editFormRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [nextMembers, nextBills] = await Promise.all([
        getMembers(token, household.id),
        getBills(token, household.id),
      ]);
      setMembers(nextMembers);
      setBills(nextBills);
      pageOffset.current = nextBills.length;
      setHasMore(nextBills.length === 50);
      setPayer((old) => old || nextMembers[0]?.id || '');
      setParticipants((old) =>
        old.length ? old : nextMembers.map((member) => member.id),
      );
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Could not load bills.',
      );
    } finally {
      setLoading(false);
    }
  }, [token, household.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!initialRecordId) return;
    let active = true;
    setDetailsExpanded(true);
    setDetailError('');
    getBill(token, household.id, initialRecordId)
      .then((record) => {
        if (active) setSelected(record);
      })
      .catch((error: unknown) => {
        if (active)
          setDetailError(
            error instanceof Error
              ? error.message
              : 'Could not open this bill.',
          );
      });
    return () => {
      active = false;
    };
  }, [initialRecordId, token, household.id]);

  useEffect(() => {
    if (initialRecordId && !loading && (selected || detailError)) {
      document
        .getElementById('bill-detail')
        ?.scrollIntoView({ block: 'start' });
      document.getElementById('bill-detail')?.focus({ preventScroll: true });
    }
  }, [initialRecordId, loading, selected, detailError]);

  useEffect(() => {
    if (!editScrollRequest) return;
    editFormRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    });
  }, [editScrollRequest]);

  function invalidate() {
    previewGeneration.current += 1;
    setPreview(null);
    setPreviewDraft(null);
    setRetryKey('');
    setEditPreviewId('');
    setFormError('');
  }
  function startEdit(bill: Bill) {
    setVoidOpen(false);
    setFormStep('details');
    const activeIds = new Set(members.map((member) => member.id));
    setEditing(bill);
    setTitle(bill.title);
    setBillType(bill.billType);
    setProvider(bill.provider);
    setAmount((bill.amountMinor / 100).toFixed(2));
    setPeriodStart(bill.periodStart);
    setPeriodEnd(bill.periodEnd);
    setDueDate(bill.dueDate);
    setPayer(activeIds.has(bill.payerMemberId) ? bill.payerMemberId : '');
    setPaymentStatus(bill.paymentStatus);
    setParticipants(
      bill.sharedParticipantIds.filter((id) => activeIds.has(id)),
    );
    setRows(
      bill.adjustments.map((item) => ({
        id: crypto.randomUUID(),
        label: item.label,
        kind: item.kind,
        amount: (item.amountMinor / 100).toFixed(2),
        memberIds: item.memberIds.filter((id) => activeIds.has(id)),
      })),
    );
    setFormOpen(true);
    setEditScrollRequest((request) => request + 1);
    setNotice('');
    invalidate();
  }
  function updateRow(id: string, change: Partial<AdjustmentRow>) {
    invalidate();
    setRows((old) =>
      old.map((row) => (row.id === id ? { ...row, ...change } : row)),
    );
  }
  function toggle(
    id: string,
    current: string[],
    set: (next: string[]) => void,
  ) {
    invalidate();
    set(
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function validateDetails(): number {
    const amountMinor = minor(amount);
    if (!title.trim() || !provider.trim())
      throw new Error('Enter a bill title and provider.');
    if (amountMinor === null || amountMinor < 1)
      throw new Error(
        'Enter a positive bill amount with at most two decimals.',
      );
    if (!periodStart || !periodEnd || !dueDate)
      throw new Error('Choose the billing period and due date.');
    if (periodStart > periodEnd)
      throw new Error('Billing period start must be on or before the end.');
    if (!payer) throw new Error('Choose who pays the provider.');
    return amountMinor;
  }

  function buildDraft(): BillDraft {
    const amountMinor = validateDetails();
    if (!participants.length)
      throw new Error('Choose at least one member for the base shared amount.');
    const adjustments = rows.map((row) => {
      if (!row.kind)
        throw new Error(
          `Classify “${row.label || 'new adjustment'}” as a charge or credit, then choose who it belongs to.`,
        );
      if (row.kind === 'excluded')
        throw new Error(
          `“${row.label || 'This amount'}” is outside this household. Subtract it from the bill total, then remove this adjustment before previewing.`,
        );
      const amountMinor = minor(row.amount);
      if (!row.label.trim() || amountMinor === null || amountMinor < 1)
        throw new Error('Each adjustment needs a label and a positive amount.');
      if (!row.memberIds.length)
        throw new Error(`Choose who receives “${row.label}”.`);
      if (row.kind.startsWith('individual_') && row.memberIds.length !== 1)
        throw new Error(`Choose exactly one person for “${row.label}”.`);
      return {
        label: row.label.trim(),
        kind: row.kind as BillAdjustmentKind,
        amountMinor,
        memberIds: row.memberIds,
      };
    });
    return {
      title: title.trim(),
      billType,
      provider: provider.trim(),
      amountMinor,
      currency: household.defaultCurrency,
      periodStart,
      periodEnd,
      dueDate,
      payerMemberId: payer,
      paymentStatus,
      sharedParticipantIds: participants,
      adjustments,
    };
  }

  async function showPreview() {
    const generation = ++previewGeneration.current;
    setFormError('');
    setPreview(null);
    setPreviewDraft(null);
    setRetryKey('');
    setEditPreviewId('');
    let draft: BillDraft;
    try {
      draft = buildDraft();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Check the bill details.',
      );
      return;
    }
    setBusy('preview');
    try {
      const result = editing
        ? await previewBillEdit(
            token,
            household.id,
            editing.id,
            draft,
            editing.revision,
          )
        : await previewBill(token, household.id, draft);
      if (generation !== previewGeneration.current) return;
      setPreview(result);
      setPreviewDraft(draft);
      setEditPreviewId(
        'previewId' in result && typeof result.previewId === 'string'
          ? result.previewId
          : '',
      );
      setRetryKey(crypto.randomUUID());
      setFormStep('review');
      setEditScrollRequest((request) => request + 1);
    } catch (error) {
      if (generation === previewGeneration.current)
        setFormError(
          error instanceof Error
            ? error.message
            : 'Could not preview this bill.',
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
      const result = editing
        ? await editBill(
            token,
            household.id,
            editing.id,
            previewDraft,
            editing.revision,
            editPreviewId,
            retryKey,
          )
        : await createBill(token, household.id, previewDraft, retryKey);
      setBills((old) =>
        [result, ...old.filter((bill) => bill.id !== result.id)].sort((a, b) =>
          b.dueDate.localeCompare(a.dueDate),
        ),
      );
      setSelected(result);
      onMoneyChanged();
      setNotice(
        editing
          ? 'Bill updated. Paid bills now use the revised shares in balances.'
          : 'Bill confirmed and shared with your household.',
      );
      setFormOpen(false);
      setFormStep('details');
      setEditing(null);
      setTitle('');
      setProvider('');
      setAmount('');
      setRows([]);
      setPreview(null);
      setPreviewDraft(null);
      setRetryKey('');
      setEditPreviewId('');
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        (error.code === 'PREVIEW_REQUIRED' || error.code === 'STALE_RECORD')
      ) {
        invalidate();
        setFormStep('split');
      }
      setFormError(
        error instanceof Error
          ? error instanceof ApiRequestError && error.code === 'STALE_RECORD'
            ? `${error.message} Close this form and reopen Edit to review the latest version.`
            : confirmationFailure(error, 'bill')
          : confirmationFailure(error, 'bill'),
      );
    } finally {
      setBusy(null);
    }
  }

  async function chooseBill(id: string) {
    setDetailsExpanded(true);
    setVoidOpen(false);
    setDetailError('');
    try {
      setSelected(await getBill(token, household.id, id));
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : 'Could not load bill detail.',
      );
    }
  }

  async function updateStatus(status: Bill['paymentStatus']) {
    if (!selected) return;
    setBusy('status');
    setDetailError('');
    try {
      const result = await setBillStatus(
        token,
        household.id,
        selected.id,
        status,
      );
      setSelected(result);
      setBills((old) =>
        old.map((bill) => (bill.id === result.id ? result : bill)),
      );
      setNotice(`Bill marked ${status}. No payment was processed.`);
      onMoneyChanged();
    } catch (error) {
      setDetailError(confirmationFailure(error, 'bill status change', false));
    } finally {
      setBusy(null);
    }
  }

  async function more() {
    if (moreInFlight.current) return;
    moreInFlight.current = true;
    setLoadingMore(true);
    setLoadError('');
    try {
      const next = await getBills(token, household.id, 50, pageOffset.current);
      setBills((old) => appendRecords(old, next));
      pageOffset.current += next.length;
      setHasMore(next.length === 50);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Could not load more bills.',
      );
    } finally {
      moreInFlight.current = false;
      setLoadingMore(false);
    }
  }

  const displayed = preview ? displayBillPreview(preview) : null;
  return (
    <div className="content-inner space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl">Bills</h2>
          <p className="text-sm text-muted-foreground">
            Due dates and exact shares for {household.name}
          </p>
        </div>
        <Button
          variant={formOpen ? 'outline' : 'default'}
          disabled={busy === 'save'}
          onClick={() => {
            setFormOpen((old) => !old);
            setFormStep('details');
            setEditing(null);
            setTitle('');
            setBillType('electricity');
            setProvider('');
            setAmount('');
            setPeriodStart(monthStart());
            setPeriodEnd(localDate());
            setDueDate(localDate());
            setPayer(members[0]?.id ?? '');
            setRows([]);
            setPaymentStatus('unpaid');
            setParticipants(members.map((member) => member.id));
            invalidate();
            setNotice('');
          }}
        >
          {!formOpen && <Plus size={16} />}
          {formOpen ? (editing ? 'Cancel edit' : 'Discard draft') : 'Add bill'}
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
      {formOpen && (
        <Card ref={editFormRef} className="scroll-mt-6">
          <CardHeader>
            <CardTitle>
              {editing ? `Edit ${editing.title}` : 'Add a household bill'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {editing
                ? 'Preview revised shares before saving. Provider payment status is changed in the bill details.'
                : 'A bill tracks whether the provider was paid. Member repayments are recorded as transfers.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <ol
              aria-label="Bill form progress"
              className="flex flex-wrap gap-2 text-sm"
            >
              {(
                [
                  ['details', '1. Details'],
                  ['split', '2. Split and adjustments'],
                  ['review', '3. Review'],
                ] as const
              ).map(([step, label]) => (
                <li
                  key={step}
                  aria-current={formStep === step ? 'step' : undefined}
                  className={`rounded-full px-3 py-1.5 ${formStep === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                >
                  {label}
                </li>
              ))}
            </ol>
            {formError && (
              <p
                role="alert"
                className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {formError}
              </p>
            )}
            {formStep === 'details' && (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label
                    htmlFor="bill-title"
                    className="space-y-1 text-sm font-medium"
                  >
                    Bill title
                    <Input
                      id="bill-title"
                      value={title}
                      maxLength={160}
                      onChange={(event) => {
                        invalidate();
                        setTitle(event.target.value);
                      }}
                      placeholder="September electricity"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium">
                    Type
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3"
                      value={billType}
                      onChange={(event) => {
                        invalidate();
                        setBillType(
                          event.target.value as BillDraft['billType'],
                        );
                      }}
                    >
                      {types.map((type) => (
                        <option key={type} value={type}>
                          {type[0]?.toUpperCase()}
                          {type.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    htmlFor="bill-provider"
                    className="space-y-1 text-sm font-medium"
                  >
                    Provider
                    <Input
                      id="bill-provider"
                      value={provider}
                      maxLength={160}
                      onChange={(event) => {
                        invalidate();
                        setProvider(event.target.value);
                      }}
                      placeholder="Electricity provider"
                    />
                  </label>
                  <label
                    htmlFor="bill-amount"
                    className="space-y-1 text-sm font-medium"
                  >
                    Total ({household.defaultCurrency})
                    <Input
                      id="bill-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => {
                        invalidate();
                        setAmount(event.target.value);
                      }}
                      placeholder="2106.57"
                    />
                  </label>
                  <label
                    htmlFor="bill-period-start"
                    className="space-y-1 text-sm font-medium"
                  >
                    Period starts
                    <Input
                      id="bill-period-start"
                      type="date"
                      value={periodStart}
                      onChange={(event) => {
                        invalidate();
                        setPeriodStart(event.target.value);
                      }}
                    />
                  </label>
                  <label
                    htmlFor="bill-period-end"
                    className="space-y-1 text-sm font-medium"
                  >
                    Period ends
                    <Input
                      id="bill-period-end"
                      type="date"
                      value={periodEnd}
                      onChange={(event) => {
                        invalidate();
                        setPeriodEnd(event.target.value);
                      }}
                    />
                  </label>
                  <label
                    htmlFor="bill-due"
                    className="space-y-1 text-sm font-medium"
                  >
                    Due date
                    <Input
                      id="bill-due"
                      type="date"
                      value={dueDate}
                      onChange={(event) => {
                        invalidate();
                        setDueDate(event.target.value);
                      }}
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium">
                    Who pays the provider?
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3"
                      value={payer}
                      onChange={(event) => {
                        invalidate();
                        setPayer(event.target.value);
                      }}
                    >
                      <option value="">Choose a member</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm font-medium">
                    Provider payment status
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3"
                      value={paymentStatus}
                      disabled={editing !== null}
                      onChange={(event) => {
                        invalidate();
                        setPaymentStatus(
                          event.target.value as BillDraft['paymentStatus'],
                        );
                      }}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </label>
                </div>
                <Button
                  disabled={busy !== null}
                  onClick={() => {
                    try {
                      validateDetails();
                      setFormError('');
                      setFormStep('split');
                      setEditScrollRequest((request) => request + 1);
                    } catch (error) {
                      setFormError(
                        error instanceof Error
                          ? error.message
                          : 'Check the bill details.',
                      );
                    }
                  }}
                >
                  Continue to split
                </Button>
              </div>
            )}
            {formStep === 'split' && (
              <div className="space-y-5">
                <fieldset className="space-y-2">
                  <legend className="font-medium">
                    Who shares the base amount?
                  </legend>
                  <p className="text-sm text-muted-foreground">
                    The remaining bill amount is split equally among these
                    people.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {members.map((member) => (
                      <label
                        key={member.id}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={participants.includes(member.id)}
                          onChange={() =>
                            toggle(member.id, participants, setParticipants)
                          }
                        />
                        {member.displayName}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-medium">Charges and credits</h3>
                      <p className="text-sm text-muted-foreground">
                        Classify each extra amount. A charge increases selected
                        shares; a credit reduces them.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        invalidate();
                        setRows((old) => [
                          ...old,
                          {
                            id: crypto.randomUUID(),
                            label: '',
                            kind: '',
                            amount: '',
                            memberIds: [],
                          },
                        ]);
                      }}
                    >
                      <Plus size={16} /> Add adjustment
                    </Button>
                  </div>
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className="space-y-3 rounded-xl border p-4"
                    >
                      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                        <label
                          htmlFor={`adjustment-label-${row.id}`}
                          className="space-y-1 text-sm font-medium"
                        >
                          What is it?
                          <Input
                            id={`adjustment-label-${row.id}`}
                            value={row.label}
                            maxLength={160}
                            onChange={(event) =>
                              updateRow(row.id, { label: event.target.value })
                            }
                            placeholder="Ethan’s personal charge"
                          />
                        </label>
                        <label className="space-y-1 text-sm font-medium">
                          What does it mean?
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3"
                            value={row.kind}
                            onChange={(event) =>
                              updateRow(row.id, {
                                kind: event.target
                                  .value as AdjustmentRow['kind'],
                                memberIds: [],
                              })
                            }
                          >
                            <option value="">Choose a classification</option>
                            {kinds.map((kind) => (
                              <option key={kind.value} value={kind.value}>
                                {kind.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label
                          htmlFor={`adjustment-amount-${row.id}`}
                          className="space-y-1 text-sm font-medium"
                        >
                          Amount ({household.defaultCurrency})
                          <Input
                            id={`adjustment-amount-${row.id}`}
                            inputMode="decimal"
                            value={row.amount}
                            onChange={(event) =>
                              updateRow(row.id, { amount: event.target.value })
                            }
                          />
                        </label>
                        <Button
                          variant="ghost"
                          className="self-end"
                          aria-label={`Remove ${row.label || 'adjustment'}`}
                          onClick={() => {
                            invalidate();
                            setRows((old) =>
                              old.filter((item) => item.id !== row.id),
                            );
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                      {row.kind === 'excluded' && (
                        <p className="text-sm text-muted-foreground">
                          Enter the household-only bill total without this
                          amount, then remove this adjustment. Outside costs are
                          not assigned to housemates.
                        </p>
                      )}
                      {row.kind && row.kind !== 'excluded' && (
                        <fieldset>
                          <legend className="mb-2 text-sm font-medium">
                            {row.kind.startsWith('individual_')
                              ? 'Which one person?'
                              : 'Who shares this amount?'}
                          </legend>
                          <div className="flex flex-wrap gap-2">
                            {members.map((member) => (
                              <label
                                key={member.id}
                                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={row.memberIds.includes(member.id)}
                                  onChange={() =>
                                    updateRow(row.id, {
                                      memberIds: row.kind.startsWith(
                                        'individual_',
                                      )
                                        ? [member.id]
                                        : row.memberIds.includes(member.id)
                                          ? row.memberIds.filter(
                                              (id) => id !== member.id,
                                            )
                                          : [...row.memberIds, member.id],
                                    })
                                  }
                                />
                                {member.displayName}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => {
                      setFormStep('details');
                      setEditScrollRequest((request) => request + 1);
                    }}
                  >
                    Back to details
                  </Button>
                  <Button
                    disabled={busy !== null}
                    onClick={() => void showPreview()}
                  >
                    {busy === 'preview'
                      ? 'Calculating…'
                      : editing
                        ? 'Preview revised shares'
                        : 'Preview exact shares'}
                  </Button>
                </div>
              </div>
            )}
            {formStep === 'review' && preview && displayed && (
              <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
                <div>
                  <h3 className="font-heading text-lg">
                    Review before confirming
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Calculated by the API in {preview.currency} minor units.
                    {editing &&
                      ` Revision ${editing.revision} will be replaced on confirmation.`}
                  </p>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt>Bill total</dt>
                    <dd className="font-semibold">{displayed.total}</dd>
                  </div>
                  <div>
                    <dt>Charges set aside</dt>
                    <dd className="font-semibold">{displayed.charges}</dd>
                  </div>
                  <div>
                    <dt>Credits to apply</dt>
                    <dd className="font-semibold">−{displayed.credits}</dd>
                  </div>
                  <div>
                    <dt>Base shared remainder</dt>
                    <dd className="font-semibold">
                      {displayed.base} across{' '}
                      {preview.sharedParticipantIds.length} member
                      {preview.sharedParticipantIds.length === 1 ? '' : 's'}
                    </dd>
                  </div>
                </dl>
                {preview.creditMinor > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Credits are added to the base pool first, then deducted from
                    their recipients, so final shares still equal the bill
                    total.
                  </p>
                )}
                {preview.adjustmentBreakdown.length > 0 && (
                  <div>
                    <h4 className="font-medium">Adjustment allocation</h4>
                    {preview.adjustmentBreakdown.map((item) => (
                      <p
                        key={`${item.label}-${item.kind}-${item.amountMinor}-${item.memberIds.join(',')}`}
                        className="text-sm text-muted-foreground"
                      >
                        {item.label}: {item.kind.endsWith('credit') ? '−' : '+'}
                        {money(item.amountMinor, preview.currency)} ·{' '}
                        {item.shares
                          .map(
                            (share) =>
                              `${share.displayName} ${money(share.amountMinor, preview.currency)}`,
                          )
                          .join(', ')}
                      </p>
                    ))}
                  </div>
                )}
                <div>
                  <h4 className="mb-2 font-medium">Final shares</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2">Member</th>
                          <th className="py-2 text-right">Base</th>
                          <th className="py-2 text-right">Adjustments</th>
                          <th className="py-2 text-right">Final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayed.shares.map((share) => (
                          <tr key={share.memberId} className="border-b">
                            <td className="py-2">{share.displayName}</td>
                            <td className="py-2 text-right">{share.base}</td>
                            <td className="py-2 text-right">
                              {share.adjustment}
                            </td>
                            <td className="py-2 text-right font-semibold">
                              {share.final}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th className="py-2">Total</th>
                          <td />
                          <td />
                          <th className="py-2 text-right">
                            {displayed.allocatedTotal}
                          </th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => {
                      setFormStep('split');
                      setEditScrollRequest((request) => request + 1);
                    }}
                  >
                    Back to split
                  </Button>
                  <Button
                    disabled={busy !== null}
                    onClick={() => void confirm()}
                  >
                    {busy === 'save'
                      ? 'Saving…'
                      : editing
                        ? 'Save revised bill'
                        : 'Confirm bill'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
        <p className="text-sm text-muted-foreground">Loading bills…</p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
          <Card className={selected ? 'max-lg:hidden' : undefined}>
            <CardHeader>
              <CardTitle>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left"
                  aria-expanded={historyExpanded}
                  aria-controls={historyPanelId}
                  onClick={() => setHistoryExpanded((open) => !open)}
                >
                  Bill history
                  <ChevronDown
                    size={20}
                    aria-hidden="true"
                    className={historyExpanded ? 'rotate-180' : undefined}
                  />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent
              id={historyPanelId}
              hidden={!historyExpanded}
              className="space-y-2"
            >
              {bills.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No bills yet. Add your first household bill.
                </p>
              )}
              {bills.map((bill) => (
                <button
                  type="button"
                  key={bill.id}
                  onClick={() => void chooseBill(bill.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left hover:bg-muted/40"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ReceiptText size={18} />
                    <span className="min-w-0">
                      <strong className="block truncate">{bill.title}</strong>
                      {bill.voidedAt && (
                        <small className="text-destructive">
                          Voided · excluded from totals
                        </small>
                      )}
                      <small className="text-muted-foreground">
                        {bill.provider} · Due {date(bill.dueDate)}
                      </small>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <strong className="block">
                      {money(bill.amountMinor, bill.currency)}
                    </strong>
                    <small className="capitalize text-muted-foreground">
                      {bill.voidedAt ? 'Voided' : bill.paymentStatus}
                    </small>
                  </span>
                </button>
              ))}
              {hasMore && (
                <Button
                  variant="outline"
                  disabled={loadingMore}
                  onClick={() => void more()}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              )}
            </CardContent>
          </Card>
          <Card
            id="bill-detail"
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
                  Back to bills
                </Button>
              )}
              <CardTitle>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left"
                  aria-expanded={detailsExpanded}
                  aria-controls={detailsPanelId}
                  onClick={() => setDetailsExpanded((open) => !open)}
                >
                  Bill detail
                  <ChevronDown
                    size={20}
                    aria-hidden="true"
                    className={detailsExpanded ? 'rotate-180' : undefined}
                  />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent
              id={detailsPanelId}
              hidden={!detailsExpanded}
              className="space-y-4"
            >
              {detailError && (
                <p role="alert" className="text-sm text-destructive">
                  {detailError}
                </p>
              )}
              {!selected && (
                <p className="text-sm text-muted-foreground">
                  Select a bill to see its full breakdown.
                </p>
              )}
              {selected && (
                <>
                  <div>
                    <h3 className="font-heading text-lg">{selected.title}</h3>
                    <strong className="text-xl text-primary">
                      {money(selected.amountMinor, selected.currency)}
                    </strong>
                    {selected.voidedAt && (
                      <p className="mt-2 rounded-lg bg-muted p-2 text-sm text-muted-foreground">
                        Voided by {selected.voidedByDisplayName ?? 'a member'}{' '}
                        on {date(selected.voidedAt)}. Excluded from balances and
                        pending bills.
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
                          Edit bill
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
                        Remove mistaken bill
                      </Button>
                    )}
                  </div>
                  {voidOpen && selected.canVoid && (
                    <VoidConfirmation
                      key={`${selected.id}-${selected.revision}`}
                      record={selected}
                      kind="bill"
                      pendingBill={selected.paymentStatus === 'unpaid'}
                      onCancel={() => setVoidOpen(false)}
                      previewAction={(reason) =>
                        previewBillVoid(
                          token,
                          household.id,
                          selected.id,
                          selected.revision,
                          reason,
                        )
                      }
                      confirmAction={(reason, previewId, key) =>
                        voidBill(
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
                        setBills((old) =>
                          old.map((item) =>
                            item.id === result.id ? result : item,
                          ),
                        );
                        setSelected(result);
                        onMoneyChanged();
                        setVoidOpen(false);
                        setNotice(
                          'Mistaken bill removed from active totals and kept in history.',
                        );
                      }}
                    />
                  )}
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Provider</dt>
                      <dd>{selected.provider}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="capitalize">{selected.billType}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Period</dt>
                      <dd>
                        {date(selected.periodStart)} –{' '}
                        {date(selected.periodEnd)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Due</dt>
                      <dd>{date(selected.dueDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Payer</dt>
                      <dd>{selected.payerDisplayName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Provider status</dt>
                      <dd className="capitalize">{selected.paymentStatus}</dd>
                    </div>
                  </dl>
                  {!selected.voidedAt && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">Mark provider:</span>
                      <Button
                        size="sm"
                        variant={
                          selected.paymentStatus === 'unpaid'
                            ? 'default'
                            : 'outline'
                        }
                        disabled={busy === 'status'}
                        onClick={() => void updateStatus('unpaid')}
                      >
                        Unpaid
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          selected.paymentStatus === 'paid'
                            ? 'default'
                            : 'outline'
                        }
                        disabled={busy === 'status'}
                        onClick={() => void updateStatus('paid')}
                      >
                        Paid
                      </Button>
                    </div>
                  )}
                  {!selected.voidedAt && (
                    <p className="text-xs text-muted-foreground">
                      This records a status only. HouseMate does not process a
                      payment.
                    </p>
                  )}
                  <div className="border-t pt-3 text-sm">
                    <p>
                      Base shared:{' '}
                      <strong>
                        {money(selected.baseMinor, selected.currency)}
                      </strong>
                    </p>
                    <p>
                      Charges:{' '}
                      <strong>
                        {money(selected.chargeMinor, selected.currency)}
                      </strong>{' '}
                      · Credits:{' '}
                      <strong>
                        {money(selected.creditMinor, selected.currency)}
                      </strong>
                    </p>
                  </div>
                  {selected.adjustmentBreakdown.map((item) => (
                    <p
                      key={`${item.label}-${item.kind}-${item.amountMinor}-${item.memberIds.join(',')}`}
                      className="text-sm"
                    >
                      {item.label}: {item.kind.endsWith('credit') ? '−' : '+'}
                      {money(item.amountMinor, selected.currency)} ·{' '}
                      {item.shares.map((share) => share.displayName).join(', ')}
                    </p>
                  ))}
                  <div>
                    <h4 className="mb-2 font-medium">Final shares</h4>
                    {selected.shares.map((share) => (
                      <div
                        key={share.memberId}
                        className="flex justify-between gap-2 border-t py-2 text-sm"
                      >
                        <span>{share.displayName}</span>
                        <strong>
                          {money(share.amountMinor, selected.currency)}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <FinancialHistory
                    key={`${selected.id}-${selected.revision}`}
                    token={token}
                    householdId={household.id}
                    recordId={selected.id}
                    kind="bill"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
