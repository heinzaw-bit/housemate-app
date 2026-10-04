'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ApiRequestError,
  type AssistantActionDraft,
  type BillDraft,
  type BillPreview,
  type ChoreDraft,
  createBill,
  createChore,
  createExpense,
  createShoppingItem,
  type ExpenseDraft,
  type ExpensePreview,
  previewBill,
  previewExpense,
  type ShoppingDraft,
} from '@/lib/api';
import { confirmationFailure } from '@/lib/financial-confirmation';
import type { AssistantDraftReviewProps } from './assistant-draft-review';
import { SavedDraftNotice, useSavedDraft } from './saved-draft';

type RecordDraft = Exclude<
  AssistantActionDraft,
  { kind: 'meal' | 'announcement' }
>;
type Payload =
  | { kind: 'shopping'; fields: ShoppingDraft }
  | { kind: 'chore'; fields: ChoreDraft }
  | { kind: 'expense'; fields: ExpenseDraft }
  | { kind: 'bill'; fields: BillDraft };
type Adjustment = {
  id: string;
  label: string;
  kind: BillDraft['adjustments'][number]['kind'];
  amount: string;
  members: string[];
};
const names = {
  shopping: 'shopping item',
  chore: 'chore',
  expense: 'expense',
  bill: 'bill',
};

// Decimal strings become exact integer minor units; no floating-point allocation.
export function draftMinor(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor <= 999999999999 ? minor : null;
}
function decimal(minor: number | null) {
  return minor === null || minor === 0 ? '' : (minor / 100).toFixed(2);
}

export function AssistantRecordDraft({
  draft,
  household,
  token,
  onCancel,
  onPublished,
  onAccessLost,
  resumeSavedFields = false,
}: Omit<AssistantDraftReviewProps, 'draft'> & { draft: RecordDraft }) {
  const [fields, setFields] = useState(draft.fields);
  const [amount, setAmount] = useState(
    decimal(
      'amountMinor' in draft.fields
        ? draft.fields.amountMinor
        : 'estimatedPriceMinor' in draft.fields
          ? draft.fields.estimatedPriceMinor
          : null,
    ),
  );
  const [quantity, setQuantity] = useState(
    draft.kind === 'shopping' && draft.fields.quantity !== null
      ? String(draft.fields.quantity)
      : '',
  );
  const [participants, setParticipants] = useState(
    draft.kind === 'expense'
      ? draft.fields.split.shares.map((share) => share.memberId)
      : draft.kind === 'bill'
        ? draft.fields.sharedParticipantIds
        : [],
  );
  const [method, setMethod] = useState<ExpenseDraft['split']['method']>(
    draft.kind === 'expense' ? draft.fields.split.method : 'equal',
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [adjustments, setAdjustments] = useState<Adjustment[]>(
    draft.kind === 'bill'
      ? draft.fields.adjustments.map((row) => ({
          id: crypto.randomUUID(),
          label: row.label,
          kind: row.kind,
          amount: decimal(row.amountMinor),
          members: row.memberIds,
        }))
      : [],
  );
  const [review, setReview] = useState<{
    payload: Payload;
    preview?: ExpensePreview | BillPreview;
  } | null>(null);
  const [attempt, setAttempt] = useState<{
    payload: Payload;
    key: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const savedDraft = useSavedDraft({
    kind: `assistant-editor-${draft.kind}`,
    enabled: true,
    autoResume: resumeSavedFields,
    value: {
      fields,
      amount,
      quantity,
      participants,
      method,
      values,
      adjustments,
    },
    restore(snapshot) {
      setFields(snapshot.fields);
      setAmount(snapshot.amount);
      setQuantity(snapshot.quantity);
      setParticipants(snapshot.participants);
      setMethod(snapshot.method);
      setValues(snapshot.values);
      setAdjustments(snapshot.adjustments);
      setReview(null);
    },
  });
  const cancelSaved = () => {
    savedDraft.clear();
    onCancel();
  };
  const financial = draft.kind === 'expense' || draft.kind === 'bill';
  const field = fields as ShoppingDraft & ChoreDraft & ExpenseDraft & BillDraft;
  const update = (key: string, value: string | null) =>
    setFields((old) => ({ ...old, [key]: value }));
  const memberName = (memberId: string) =>
    draft.members.find((member) => member.id === memberId)?.displayName ??
    'Unknown member';
  const money = (minor: number) =>
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: household.defaultCurrency,
    }).format(minor / 100);
  useEffect(() => {
    active.current = true;
    heading.current?.focus({ preventScroll: true });
    return () => {
      active.current = false;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each review/edit transition restores focus to the replaced heading.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [review]);

  const unresolved = [
    ...(!field.title.trim() ? ['Enter a title.'] : []),
    ...(draft.kind === 'chore' && !field.assigneeMemberId
      ? ['Choose an assignee.']
      : []),
    ...(draft.kind === 'chore' && !field.dueAtLocal
      ? ['Choose an exact due date and time.']
      : []),
    ...(financial && !field.payerMemberId ? ['Choose the payer.'] : []),
    ...(financial && !participants.length ? ['Choose the participants.'] : []),
    ...(financial && !(draftMinor(amount) ?? 0)
      ? [`Enter a positive total in ${household.defaultCurrency}.`]
      : []),
    ...(draft.kind === 'expense' && !field.spentOn
      ? ['Enter the expense date.']
      : []),
    ...(draft.kind === 'bill' &&
    (!field.provider.trim() ||
      !field.periodStart ||
      !field.periodEnd ||
      !field.dueDate)
      ? ['Complete the provider, billing period and due date.']
      : []),
  ];
  function fail(cause: unknown, confirming = false) {
    if (
      cause instanceof ApiRequestError &&
      [401, 403, 404].includes(cause.status)
    ) {
      savedDraft.clear();
      onAccessLost(cause.message);
      return;
    }
    setError(
      confirming
        ? confirmationFailure(cause, 'save')
        : cause instanceof Error
          ? cause.message
          : 'Could not prepare the review.',
    );
  }
  function payload(): Payload {
    if (unresolved.length) throw new Error(unresolved.join(' '));
    const title = field.title.trim();
    const selected = [...participants].sort();
    if (draft.kind === 'shopping') {
      if (
        quantity &&
        (!/^\d+(?:\.\d{1,3})?$/.test(quantity) ||
          Number(quantity) <= 0 ||
          Number(quantity) > 999999999)
      )
        throw new Error(
          'Quantity must be positive, with at most three decimals.',
        );
      const price = amount ? draftMinor(amount) : null;
      if (amount && price === null)
        throw new Error('Enter an estimated price with at most two decimals.');
      return {
        kind: 'shopping',
        fields: {
          title,
          quantity: quantity ? Number(quantity) : null,
          unit: field.unit?.trim() || null,
          note: field.note?.trim() || null,
          priority: field.priority,
          assignedBuyerMemberId: field.assignedBuyerMemberId,
          estimatedPriceMinor: price,
        },
      };
    }
    if (draft.kind === 'chore')
      return {
        kind: 'chore',
        fields: {
          title,
          note: field.note?.trim() || null,
          dueAtLocal: field.dueAtLocal,
          assigneeMemberId: field.assigneeMemberId,
        },
      };
    const amountMinor = draftMinor(amount);
    if (!amountMinor)
      throw new Error('Enter a positive amount with at most two decimals.');
    if (draft.kind === 'expense') {
      const shares = selected.map((memberId) => {
        if (method === 'equal') return { memberId };
        const raw = values[memberId] ?? '';
        const value =
          method === 'exact' || method === 'percentage'
            ? draftMinor(raw)
            : /^\d+$/.test(raw)
              ? Number(raw)
              : null;
        if (value === null || !Number.isSafeInteger(value) || value < 0)
          throw new Error(
            `Enter a valid ${method} share for ${memberName(memberId)}.`,
          );
        return { memberId, value };
      });
      return {
        kind: 'expense',
        fields: {
          title,
          amountMinor,
          currency: household.defaultCurrency,
          spentOn: field.spentOn,
          payerMemberId: field.payerMemberId,
          split: { method, shares },
        },
      };
    }
    const rows = adjustments.map((row) => {
      const minor = draftMinor(row.amount);
      if (!row.label.trim() || !minor || !row.members.length)
        throw new Error(
          'Every adjustment needs a label, positive amount and selected members.',
        );
      if (row.kind.startsWith('individual') && row.members.length !== 1)
        throw new Error('Individual adjustments need exactly one member.');
      return {
        label: row.label.trim(),
        kind: row.kind,
        amountMinor: minor,
        memberIds: [...row.members].sort(),
      };
    });
    return {
      kind: 'bill',
      fields: {
        title,
        amountMinor,
        currency: household.defaultCurrency,
        billType: field.billType,
        provider: field.provider.trim(),
        periodStart: field.periodStart,
        periodEnd: field.periodEnd,
        dueDate: field.dueDate,
        payerMemberId: field.payerMemberId,
        paymentStatus: field.paymentStatus,
        sharedParticipantIds: selected,
        adjustments: rows,
      },
    };
  }
  async function prepareReview() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const next = payload();
      const preview =
        next.kind === 'expense'
          ? await previewExpense(token, household.id, next.fields)
          : next.kind === 'bill'
            ? await previewBill(token, household.id, next.fields)
            : undefined;
      if (active.current) setReview({ payload: next, preview });
    } catch (cause) {
      if (active.current) fail(cause);
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function confirm() {
    if (!review || inFlight.current) return;
    const next = attempt ?? {
      payload: review.payload,
      key: crypto.randomUUID(),
    };
    setAttempt(next);
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const { payload: input } = next;
      const key = savedDraft.confirmationKey(input.fields, next.key);
      const saved =
        input.kind === 'shopping'
          ? await createShoppingItem(token, household.id, input.fields, key)
          : input.kind === 'chore'
            ? await createChore(token, household.id, input.fields, key)
            : input.kind === 'expense'
              ? await createExpense(token, household.id, input.fields, key)
              : await createBill(token, household.id, input.fields, key);
      if (active.current) {
        savedDraft.clear();
        onPublished(input.kind, saved.id, input.fields.title);
      }
    } catch (cause) {
      savedDraft.reject(cause);
      if (!active.current) return;
      // Only a definitive first rejection permits a changed confirmation. A later
      // rejection cannot disprove a prior request whose response was interrupted.
      if (
        !attempt &&
        cause instanceof ApiRequestError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 409
      ) {
        setAttempt(null);
        setReview(null);
      }
      fail(cause, true);
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  function textField(
    label: string,
    key: string,
    options: { type?: string; required?: boolean; max?: number } = {},
  ) {
    return (
      <label
        className="block min-w-0 space-y-1 text-sm"
        htmlFor={`${id}-${key}`}
      >
        <span>{label}</span>
        <Input
          id={`${id}-${key}`}
          type={options.type ?? 'text'}
          required={options.required}
          maxLength={options.max}
          value={(field[key as keyof typeof field] as string) ?? ''}
          onChange={(event) => update(key, event.target.value)}
        />
      </label>
    );
  }
  function memberSelect(
    label: string,
    key: 'assigneeMemberId' | 'assignedBuyerMemberId' | 'payerMemberId',
    optional = false,
  ) {
    return (
      <label className="block space-y-1 text-sm" htmlFor={`${id}-${key}`}>
        <span>{label}</span>
        <select
          className="min-h-11 w-full rounded-md border bg-background p-2"
          id={`${id}-${key}`}
          value={field[key] ?? ''}
          required={!optional}
          onChange={(event) =>
            update(key, event.target.value || (optional ? null : ''))
          }
        >
          <option value="">
            {optional ? 'Unassigned' : 'Choose a member'}
          </option>
          {draft.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function memberChecks(
    label: string,
    selected: string[],
    change: (next: string[]) => void,
  ) {
    return (
      <fieldset className="space-y-1 rounded-xl border p-3">
        <legend className="text-sm">{label}</legend>
        {draft.members.map((member) => (
          <label
            key={member.id}
            className="flex min-h-11 items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(member.id)}
              onChange={(event) =>
                change(
                  event.target.checked
                    ? [...selected, member.id]
                    : selected.filter((value) => value !== member.id),
                )
              }
            />
            {member.displayName}
          </label>
        ))}
      </fieldset>
    );
  }
  const reviewed = review?.payload.fields as typeof field | undefined;
  return (
    <Card
      className="mt-5 [&_button]:min-h-11 [&_input]:min-h-11"
      aria-label="Assistant action draft"
    >
      <CardHeader>
        <CardTitle ref={heading} tabIndex={-1}>
          {review ? 'Review before saving' : `Draft ${names[draft.kind]}`}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {household.name} · {draft.timezone} ·{' '}
          {financial ? household.defaultCurrency : 'Unsaved until you confirm'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <SavedDraftNotice draft={savedDraft} disabled={busy} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!review && (
          <>
            <details className="text-sm" open>
              <summary className="min-h-11 cursor-pointer">
                Draft details to check
              </summary>
              <ul className="space-y-1 text-muted-foreground">
                {[...new Set([...draft.notes, ...draft.unresolvedFields])].map(
                  (note) => (
                    <li key={note}>{note}</li>
                  ),
                )}
              </ul>
            </details>
            {unresolved.length > 0 && (
              <div
                className="rounded-xl bg-secondary p-3 text-sm"
                role="status"
              >
                <strong>Still needed</strong>
                <ul>
                  {unresolved.map((missing) => (
                    <li key={missing}>{missing}</li>
                  ))}
                </ul>
              </div>
            )}
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void prepareReview();
              }}
            >
              <fieldset disabled={busy} className="min-w-0 space-y-4">
                {textField('Title', 'title', { required: true, max: 160 })}
                {(draft.kind === 'shopping' || draft.kind === 'chore') &&
                  textField('Optional note', 'note', { max: 500 })}
                {draft.kind === 'shopping' && (
                  <>
                    <label
                      className="block space-y-1 text-sm"
                      htmlFor={`${id}-quantity`}
                    >
                      <span>Optional quantity</span>
                      <Input
                        id={`${id}-quantity`}
                        inputMode="decimal"
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                      />
                    </label>
                    {textField('Optional unit', 'unit', { max: 40 })}
                    {memberSelect('Buyer', 'assignedBuyerMemberId', true)}
                    <label
                      className="block space-y-1 text-sm"
                      htmlFor={`${id}-priority`}
                    >
                      <span>Priority</span>
                      <select
                        className="min-h-11 w-full rounded-md border bg-background p-2"
                        id={`${id}-priority`}
                        value={field.priority}
                        onChange={(event) =>
                          update('priority', event.target.value)
                        }
                      >
                        {['low', 'normal', 'high'].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {draft.kind === 'chore' && (
                  <>
                    {memberSelect('Assignee', 'assigneeMemberId')}
                    {textField(
                      `Due date and time (${draft.timezone})`,
                      'dueAtLocal',
                      { required: true, type: 'datetime-local' },
                    )}
                  </>
                )}
                {draft.kind !== 'chore' && (
                  <label
                    className="block space-y-1 text-sm"
                    htmlFor={`${id}-amount`}
                  >
                    <span>
                      {financial ? 'Total' : 'Optional estimated price'} (
                      {household.defaultCurrency})
                    </span>
                    <Input
                      id={`${id}-amount`}
                      inputMode="decimal"
                      required={financial}
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </label>
                )}
                {financial && memberSelect('Payer', 'payerMemberId')}
                {draft.kind === 'expense' && (
                  <>
                    {textField('Expense date', 'spentOn', {
                      required: true,
                      type: 'date',
                    })}
                    <label
                      className="block space-y-1 text-sm"
                      htmlFor={`${id}-method`}
                    >
                      <span>Split method</span>
                      <select
                        className="min-h-11 w-full rounded-md border bg-background p-2"
                        id={`${id}-method`}
                        value={method}
                        onChange={(event) => {
                          setMethod(event.target.value as typeof method);
                          setValues({});
                        }}
                      >
                        {['equal', 'exact', 'percentage', 'ratio'].map(
                          (value) => (
                            <option key={value}>{value}</option>
                          ),
                        )}
                      </select>
                    </label>
                  </>
                )}
                {draft.kind === 'bill' && (
                  <>
                    {textField('Provider', 'provider', {
                      required: true,
                      max: 160,
                    })}
                    <label
                      className="block space-y-1 text-sm"
                      htmlFor={`${id}-billType`}
                    >
                      <span>Bill type</span>
                      <select
                        className="min-h-11 w-full rounded-md border bg-background p-2"
                        id={`${id}-billType`}
                        value={field.billType}
                        onChange={(event) =>
                          update('billType', event.target.value)
                        }
                      >
                        {[
                          'electricity',
                          'water',
                          'internet',
                          'rent',
                          'other',
                        ].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {textField('Period start', 'periodStart', {
                        required: true,
                        type: 'date',
                      })}
                      {textField('Period end', 'periodEnd', {
                        required: true,
                        type: 'date',
                      })}
                    </div>
                    {textField('Due date', 'dueDate', {
                      required: true,
                      type: 'date',
                    })}
                    <label
                      className="block space-y-1 text-sm"
                      htmlFor={`${id}-paymentStatus`}
                    >
                      <span>Provider payment status</span>
                      <select
                        className="min-h-11 w-full rounded-md border bg-background p-2"
                        id={`${id}-paymentStatus`}
                        value={field.paymentStatus}
                        onChange={(event) =>
                          update('paymentStatus', event.target.value)
                        }
                      >
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                      </select>
                    </label>
                  </>
                )}
                {financial &&
                  memberChecks(
                    draft.kind === 'bill'
                      ? 'Shared base participants'
                      : 'Participants',
                    participants,
                    setParticipants,
                  )}
                {draft.kind === 'expense' &&
                  method !== 'equal' &&
                  participants.map((memberId) => (
                    <label
                      key={memberId}
                      className="block space-y-1 text-sm"
                      htmlFor={`${id}-${memberId}-share`}
                    >
                      <span>
                        {memberName(memberId)} share (
                        {method === 'exact'
                          ? household.defaultCurrency
                          : method === 'percentage'
                            ? '%'
                            : 'ratio units'}
                        )
                      </span>
                      <Input
                        id={`${id}-${memberId}-share`}
                        inputMode="decimal"
                        required
                        value={values[memberId] ?? ''}
                        onChange={(event) =>
                          setValues({
                            ...values,
                            [memberId]: event.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                {draft.kind === 'bill' && (
                  <section className="space-y-3" aria-label="Bill adjustments">
                    <h3 className="text-sm font-semibold">
                      Individual and shared charges or credits
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Enter every adjustment explicitly. The API calculates the
                      shared remainder and rounding.
                    </p>
                    {adjustments.map((row, index) => (
                      <fieldset
                        key={row.id}
                        className="min-w-0 space-y-3 rounded-xl border p-3"
                      >
                        <legend>Adjustment {index + 1}</legend>
                        <label
                          className="block space-y-1 text-sm"
                          htmlFor={`${id}-${row.id}-label`}
                        >
                          <span>Adjustment label</span>
                          <Input
                            id={`${id}-${row.id}-label`}
                            required
                            maxLength={160}
                            value={row.label}
                            onChange={(event) =>
                              setAdjustments((old) =>
                                old.map((item) =>
                                  item.id === row.id
                                    ? { ...item, label: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label
                          className="block space-y-1 text-sm"
                          htmlFor={`${id}-${row.id}-kind`}
                        >
                          <span>Adjustment kind</span>
                          <select
                            className="min-h-11 w-full rounded-md border bg-background p-2"
                            id={`${id}-${row.id}-kind`}
                            value={row.kind}
                            onChange={(event) =>
                              setAdjustments((old) =>
                                old.map((item) =>
                                  item.id === row.id
                                    ? {
                                        ...item,
                                        kind: event.target
                                          .value as Adjustment['kind'],
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            {[
                              'individual_charge',
                              'shared_charge',
                              'individual_credit',
                              'shared_credit',
                            ].map((value) => (
                              <option key={value} value={value}>
                                {value.replaceAll('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label
                          className="block space-y-1 text-sm"
                          htmlFor={`${id}-${row.id}-amount`}
                        >
                          <span>
                            Adjustment amount ({household.defaultCurrency})
                          </span>
                          <Input
                            id={`${id}-${row.id}-amount`}
                            required
                            inputMode="decimal"
                            value={row.amount}
                            onChange={(event) =>
                              setAdjustments((old) =>
                                old.map((item) =>
                                  item.id === row.id
                                    ? { ...item, amount: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        {memberChecks(
                          'Adjustment members',
                          row.members,
                          (members) =>
                            setAdjustments((old) =>
                              old.map((item) =>
                                item.id === row.id
                                  ? { ...item, members }
                                  : item,
                              ),
                            ),
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setAdjustments((old) =>
                              old.filter((item) => item.id !== row.id),
                            )
                          }
                        >
                          Remove adjustment {index + 1}
                        </Button>
                      </fieldset>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={adjustments.length >= 50}
                      onClick={() =>
                        setAdjustments((old) => [
                          ...old,
                          {
                            id: crypto.randomUUID(),
                            label: '',
                            kind: 'individual_charge',
                            amount: '',
                            members: [],
                          },
                        ])
                      }
                    >
                      Add adjustment
                    </Button>
                  </section>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">
                    {busy
                      ? 'Preparing review…'
                      : financial
                        ? 'Calculate and review'
                        : 'Review draft'}
                  </Button>
                  <Button type="button" variant="outline" onClick={cancelSaved}>
                    Cancel draft
                  </Button>
                </div>
              </fieldset>
            </form>
          </>
        )}
        {review && reviewed && (
          <>
            <div className="space-y-2 rounded-xl border p-4 text-sm break-words">
              <strong>{reviewed.title}</strong>
              {draft.kind === 'shopping' && (
                <>
                  <p>
                    Quantity: {reviewed.quantity ?? 'Not specified'}{' '}
                    {reviewed.unit ?? ''}
                  </p>
                  <p>
                    Buyer:{' '}
                    {reviewed.assignedBuyerMemberId
                      ? memberName(reviewed.assignedBuyerMemberId)
                      : 'Unassigned'}{' '}
                    · Priority: {reviewed.priority}
                  </p>
                  <p>
                    Estimated price:{' '}
                    {reviewed.estimatedPriceMinor === null
                      ? 'None'
                      : money(reviewed.estimatedPriceMinor)}
                  </p>
                </>
              )}
              {draft.kind === 'chore' && (
                <>
                  <p>Assignee: {memberName(reviewed.assigneeMemberId)}</p>
                  <p>
                    Due: {reviewed.dueAtLocal.replace('T', ' ')} ·{' '}
                    {draft.timezone}
                  </p>
                </>
              )}
              {!financial && reviewed.note && (
                <p className="whitespace-pre-wrap">Note: {reviewed.note}</p>
              )}
              {review.preview && (
                <>
                  <p>
                    Total: {money(review.preview.amountMinor)} · Payer:{' '}
                    {memberName(reviewed.payerMemberId)}
                  </p>
                  {draft.kind === 'expense' ? (
                    <p>
                      Expense date: {reviewed.spentOn} · Split:{' '}
                      {reviewed.split.method}
                    </p>
                  ) : (
                    <>
                      <p>
                        Provider: {reviewed.provider} · Type:{' '}
                        {reviewed.billType} · Status: {reviewed.paymentStatus}
                      </p>
                      <p>
                        Period: {reviewed.periodStart} to {reviewed.periodEnd} ·
                        Due: {reviewed.dueDate}
                      </p>
                      <p>
                        Shared base participants:{' '}
                        {reviewed.sharedParticipantIds
                          .map(memberName)
                          .join(', ')}
                      </p>
                    </>
                  )}
                  <h3 className="font-semibold">API-calculated shares</h3>
                  <ul>
                    {review.preview.shares.map((share) => (
                      <li key={share.memberId}>
                        {share.displayName}: {money(share.amountMinor)}
                        {'baseMinor' in share
                          ? ` (base ${money(share.baseMinor)}, adjustments ${money(share.adjustmentMinor)})`
                          : ''}
                      </li>
                    ))}
                  </ul>
                  {'adjustmentBreakdown' in review.preview && (
                    <>
                      <p>
                        Base: {money(review.preview.baseMinor)} · Charges:{' '}
                        {money(review.preview.chargeMinor)} · Credits:{' '}
                        {money(review.preview.creditMinor)}
                      </p>
                      <ul>
                        {review.preview.adjustmentBreakdown.map(
                          (row, index) => (
                            <li key={adjustments[index]?.id ?? row.label}>
                              {row.label} · {row.kind.replaceAll('_', ' ')} ·{' '}
                              {money(row.amountMinor)} ·{' '}
                              {row.memberIds.map(memberName).join(', ')}
                              <ul>
                                {row.shares.map((share) => (
                                  <li key={share.memberId}>
                                    {memberName(share.memberId)}:{' '}
                                    {money(share.amountMinor)}
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ),
                        )}
                      </ul>
                    </>
                  )}
                  <p>This saves a record. No payment is processed.</p>
                </>
              )}
              <p>
                Saved actions use the normal household permissions and
                notification preferences.
              </p>
            </div>
            {attempt && error && (
              <p className="text-sm text-muted-foreground">
                The original confirmation is locked. Retry with the same details
                to check its result; do not create another copy.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void confirm()}>
                {busy
                  ? 'Saving…'
                  : attempt
                    ? 'Retry confirmation'
                    : 'Confirm and save'}
              </Button>
              <Button
                variant="outline"
                disabled={busy || !!attempt}
                onClick={() => {
                  setReview(null);
                  setError('');
                }}
              >
                Edit draft
              </Button>
              <Button
                variant="ghost"
                disabled={busy || !!attempt}
                onClick={cancelSaved}
              >
                Cancel draft
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
