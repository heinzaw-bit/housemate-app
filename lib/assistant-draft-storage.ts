import type { AssistantActionDraft } from './api';
import { safeDraftValue } from './saved-drafts';

type SavedAction = Pick<
  AssistantActionDraft,
  'kind' | 'fields' | 'recipientIds'
>;
export function readAssistantDraft(value: string): SavedAction | null {
  const action = JSON.parse(value);
  if (action === null) return null;
  const strings = (v: unknown) =>
    Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (
    !safeDraftValue(action) ||
    !action ||
    typeof action !== 'object' ||
    !strings(action.recipientIds) ||
    !action.fields ||
    typeof action.fields !== 'object'
  )
    throw Error('Invalid saved assistant draft.');
  const fields = action.fields;
  const text = (keys: string[]) =>
    keys.every((key) => typeof fields[key] === 'string');
  const member = (v: unknown) => v === null || typeof v === 'string';
  const amount = (v: unknown) =>
    v === null || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
  const valid =
    action.kind === 'meal'
      ? text(['question', 'startsAtLocal', 'responseDeadlineLocal']) &&
        ['breakfast', 'lunch', 'dinner', 'other'].includes(fields.mealType)
      : action.kind === 'announcement'
        ? text(['title', 'body']) &&
          ['normal', 'important', 'urgent'].includes(fields.priority) &&
          typeof fields.requiresAcknowledgement === 'boolean' &&
          member(fields.expiresAtLocal)
        : action.kind === 'shopping'
          ? text(['title']) &&
            member(fields.unit) &&
            member(fields.note) &&
            member(fields.assignedBuyerMemberId) &&
            (fields.quantity === null ||
              (typeof fields.quantity === 'number' && fields.quantity > 0)) &&
            amount(fields.estimatedPriceMinor) &&
            ['low', 'normal', 'high'].includes(fields.priority)
          : action.kind === 'chore'
            ? text(['title', 'dueAtLocal']) &&
              member(fields.note) &&
              member(fields.assigneeMemberId)
            : action.kind === 'expense'
              ? text(['title', 'currency', 'spentOn', 'payerMemberId']) &&
                amount(fields.amountMinor) &&
                fields.split &&
                ['equal', 'exact', 'percentage', 'ratio'].includes(
                  fields.split.method,
                ) &&
                Array.isArray(fields.split.shares) &&
                fields.split.shares.every(
                  (share: { memberId: unknown; value?: unknown }) =>
                    share &&
                    typeof share.memberId === 'string' &&
                    (share.value === undefined || amount(share.value)),
                )
              : action.kind === 'bill'
                ? text([
                    'title',
                    'currency',
                    'provider',
                    'periodStart',
                    'periodEnd',
                    'dueDate',
                    'payerMemberId',
                  ]) &&
                  amount(fields.amountMinor) &&
                  [
                    'electricity',
                    'water',
                    'internet',
                    'rent',
                    'other',
                  ].includes(fields.billType) &&
                  ['paid', 'unpaid'].includes(fields.paymentStatus) &&
                  strings(fields.sharedParticipantIds) &&
                  Array.isArray(fields.adjustments) &&
                  fields.adjustments.every(
                    (row: {
                      label: unknown;
                      kind: string;
                      amountMinor: unknown;
                      memberIds: unknown;
                    }) =>
                      row &&
                      typeof row.label === 'string' &&
                      [
                        'individual_charge',
                        'shared_charge',
                        'individual_credit',
                        'shared_credit',
                      ].includes(row.kind) &&
                      amount(row.amountMinor) &&
                      strings(row.memberIds),
                  )
                : false;
  if (!valid) throw Error('Invalid saved assistant fields.');
  return {
    kind: action.kind,
    fields: action.fields,
    recipientIds: action.recipientIds,
  };
}
