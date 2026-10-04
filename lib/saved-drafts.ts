// Device-local, versioned drafts only. No tokens, responses or preview totals.
export const draftPrefix = 'housemate.draft.v1.';
const accountKey = 'housemate.draft.account';
export const draftLifetime = 7 * 24 * 60 * 60 * 1000;
export const draftChangeEvent = 'housemate.drafts-cleared';
let generation = 0;
export const draftGeneration = () => generation;

export interface SavedDraft<T = unknown> {
  version: 1;
  accountId: string;
  householdId: string;
  kind: string;
  context: string;
  savedAt: number;
  value: T;
  attempt: { signature: string; key: string } | null;
}
export function draftKey(account: string, household: string, kind: string) {
  return `${draftPrefix}${encodeURIComponent(account)}.${encodeURIComponent(household)}.${kind}`;
}
export function clearSavedDrafts() {
  generation++;
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(draftPrefix)) localStorage.removeItem(key);
    localStorage.removeItem(accountKey);
  } catch {
    /* Forms remain usable when browser storage is blocked. */
  }
  window.dispatchEvent(new Event(draftChangeEvent));
}
export function syncDraftAccount(account: string | null) {
  try {
    if (!account || localStorage.getItem(accountKey) !== account)
      clearSavedDrafts();
    if (account) localStorage.setItem(accountKey, account);
  } catch {
    /* No storage means no persisted recovery. */
  }
}
export function pruneSavedDrafts(account: string, households: string[]) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(draftPrefix)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? 'null');
        if (
          !value ||
          value.accountId !== account ||
          !households.includes(value.householdId) ||
          !Number.isFinite(value.savedAt) ||
          Date.now() - value.savedAt > draftLifetime
        )
          localStorage.removeItem(key);
      } catch {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* No private content is logged. */
  }
}

export function safeDraftValue(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 20000;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value))
    return (
      value.length <= 200 && value.every((v) => safeDraftValue(v, depth + 1))
    );
  if (typeof value !== 'object' || !value) return false;
  return (
    Object.entries(value).length <= 200 &&
    Object.entries(value).every(
      ([key, v]) =>
        ![
          '__proto__',
          'prototype',
          'constructor',
          'token',
          'access_token',
          'refresh_token',
        ].includes(key) && safeDraftValue(v, depth + 1),
    )
  );
}

// Schema checks use the form's explicit field allowlist, never arbitrary state.
export function sameDraftShape(reference: unknown, value: unknown): boolean {
  if (reference === null)
    return (
      value === null ||
      typeof value === 'string' ||
      (Array.isArray(value) && value.every((v) => typeof v === 'string'))
    );
  if (Array.isArray(reference)) {
    if (!Array.isArray(value)) return false;
    return (
      !reference.length || value.every((v) => sameDraftShape(reference[0], v))
    );
  }
  if (typeof reference !== 'object') return typeof reference === typeof value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const expected = Object.keys(reference as object);
  // Empty maps hold split-input strings only.
  if (!expected.length)
    return Object.values(value).every((v) => typeof v === 'string');
  return (
    Object.keys(value).length === expected.length &&
    expected.every(
      (key) =>
        Object.hasOwn(value, key) &&
        sameDraftShape(
          (reference as Record<string, unknown>)[key],
          (value as Record<string, unknown>)[key],
        ),
    )
  );
}

export function validFormCollections(value: Record<string, unknown>): boolean {
  const strings = (v: unknown) =>
    Array.isArray(v) && v.every((x) => typeof x === 'string');
  for (const key of [
    'participants',
    'participantIds',
    'recipients',
    'recipientIds',
    'voterIds',
  ])
    if (key in value && value[key] !== null && !strings(value[key]))
      return false;
  const enums: Record<string, string[]> = {
    method: ['equal', 'exact', 'percentage', 'ratio'],
    mealType: ['breakfast', 'lunch', 'dinner', 'other'],
    priority: ['low', 'normal', 'high', 'important', 'urgent'],
    paymentStatus: ['paid', 'unpaid'],
    billType: ['electricity', 'water', 'internet', 'rent', 'other'],
  };
  for (const [key, choices] of Object.entries(enums))
    if (key in value && !choices.includes(value[key] as string)) return false;
  if (
    'rows' in value &&
    (!Array.isArray(value.rows) ||
      !value.rows.every(
        (row) =>
          row &&
          typeof row.id === 'string' &&
          typeof row.label === 'string' &&
          typeof row.amount === 'string' &&
          [
            '',
            'excluded',
            'individual_charge',
            'shared_charge',
            'individual_credit',
            'shared_credit',
          ].includes(row.kind) &&
          strings(row.memberIds),
      ))
  )
    return false;
  if (
    'adjustments' in value &&
    (!Array.isArray(value.adjustments) ||
      !value.adjustments.every(
        (row) =>
          row &&
          typeof row.id === 'string' &&
          typeof row.label === 'string' &&
          typeof row.amount === 'string' &&
          strings(row.members) &&
          [
            'individual_charge',
            'shared_charge',
            'individual_credit',
            'shared_credit',
          ].includes(row.kind),
      ))
  )
    return false;
  if (
    'draftRoles' in value &&
    (!Array.isArray(value.draftRoles) ||
      !value.draftRoles.every(
        (role) =>
          role &&
          typeof role.memberId === 'string' &&
          typeof role.role === 'string',
      ))
  )
    return false;
  if (
    'options' in value &&
    (!Array.isArray(value.options) ||
      !value.options.every(
        (option) =>
          option &&
          typeof option.key === 'string' &&
          typeof option.label === 'string',
      ))
  )
    return false;
  return true;
}
