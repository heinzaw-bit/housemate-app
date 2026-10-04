export const searchTypes = [
  'expense',
  'bill',
  'settlement',
  'meal',
  'chore',
  'shopping',
  'event',
  'announcement',
  'poll',
] as const;
export type SearchType = (typeof searchTypes)[number];
export interface SearchHit {
  id: string;
  type: SearchType;
  title: string;
  snippet: string;
  status: string;
  createdAt: string;
  href: string;
}
export interface SearchPage {
  results: SearchHit[];
  nextCursor: string | null;
}
export function searchHousehold(
  token: string,
  householdId: string,
  q: string,
  type: SearchType | 'all' = 'all',
  cursor?: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ q, type, limit: '20' });
  if (cursor) query.set('cursor', cursor);
  return request<SearchPage>(
    `/v1/households/${encodeURIComponent(householdId)}/search?${query}`,
    token,
    { signal },
  );
}

export type Currency = 'USD' | 'THB';

export type AssistantTopic =
  | 'summary'
  | 'balance'
  | 'bills'
  | 'meals'
  | 'chores'
  | 'shopping'
  | 'events'
  | 'announcements'
  | 'board';
export const assistantContextTopics = [
  'summary',
  'board',
  'balance',
  'bills',
  'announcements',
  'events',
] as const;
export type AssistantContextTopic = (typeof assistantContextTopics)[number];
export interface AssistantAnswer {
  kind: 'answer' | 'clarification';
  topic: AssistantTopic | 'unsupported' | 'greeting' | 'about' | 'general';
  text: string;
  generatedAt: string;
  timezone: string;
  rows: { label: string; detail: string; href: string }[];
  sources: { label: string; href: string }[];
  partial: boolean;
  choices?: { label: string; topic: AssistantContextTopic }[];
}
export const assistantActionKinds = [
  'meal',
  'announcement',
  'shopping',
  'chore',
  'expense',
  'bill',
] as const;
export type AssistantActionKind = (typeof assistantActionKinds)[number];
interface AssistantActionBase {
  householdId: string;
  timezone: string;
  generatedAt: string;
  members: { id: string; displayName: string }[];
  recipientIds: string[];
  unresolvedFields: string[];
  notes: string[];
}
export type AssistantActionDraft = AssistantActionBase &
  (
    | {
        kind: 'meal';
        fields: Pick<
          MealDraft,
          'mealType' | 'question' | 'startsAtLocal' | 'responseDeadlineLocal'
        >;
      }
    | {
        kind: 'announcement';
        fields: Pick<
          AnnouncementDraft,
          | 'title'
          | 'body'
          | 'priority'
          | 'requiresAcknowledgement'
          | 'expiresAtLocal'
        >;
      }
    | { kind: 'shopping'; fields: ShoppingDraft }
    | { kind: 'chore'; fields: ChoreDraft }
    | { kind: 'expense'; fields: ExpenseDraft }
    | { kind: 'bill'; fields: BillDraft }
  );
export function prepareAssistantDraft(
  token: string,
  householdId: string,
  message: string,
  signal?: AbortSignal,
) {
  return request<{ draft: AssistantActionDraft | null }>(
    `/v1/households/${encodeURIComponent(householdId)}/assistant/drafts`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        message,
        allowedKinds: [...assistantActionKinds],
      }),
      signal,
    },
  );
}
export function getAssistantConfig(
  token: string,
  householdId: string,
  signal?: AbortSignal,
) {
  return request<{
    naturalLanguageEnabled: boolean;
    chatEnabled?: boolean;
    actionDraftsEnabled: boolean;
    supportedDraftKinds?: AssistantActionKind[];
    provider: 'gemini' | null;
    requiresPrivacyAcknowledgement: boolean;
  }>(`/v1/households/${encodeURIComponent(householdId)}/assistant`, token, {
    signal,
  });
}
export function askAssistant(
  token: string,
  householdId: string,
  question:
    | { topic: AssistantTopic; message?: never }
    | {
        message: string;
        topic?: never;
        privacyAcknowledged: true;
        context?: { topic: AssistantContextTopic };
      },
  signal?: AbortSignal,
) {
  return request<AssistantAnswer>(
    `/v1/households/${encodeURIComponent(householdId)}/assistant/questions`,
    token,
    { method: 'POST', body: JSON.stringify(question), signal },
  );
}

export const notificationCategories = [
  'money',
  'bills',
  'settlements',
  'meals',
  'chores',
  'shopping',
  'events',
  'announcements',
  'polls',
] as const;
export type NotificationCategory = (typeof notificationCategories)[number];
export interface NotificationItem {
  id: string;
  householdId: string;
  category: NotificationCategory;
  priority: 'low' | 'normal' | 'important' | 'urgent';
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  href: string;
}
export interface NotificationPage {
  notifications: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
}
export interface NotificationPreferences {
  categories: Record<
    NotificationCategory,
    { inApp: boolean; webPush: boolean }
  >;
  quietHours: { enabled: boolean; start: string; end: string };
  timezone: string;
}
export interface PushDevice {
  id: string;
  enabled: boolean;
  createdAt: string;
  lastSentAt: string | null;
  lastError: string | null;
}
export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
  reason: 'server_setup' | null;
}
export function getNotifications(
  token: string,
  householdId: string,
  scope: 'all' | 'unread' = 'all',
  cursor?: string,
  limit = 20,
) {
  const query = new URLSearchParams({ scope, limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return request<NotificationPage>(
    `/v1/households/${encodeURIComponent(householdId)}/notifications?${query}`,
    token,
  );
}
export function readNotification(
  token: string,
  householdId: string,
  id: string,
) {
  return request<void>(
    `/v1/households/${encodeURIComponent(householdId)}/notifications/${encodeURIComponent(id)}/read`,
    token,
    { method: 'PUT' },
  );
}
export function readAllNotifications(
  token: string,
  householdId: string,
  throughId: string,
) {
  return request<void>(
    `/v1/households/${encodeURIComponent(householdId)}/notifications/read-all`,
    token,
    { method: 'POST', body: JSON.stringify({ throughId }) },
  );
}
export function getNotificationPreferences(token: string, householdId: string) {
  return request<NotificationPreferences>(
    `/v1/households/${encodeURIComponent(householdId)}/notification-preferences`,
    token,
  );
}
export function saveNotificationPreferences(
  token: string,
  householdId: string,
  input: Omit<NotificationPreferences, 'timezone'>,
) {
  return request<NotificationPreferences>(
    `/v1/households/${encodeURIComponent(householdId)}/notification-preferences`,
    token,
    { method: 'PUT', body: JSON.stringify(input) },
  );
}
export function getPushConfig(token: string) {
  return request<PushConfig>('/v1/push-config', token);
}
export async function getPushDevices(token: string) {
  return (
    await request<{ devices: PushDevice[] }>('/v1/push-subscriptions', token)
  ).devices;
}
export function registerPushDevice(
  token: string,
  input: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    refreshOnly?: boolean;
  },
) {
  return request<PushDevice>('/v1/push-subscriptions', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export function disablePushDevice(token: string, id: string) {
  return request<void>(
    `/v1/push-subscriptions/${encodeURIComponent(id)}`,
    token,
    { method: 'DELETE' },
  );
}

export interface ApiUser {
  id: string;
  email: string | null;
  displayName: string;
}

export interface Household {
  id: string;
  name: string;
  defaultCurrency: Currency;
  timezone: string;
  role: 'owner' | 'admin' | 'member';
  currencyEditable: boolean;
  createdAt: string;
}

export interface HouseholdMember {
  id: string;
  displayName: string;
  email: string | null;
  role: Household['role'];
  joinedAt: string;
}

export interface HouseholdInvite {
  id: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  revokedAt: string | null;
}

export interface InvitePreview {
  householdId: string;
  householdName: string;
  expiresAt: string;
}

export interface CreateHouseholdInput {
  name: string;
  currency: Currency;
  timezone: string;
}

export type SplitMethod = 'equal' | 'exact' | 'percentage' | 'ratio';
export interface ExpenseDraft {
  title: string;
  amountMinor: number;
  currency: Currency;
  spentOn: string;
  payerMemberId: string;
  split: {
    method: SplitMethod;
    shares: { memberId: string; value?: number }[];
  };
}
export interface ExpensePreview extends Omit<ExpenseDraft, 'split'> {
  splitMethod: SplitMethod;
  shares: { memberId: string; displayName: string; amountMinor: number }[];
}
export interface Expense extends ExpensePreview {
  id: string;
  householdId: string;
  payerDisplayName: string;
  createdByDisplayName: string;
  createdAt: string;
  splitInput: ExpenseDraft['split'];
  revision: number;
  updatedAt: string;
  canEdit: boolean;
  canVoid: boolean;
  voidedAt: string | null;
  voidedByDisplayName: string | null;
  voidReason: string | null;
}
export interface ExpenseEditPreview extends ExpensePreview {
  expectedRevision: number;
  previewId: string;
  expiresAt: string;
}

export type BillAdjustmentKind =
  | 'individual_charge'
  | 'shared_charge'
  | 'individual_credit'
  | 'shared_credit';
export interface BillAdjustment {
  label: string;
  kind: BillAdjustmentKind;
  amountMinor: number;
  memberIds: string[];
}
export interface BillDraft {
  title: string;
  billType: 'electricity' | 'water' | 'internet' | 'rent' | 'other';
  provider: string;
  amountMinor: number;
  currency: Currency;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  payerMemberId: string;
  paymentStatus: 'unpaid' | 'paid';
  sharedParticipantIds: string[];
  adjustments: BillAdjustment[];
}
export interface BillPreview extends BillDraft {
  baseMinor: number;
  chargeMinor: number;
  creditMinor: number;
  shares: {
    memberId: string;
    displayName: string;
    baseMinor: number;
    adjustmentMinor: number;
    amountMinor: number;
  }[];
  adjustmentBreakdown: (BillAdjustment & {
    shares: { memberId: string; displayName: string; amountMinor: number }[];
  })[];
}
export interface Bill extends BillPreview {
  id: string;
  householdId: string;
  payerDisplayName: string;
  createdByDisplayName: string;
  createdAt: string;
  statusUpdatedAt: string;
  revision: number;
  updatedAt: string;
  canEdit: boolean;
  canVoid: boolean;
  voidedAt: string | null;
  voidedByDisplayName: string | null;
  voidReason: string | null;
}
export interface BillEditPreview extends BillPreview {
  expectedRevision: number;
  previewId: string;
  expiresAt: string;
}

export interface VoidPreview {
  recordId: string;
  title: string;
  amountMinor: number;
  currency: Currency;
  expectedRevision: number;
  reason: string | null;
  balanceEffects: {
    memberId: string;
    displayName: string;
    beforeMinor: number;
    changeMinor: number;
    afterMinor: number;
  }[];
  pendingBillCountBefore: number;
  pendingBillCountAfter: number;
  pendingBillAmountMinorBefore: number;
  pendingBillAmountMinorAfter: number;
  previewId: string;
  expiresAt: string;
}

export interface FinancialHistoryChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export interface FinancialHistoryEvent {
  id: string;
  kind: 'created' | 'edited' | 'voided' | 'status_changed';
  occurredAt: string;
  actorDisplayName: string;
  changes: FinancialHistoryChange[];
}

export interface FinancialHistoryPage {
  events: FinancialHistoryEvent[];
  hasMore: boolean;
}

export interface MemberBalance {
  memberId: string;
  displayName: string;
  status: 'active' | 'left' | 'removed' | 'invited';
  netMinor: number;
  owesMinor: number;
  owedMinor: number;
}
export interface SettlementSuggestion {
  senderMemberId: string;
  senderDisplayName: string;
  recipientMemberId: string;
  recipientDisplayName: string;
  amountMinor: number;
}
export interface BalanceSummary {
  householdId: string;
  currency: Currency;
  viewerMemberId: string;
  members: MemberBalance[];
  suggestions: SettlementSuggestion[];
  pendingBillCount: number;
  pendingBillAmountMinor: number;
}
export interface BalanceEntry {
  sourceType: 'expense' | 'bill' | 'settlement';
  sourceId: string;
  title: string;
  occurredOn: string;
  paidMinor: number;
  shareMinor: number;
  sentMinor: number;
  receivedMinor: number;
  effectMinor: number;
}
export interface SettlementDraft {
  senderMemberId: string;
  recipientMemberId: string;
  amountMinor: number;
  currency: Currency;
  settledOn: string;
  method?: string;
  note?: string;
}
export interface SettlementPreview extends SettlementDraft {
  senderDisplayName: string;
  recipientDisplayName: string;
  senderBeforeMinor: number;
  receiverBeforeMinor: number;
  senderAfterMinor: number;
  receiverAfterMinor: number;
  recommendedAmountMinor: number;
  warnings: string[];
}
export interface Settlement extends SettlementDraft {
  id: string;
  householdId: string;
  senderDisplayName: string;
  recipientDisplayName: string;
  recordedByDisplayName: string;
  createdAt: string;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
).replace(/\/$/, '');

const pendingReads = new Map<string, Promise<unknown>>();

async function request<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  // Share only simultaneous reads. No response or credentials remain cached afterward.
  if ((init?.method ?? 'GET') !== 'GET' || init?.signal)
    return requestOnce<T>(path, token, init);
  const key = `${token}:${path}`;
  const pending = pendingReads.get(key);
  if (pending) return pending as Promise<T>;
  const task = requestOnce<T>(path, token, init);
  pendingReads.set(key, task);
  try {
    return await task;
  } finally {
    if (pendingReads.get(key) === task) pendingReads.delete(key);
  }
}

async function requestOnce<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw new ApiRequestError(
      0,
      'OFFLINE',
      'You are offline. Reconnect and try again; this request was not sent.',
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  init?.signal?.addEventListener('abort', abort, { once: true });
  if (init?.signal?.aborted) abort();
  const timeout = setTimeout(abort, 20_000);
  try {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        },
        cache: 'no-store',
      });
    } catch {
      throw new ApiRequestError(
        0,
        'NETWORK_ERROR',
        'Could not reach HouseMate. Check your connection and try again.',
      );
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = body?.error;
      const routeMissing =
        response.status === 404 &&
        body?.statusCode === 404 &&
        typeof body?.message === 'string' &&
        /^Route [A-Z]+:.* not found$/.test(body.message);
      throw new ApiRequestError(
        response.status,
        routeMissing
          ? 'API_ROUTE_MISSING'
          : typeof error?.code === 'string'
            ? error.code
            : 'REQUEST_FAILED',
        routeMissing
          ? 'This feature needs a newer HouseMate API. Restart the API, then refresh this page.'
          : typeof error?.message === 'string'
            ? error.message
            : 'Something went wrong. Please try again.',
      );
    }
    if (response.status !== 204 && body === null)
      throw new ApiRequestError(
        response.status,
        'INVALID_RESPONSE',
        'HouseMate could not verify the server reply. Keep your review open and retry.',
      );
    return body as T;
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener('abort', abort);
  }
}

export function getMe(token: string) {
  return request<ApiUser>('/v1/me', token);
}

export function updateMe(token: string, displayName: string) {
  return request<ApiUser>('/v1/me', token, {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
}

export async function getHouseholds(token: string) {
  const response = await request<{ households: Household[] }>(
    '/v1/households',
    token,
  );
  return response.households;
}

export function createHousehold(token: string, input: CreateHouseholdInput) {
  return request<Household>('/v1/households', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getHousehold(token: string, id: string) {
  return request<Household>(`/v1/households/${encodeURIComponent(id)}`, token);
}

export function updateHousehold(
  token: string,
  id: string,
  input: { name?: string; timezone?: string; currency?: Currency },
) {
  return request<Household>(`/v1/households/${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function getMembers(token: string, householdId: string) {
  const response = await request<{ members: HouseholdMember[] }>(
    `/v1/households/${encodeURIComponent(householdId)}/members`,
    token,
  );
  return response.members;
}

export function updateMemberRole(
  token: string,
  householdId: string,
  memberId: string,
  role: 'admin' | 'member',
) {
  return request<HouseholdMember>(
    `/v1/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(memberId)}`,
    token,
    { method: 'PATCH', body: JSON.stringify({ role }) },
  );
}

export async function getInvites(token: string, householdId: string) {
  const response = await request<{ invites: HouseholdInvite[] }>(
    `/v1/households/${encodeURIComponent(householdId)}/invites`,
    token,
  );
  return response.invites;
}

export function createInvite(token: string, householdId: string) {
  return request<HouseholdInvite & { token: string }>(
    `/v1/households/${encodeURIComponent(householdId)}/invites`,
    token,
    { method: 'POST' },
  );
}

export function revokeInvite(
  token: string,
  householdId: string,
  inviteId: string,
) {
  return request<void>(
    `/v1/households/${encodeURIComponent(householdId)}/invites/${encodeURIComponent(inviteId)}`,
    token,
    { method: 'DELETE' },
  );
}

export function previewInvite(token: string, inviteToken: string) {
  return request<InvitePreview>(
    `/v1/invites/${encodeURIComponent(inviteToken)}`,
    token,
  );
}

export function acceptInvite(token: string, inviteToken: string) {
  return request<Household>(
    `/v1/invites/${encodeURIComponent(inviteToken)}/accept`,
    token,
    { method: 'POST' },
  );
}

export async function getExpenses(
  token: string,
  householdId: string,
  limit = 50,
  offset = 0,
) {
  const result = await request<{ expenses: Expense[] }>(
    `/v1/households/${encodeURIComponent(householdId)}/expenses?limit=${limit}&offset=${offset}`,
    token,
  );
  return result.expenses;
}

export function getExpense(
  token: string,
  householdId: string,
  expenseId: string,
) {
  return request<Expense>(
    `/v1/households/${encodeURIComponent(householdId)}/expenses/${encodeURIComponent(expenseId)}`,
    token,
  );
}

export function previewExpense(
  token: string,
  householdId: string,
  draft: ExpenseDraft,
) {
  return request<ExpensePreview>(
    `/v1/households/${encodeURIComponent(householdId)}/expenses/preview`,
    token,
    { method: 'POST', body: JSON.stringify(draft) },
  );
}

export function createExpense(
  token: string,
  householdId: string,
  draft: ExpenseDraft,
  idempotencyKey: string,
) {
  return request<Expense>(
    `/v1/households/${encodeURIComponent(householdId)}/expenses`,
    token,
    { method: 'POST', body: JSON.stringify({ ...draft, idempotencyKey }) },
  );
}

export function previewExpenseEdit(
  token: string,
  householdId: string,
  expenseId: string,
  draft: ExpenseDraft,
  expectedRevision: number,
) {
  return request<ExpenseEditPreview>(
    `/v1/households/${encodeURIComponent(householdId)}/expenses/${encodeURIComponent(expenseId)}/edit-preview`,
    token,
    { method: 'POST', body: JSON.stringify({ ...draft, expectedRevision }) },
  );
}

export function editExpense(
  token: string,
  householdId: string,
  expenseId: string,
  draft: ExpenseDraft,
  expectedRevision: number,
  previewId: string,
  idempotencyKey: string,
) {
  return request<Expense>(
    `/v1/households/${encodeURIComponent(householdId)}/expenses/${encodeURIComponent(expenseId)}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({
        ...draft,
        expectedRevision,
        previewId,
        idempotencyKey,
      }),
    },
  );
}

export function previewExpenseVoid(
  token: string,
  householdId: string,
  expenseId: string,
  expectedRevision: number,
  reason?: string,
) {
  return request<VoidPreview>(
    `/v1/households/${encodeURIComponent(householdId)}/expenses/${encodeURIComponent(expenseId)}/void-preview`,
    token,
    { method: 'POST', body: JSON.stringify({ expectedRevision, reason }) },
  );
}

export function getExpenseHistory(
  token: string,
  householdId: string,
  expenseId: string,
  limit = 20,
  offset = 0,
) {
  return request<FinancialHistoryPage>(
    `/v1/households/${encodeURIComponent(householdId)}/expenses/${encodeURIComponent(expenseId)}/history?limit=${limit}&offset=${offset}`,
    token,
  );
}

export function voidExpense(
  token: string,
  householdId: string,
  expenseId: string,
  expectedRevision: number,
  reason: string | undefined,
  previewId: string,
  idempotencyKey: string,
) {
  return request<Expense>(
    `/v1/households/${encodeURIComponent(householdId)}/expenses/${encodeURIComponent(expenseId)}/void`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        expectedRevision,
        reason,
        previewId,
        idempotencyKey,
      }),
    },
  );
}

export async function getBills(
  token: string,
  householdId: string,
  limit = 50,
  offset = 0,
) {
  const result = await request<{ bills: Bill[] }>(
    `/v1/households/${encodeURIComponent(householdId)}/bills?limit=${limit}&offset=${offset}`,
    token,
  );
  return result.bills;
}

export function getBill(token: string, householdId: string, billId: string) {
  return request<Bill>(
    `/v1/households/${encodeURIComponent(householdId)}/bills/${encodeURIComponent(billId)}`,
    token,
  );
}

export function previewBill(
  token: string,
  householdId: string,
  draft: BillDraft,
) {
  return request<BillPreview>(
    `/v1/households/${encodeURIComponent(householdId)}/bills/preview`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(draft),
    },
  );
}

export function createBill(
  token: string,
  householdId: string,
  draft: BillDraft,
  idempotencyKey: string,
) {
  return request<Bill>(
    `/v1/households/${encodeURIComponent(householdId)}/bills`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ ...draft, idempotencyKey }),
    },
  );
}

export function previewBillEdit(
  token: string,
  householdId: string,
  billId: string,
  draft: BillDraft,
  expectedRevision: number,
) {
  return request<BillEditPreview>(
    `/v1/households/${encodeURIComponent(householdId)}/bills/${encodeURIComponent(billId)}/edit-preview`,
    token,
    { method: 'POST', body: JSON.stringify({ ...draft, expectedRevision }) },
  );
}

export function editBill(
  token: string,
  householdId: string,
  billId: string,
  draft: BillDraft,
  expectedRevision: number,
  previewId: string,
  idempotencyKey: string,
) {
  return request<Bill>(
    `/v1/households/${encodeURIComponent(householdId)}/bills/${encodeURIComponent(billId)}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({
        ...draft,
        expectedRevision,
        previewId,
        idempotencyKey,
      }),
    },
  );
}

export function previewBillVoid(
  token: string,
  householdId: string,
  billId: string,
  expectedRevision: number,
  reason?: string,
) {
  return request<VoidPreview>(
    `/v1/households/${encodeURIComponent(householdId)}/bills/${encodeURIComponent(billId)}/void-preview`,
    token,
    { method: 'POST', body: JSON.stringify({ expectedRevision, reason }) },
  );
}

export function getBillHistory(
  token: string,
  householdId: string,
  billId: string,
  limit = 20,
  offset = 0,
) {
  return request<FinancialHistoryPage>(
    `/v1/households/${encodeURIComponent(householdId)}/bills/${encodeURIComponent(billId)}/history?limit=${limit}&offset=${offset}`,
    token,
  );
}

export function voidBill(
  token: string,
  householdId: string,
  billId: string,
  expectedRevision: number,
  reason: string | undefined,
  previewId: string,
  idempotencyKey: string,
) {
  return request<Bill>(
    `/v1/households/${encodeURIComponent(householdId)}/bills/${encodeURIComponent(billId)}/void`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        expectedRevision,
        reason,
        previewId,
        idempotencyKey,
      }),
    },
  );
}

export function setBillStatus(
  token: string,
  householdId: string,
  billId: string,
  paymentStatus: Bill['paymentStatus'],
) {
  return request<Bill>(
    `/v1/households/${encodeURIComponent(householdId)}/bills/${encodeURIComponent(billId)}/status`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({ paymentStatus }),
    },
  );
}

export function getBalances(token: string, householdId: string) {
  return request<BalanceSummary>(
    `/v1/households/${encodeURIComponent(householdId)}/balances`,
    token,
  );
}

export async function getBalanceEntries(
  token: string,
  householdId: string,
  memberId: string,
  limit = 50,
  offset = 0,
) {
  const result = await request<{ entries: BalanceEntry[] }>(
    `/v1/households/${encodeURIComponent(householdId)}/balances/${encodeURIComponent(memberId)}/entries?limit=${limit}&offset=${offset}`,
    token,
  );
  return result.entries;
}

export async function getSettlements(
  token: string,
  householdId: string,
  limit = 50,
  offset = 0,
) {
  const result = await request<{ settlements: Settlement[] }>(
    `/v1/households/${encodeURIComponent(householdId)}/settlements?limit=${limit}&offset=${offset}`,
    token,
  );
  return result.settlements;
}

export function previewSettlement(
  token: string,
  householdId: string,
  draft: SettlementDraft,
) {
  return request<SettlementPreview>(
    `/v1/households/${encodeURIComponent(householdId)}/settlements/preview`,
    token,
    { method: 'POST', body: JSON.stringify(draft) },
  );
}

export function createSettlement(
  token: string,
  householdId: string,
  draft: SettlementDraft,
  idempotencyKey: string,
) {
  return request<Settlement>(
    `/v1/households/${encodeURIComponent(householdId)}/settlements`,
    token,
    { method: 'POST', body: JSON.stringify({ ...draft, idempotencyKey }) },
  );
}

export function formatCurrency(
  amountMinor: number,
  currency: Currency,
): string {
  return new Intl.NumberFormat(currency === 'THB' ? 'th-TH' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export interface Dashboard {
  householdId: string;
  generatedAt: string;
  timezone: string;
  today: string;
  dueSoonDays: 7;
  balance: BalanceSummary;
  pendingBills: {
    overdueCount: number;
    dueSoonCount: number;
    items: {
      id: string;
      title: string;
      provider: string;
      dueDate: string;
      amountMinor: number;
      urgency: 'overdue' | 'due_soon' | 'upcoming';
    }[];
    hasMore: boolean;
  };
  nextMeal: {
    id: string;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'other';
    question: string;
    startsAt: string;
    responseDeadline: string;
    joiningCount: number;
    awaitingCount: number;
  } | null;
  shoppingOpenCount: number;
  chores: {
    openCount: number;
    overdueCount: number;
    nextDue: {
      id: string;
      title: string;
      dueAt: string;
      assigneeDisplayName: string;
    } | null;
  };
  recentActivity: {
    id: string;
    resourceType: 'expense' | 'bill' | 'settlement';
    resourceId: string;
    kind: 'created' | 'edited' | 'voided' | 'paid' | 'unpaid' | 'recorded';
    title: string;
    occurredAt: string;
    actorDisplayName: string;
  }[];
}

export function getDashboard(
  token: string,
  householdId: string,
  signal?: AbortSignal,
) {
  return request<Dashboard>(
    `/v1/households/${encodeURIComponent(householdId)}/dashboard`,
    token,
    { signal },
  );
}

export interface HouseActions {
  householdId: string;
  generatedAt: string;
  mealResponses: {
    id: string;
    title: string;
    startsAt: string;
    responseDeadline: string;
  }[];
  swapRequests: { id: string; title: string; dueAt: string }[];
  chores: { id: string; title: string; dueAt: string }[];
  shopping: {
    id: string;
    title: string;
    quantity: number | null;
    unit: string | null;
    priority: 'low' | 'normal' | 'high';
  }[];
  announcements: {
    id: string;
    title: string;
    priority: 'normal' | 'important' | 'urgent';
    expiresAt: string | null;
  }[];
  polls: { id: string; question: string; deadline: string }[];
}

export function getHouseActions(
  token: string,
  householdId: string,
  signal?: AbortSignal,
) {
  return request<HouseActions>(
    `/v1/households/${encodeURIComponent(householdId)}/house-actions`,
    token,
    { signal },
  );
}

export function getSettlement(
  token: string,
  householdId: string,
  settlementId: string,
) {
  return request<Settlement>(
    `/v1/households/${encodeURIComponent(householdId)}/settlements/${encodeURIComponent(settlementId)}`,
    token,
  );
}

export type MealResponse = 'joining' | 'not_joining' | 'maybe';
export interface MealRole {
  memberId: string;
  role: string;
}
export type AnnouncementScope = 'all' | 'needs_ack' | 'expired';
export interface AnnouncementDraft {
  title: string;
  body: string;
  priority: 'normal' | 'important' | 'urgent';
  requiresAcknowledgement: boolean;
  recipientIds: string[];
  expiresAtLocal?: string | null;
  idempotencyKey: string;
}
export interface Announcement {
  id: string;
  householdId: string;
  title: string;
  body: string;
  priority: AnnouncementDraft['priority'];
  requiresAcknowledgement: boolean;
  expiresAt: string | null;
  timezone: string;
  publishedAt: string;
  authorDisplayName: string;
  viewerMemberId: string;
  recipients: {
    memberId: string;
    displayName: string;
    active: boolean;
    acknowledgedAt: string | null;
  }[];
  counts: { total: number; acknowledged: number; awaiting: number };
  expired: boolean;
  canAcknowledge: boolean;
}
export type PollScope = 'open' | 'needs_vote' | 'closed';
export interface PollDraft {
  question: string;
  options: string[];
  allowMultiple: boolean;
  deadlineLocal: string;
  voterIds: string[];
  idempotencyKey: string;
}
export interface Poll {
  id: string;
  householdId: string;
  question: string;
  allowMultiple: boolean;
  deadline: string;
  timezone: string;
  createdAt: string;
  authorDisplayName: string;
  viewerMemberId: string;
  options: { id: string; label: string; position: number; voteCount: number }[];
  voterCount: number;
  activeVoterCount: number;
  responseCount: number;
  myOptionIds: string[];
  canVote: boolean;
  closed: boolean;
}
const announcementPath = (householdId: string) =>
  `/v1/households/${encodeURIComponent(householdId)}/announcements`;
const pollPath = (householdId: string) =>
  `/v1/households/${encodeURIComponent(householdId)}/polls`;
export async function getAnnouncements(
  token: string,
  householdId: string,
  scope: AnnouncementScope = 'all',
  limit = 50,
  offset = 0,
) {
  const result = await request<{ announcements: Announcement[] }>(
    `${announcementPath(householdId)}?scope=${scope}&limit=${limit}&offset=${offset}`,
    token,
  );
  return result.announcements;
}
export function getAnnouncement(
  token: string,
  householdId: string,
  announcementId: string,
) {
  return request<Announcement>(
    `${announcementPath(householdId)}/${encodeURIComponent(announcementId)}`,
    token,
  );
}
export function createAnnouncement(
  token: string,
  householdId: string,
  draft: AnnouncementDraft,
) {
  return request<Announcement>(announcementPath(householdId), token, {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}
export function acknowledgeAnnouncement(
  token: string,
  householdId: string,
  announcementId: string,
) {
  return request<Announcement>(
    `${announcementPath(householdId)}/${encodeURIComponent(announcementId)}/acknowledgement`,
    token,
    { method: 'PUT' },
  );
}
export async function getPolls(
  token: string,
  householdId: string,
  scope: PollScope = 'open',
  limit = 50,
  offset = 0,
) {
  const result = await request<{ polls: Poll[] }>(
    `${pollPath(householdId)}?scope=${scope}&limit=${limit}&offset=${offset}`,
    token,
  );
  return result.polls;
}
export function getPoll(token: string, householdId: string, pollId: string) {
  return request<Poll>(
    `${pollPath(householdId)}/${encodeURIComponent(pollId)}`,
    token,
  );
}
export function createPoll(
  token: string,
  householdId: string,
  draft: PollDraft,
) {
  return request<Poll>(pollPath(householdId), token, {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}
export function voteInPoll(
  token: string,
  householdId: string,
  pollId: string,
  optionIds: string[],
) {
  return request<Poll>(
    `${pollPath(householdId)}/${encodeURIComponent(pollId)}/vote`,
    token,
    { method: 'PUT', body: JSON.stringify({ optionIds }) },
  );
}

export type EventResponse = 'going' | 'maybe' | 'not_going';
export interface EventDraft {
  title: string;
  description?: string;
  location?: string;
  startsAtLocal: string;
  endsAtLocal?: string | null;
  idempotencyKey: string;
}
export interface HouseholdEvent {
  id: string;
  householdId: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  createdAt: string;
  creatorDisplayName: string;
  viewerMemberId: string;
  attendees: {
    memberId: string;
    displayName: string;
    response: EventResponse | null;
    respondedAt: string | null;
  }[];
  counts: { going: number; maybe: number; notGoing: number; awaiting: number };
  canRespond: boolean;
}
const eventPath = (householdId: string) =>
  `/v1/households/${encodeURIComponent(householdId)}/events`;
export async function getEvents(
  token: string,
  householdId: string,
  scope: 'upcoming' | 'past' = 'upcoming',
  limit = 50,
  offset = 0,
) {
  const result = await request<{ events: HouseholdEvent[] }>(
    `${eventPath(householdId)}?scope=${scope}&limit=${limit}&offset=${offset}`,
    token,
  );
  return result.events;
}
export function getEvent(token: string, householdId: string, eventId: string) {
  return request<HouseholdEvent>(
    `${eventPath(householdId)}/${encodeURIComponent(eventId)}`,
    token,
  );
}
export function createEvent(
  token: string,
  householdId: string,
  draft: EventDraft,
) {
  return request<HouseholdEvent>(eventPath(householdId), token, {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}
export function respondToEvent(
  token: string,
  householdId: string,
  eventId: string,
  response: EventResponse,
) {
  return request<HouseholdEvent>(
    `${eventPath(householdId)}/${encodeURIComponent(eventId)}/attendance`,
    token,
    { method: 'PATCH', body: JSON.stringify({ response }) },
  );
}

export interface MealDraft {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'other';
  question: string;
  startsAtLocal: string;
  responseDeadlineLocal: string;
  participantIds: string[];
  cookingRoles: MealRole[];
  idempotencyKey: string;
}
export interface Meal {
  id: string;
  householdId: string;
  mealType: MealDraft['mealType'];
  question: string;
  startsAt: string;
  responseDeadline: string;
  timezone: string;
  createdAt: string;
  creatorDisplayName: string;
  viewerMemberId: string;
  participants: {
    memberId: string;
    displayName: string;
    response: MealResponse | null;
    respondedAt: string | null;
  }[];
  counts: {
    joining: number;
    notJoining: number;
    maybe: number;
    awaiting: number;
  };
  cookingRoles: (MealRole & { displayName: string })[];
  canRespond: boolean;
}
const mealPath = (householdId: string) =>
  `/v1/households/${encodeURIComponent(householdId)}/meals`;
export async function getMeals(
  token: string,
  householdId: string,
  scope: 'all' | 'reply' | 'upcoming' | 'past' = 'all',
  limit = 50,
  offset = 0,
) {
  const result = await request<{ meals: Meal[] }>(
    `${mealPath(householdId)}?scope=${scope}&limit=${limit}&offset=${offset}`,
    token,
  );
  return result.meals;
}
export function getMeal(token: string, householdId: string, mealId: string) {
  return request<Meal>(
    `${mealPath(householdId)}/${encodeURIComponent(mealId)}`,
    token,
  );
}
export function createMeal(
  token: string,
  householdId: string,
  draft: MealDraft,
) {
  return request<Meal>(mealPath(householdId), token, {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}
export function respondToMeal(
  token: string,
  householdId: string,
  mealId: string,
  response: MealResponse,
) {
  return request<Meal>(
    `${mealPath(householdId)}/${encodeURIComponent(mealId)}/response`,
    token,
    { method: 'PATCH', body: JSON.stringify({ response }) },
  );
}
export function setMealCookingRoles(
  token: string,
  householdId: string,
  mealId: string,
  cookingRoles: MealRole[],
) {
  return request<Meal>(
    `${mealPath(householdId)}/${encodeURIComponent(mealId)}/cooking-roles`,
    token,
    { method: 'PUT', body: JSON.stringify({ cookingRoles }) },
  );
}

export interface ChoreDraft {
  title: string;
  note: string | null;
  dueAtLocal: string;
  assigneeMemberId: string;
}
export interface Chore {
  id: string;
  householdId: string;
  title: string;
  note: string | null;
  dueAt: string;
  timezone: string;
  assigneeMemberId: string;
  assigneeDisplayName: string;
  status: 'open' | 'completed' | 'skipped';
  skipReason: string | null;
  closedAt: string | null;
  closedByDisplayName: string | null;
  createdByDisplayName: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  viewerMemberId: string;
  canManage: boolean;
  canComplete: boolean;
  canRequestSwap: boolean;
  pendingSwap: {
    id: string;
    requestedByMemberId: string;
    requestedByDisplayName: string;
    targetMemberId: string;
    targetDisplayName: string;
    createdAt: string;
    canRespond: boolean;
  } | null;
}
const chorePath = (householdId: string) =>
  `/v1/households/${encodeURIComponent(householdId)}/chores`;
const choreItemPath = (householdId: string, choreId: string) =>
  `${chorePath(householdId)}/${encodeURIComponent(choreId)}`;
export async function getChores(
  token: string,
  householdId: string,
  limit = 50,
  offset = 0,
) {
  const result = await request<{ chores: Chore[] }>(
    `${chorePath(householdId)}?limit=${limit}&offset=${offset}`,
    token,
  );
  return result.chores;
}
export function getChore(token: string, householdId: string, choreId: string) {
  return request<Chore>(choreItemPath(householdId, choreId), token);
}
export function createChore(
  token: string,
  householdId: string,
  draft: ChoreDraft,
  idempotencyKey?: string,
) {
  return request<Chore>(chorePath(householdId), token, {
    method: 'POST',
    body: JSON.stringify({
      ...draft,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    }),
  });
}
export function reassignChore(
  token: string,
  householdId: string,
  choreId: string,
  assigneeMemberId: string,
  expectedRevision: number,
) {
  return request<Chore>(
    `${choreItemPath(householdId, choreId)}/assignment`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({ assigneeMemberId, expectedRevision }),
    },
  );
}
export function completeChore(
  token: string,
  householdId: string,
  choreId: string,
  expectedRevision: number,
) {
  return request<Chore>(
    `${choreItemPath(householdId, choreId)}/complete`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ expectedRevision }),
    },
  );
}
export function skipChore(
  token: string,
  householdId: string,
  choreId: string,
  expectedRevision: number,
  reason: string,
) {
  return request<Chore>(`${choreItemPath(householdId, choreId)}/skip`, token, {
    method: 'POST',
    body: JSON.stringify({ expectedRevision, reason }),
  });
}
export function requestChoreSwap(
  token: string,
  householdId: string,
  choreId: string,
  expectedRevision: number,
  targetMemberId: string,
) {
  return request<Chore>(
    `${choreItemPath(householdId, choreId)}/swap-requests`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ expectedRevision, targetMemberId }),
    },
  );
}
export function respondToChoreSwap(
  token: string,
  householdId: string,
  choreId: string,
  swapId: string,
  expectedRevision: number,
  decision: 'accepted' | 'declined',
) {
  return request<Chore>(
    `${choreItemPath(householdId, choreId)}/swap-requests/${encodeURIComponent(swapId)}/response`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ expectedRevision, decision }),
    },
  );
}

export interface ShoppingDraft {
  title: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  priority: 'low' | 'normal' | 'high';
  assignedBuyerMemberId: string | null;
  estimatedPriceMinor: number | null;
}
export interface ShoppingItem extends ShoppingDraft {
  id: string;
  householdId: string;
  currency: Currency;
  status: 'needed' | 'assigned' | 'purchased' | 'cancelled';
  assignedBuyerDisplayName: string | null;
  purchasedPriceMinor: number | null;
  purchasedByDisplayName: string | null;
  purchasedAt: string | null;
  cancelledAt: string | null;
  linkedExpenseId: string | null;
  linkedExpenseVoidedAt: string | null;
  createdByDisplayName: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  viewerMemberId: string;
}
const shoppingPath = (householdId: string) =>
  `/v1/households/${encodeURIComponent(householdId)}/shopping-items`;
export async function getShoppingItems(
  token: string,
  householdId: string,
  limit = 50,
  offset = 0,
) {
  const result = await request<{ items: ShoppingItem[] }>(
    `${shoppingPath(householdId)}?limit=${limit}&offset=${offset}`,
    token,
  );
  return result.items;
}
export function getShoppingItem(
  token: string,
  householdId: string,
  itemId: string,
) {
  return request<ShoppingItem>(
    `${shoppingPath(householdId)}/${encodeURIComponent(itemId)}`,
    token,
  );
}
export function createShoppingItem(
  token: string,
  householdId: string,
  draft: ShoppingDraft,
  idempotencyKey?: string,
) {
  return request<ShoppingItem>(shoppingPath(householdId), token, {
    method: 'POST',
    body: JSON.stringify({
      ...draft,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    }),
  });
}
export function editShoppingItem(
  token: string,
  householdId: string,
  itemId: string,
  draft: ShoppingDraft,
  expectedRevision: number,
) {
  return request<ShoppingItem>(
    `${shoppingPath(householdId)}/${encodeURIComponent(itemId)}`,
    token,
    { method: 'PATCH', body: JSON.stringify({ ...draft, expectedRevision }) },
  );
}
export function cancelShoppingItem(
  token: string,
  householdId: string,
  itemId: string,
  expectedRevision: number,
) {
  return request<ShoppingItem>(
    `${shoppingPath(householdId)}/${encodeURIComponent(itemId)}/cancel`,
    token,
    { method: 'POST', body: JSON.stringify({ expectedRevision }) },
  );
}
export function purchaseShoppingItem(
  token: string,
  householdId: string,
  itemId: string,
  expectedRevision: number,
  purchasedPriceMinor: number | null,
) {
  return request<ShoppingItem>(
    `${shoppingPath(householdId)}/${encodeURIComponent(itemId)}/purchase`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ expectedRevision, purchasedPriceMinor }),
    },
  );
}
export function purchaseShoppingWithExpense(
  token: string,
  householdId: string,
  itemId: string,
  expectedRevision: number,
  expenseDraft: ExpenseDraft,
  idempotencyKey: string,
) {
  return request<{ item: ShoppingItem; expense: Expense }>(
    `${shoppingPath(householdId)}/${encodeURIComponent(itemId)}/purchase-with-expense`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ expectedRevision, expenseDraft, idempotencyKey }),
    },
  );
}
