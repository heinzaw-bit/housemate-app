import { afterEach, expect, test, vi } from 'vitest';
import {
  createExpense,
  createHousehold,
  createSettlement,
  editBill,
  editExpense,
  formatCurrency,
  getBalanceEntries,
  getBalances,
  getHouseholds,
  previewBillEdit,
  previewExpense,
  previewExpenseEdit,
  previewSettlement,
} from '../lib/api';

afterEach(() => vi.unstubAllGlobals());

test('household creation sends the bearer token and chosen currency to the API', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'house-1',
        name: 'Our home',
        defaultCurrency: 'THB',
        timezone: 'Asia/Bangkok',
        role: 'owner',
        createdAt: '2026-09-27T00:00:00Z',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);

  const household = await createHousehold('access-token', {
    name: 'Our home',
    currency: 'THB',
    timezone: 'Asia/Bangkok',
  });
  expect(household.defaultCurrency).toBe('THB');
  const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('http://localhost:3001/v1/households');
  expect(options.method).toBe('POST');
  expect((options.headers as Record<string, string>).Authorization).toBe(
    'Bearer access-token',
  );
  expect(JSON.parse(options.body as string).currency).toBe('THB');
});

test('expense and bill edits send the preview revision and token with a stable retry key', async () => {
  const expense = {
    title: 'Revised groceries',
    amountMinor: 1200,
    currency: 'THB' as const,
    spentOn: '2026-09-27',
    payerMemberId: 'member-1',
    split: { method: 'equal' as const, shares: [{ memberId: 'member-1' }] },
  };
  const bill = {
    title: 'Revised electricity',
    billType: 'electricity' as const,
    provider: 'Utility',
    amountMinor: 2500,
    currency: 'THB' as const,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    dueDate: '2026-09-30',
    payerMemberId: 'member-1',
    paymentStatus: 'unpaid' as const,
    sharedParticipantIds: ['member-1'],
    adjustments: [],
  };
  const fetchMock = vi
    .fn()
    .mockImplementation(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await previewExpenseEdit('access-token', 'home', 'expense', expense, 2);
  await editExpense(
    'access-token',
    'home',
    'expense',
    expense,
    2,
    'preview-id',
    'retry-id',
  );
  await previewBillEdit('access-token', 'home', 'bill', bill, 3);
  await editBill(
    'access-token',
    'home',
    'bill',
    bill,
    3,
    'preview-id-2',
    'retry-id-2',
  );
  const calls = fetchMock.mock.calls as [string, RequestInit][];
  expect(calls.map(([url, options]) => [url, options.method])).toEqual([
    [
      'http://localhost:3001/v1/households/home/expenses/expense/edit-preview',
      'POST',
    ],
    ['http://localhost:3001/v1/households/home/expenses/expense', 'PATCH'],
    [
      'http://localhost:3001/v1/households/home/bills/bill/edit-preview',
      'POST',
    ],
    ['http://localhost:3001/v1/households/home/bills/bill', 'PATCH'],
  ]);
  expect(JSON.parse(calls[1]?.[1].body as string)).toEqual({
    ...expense,
    expectedRevision: 2,
    previewId: 'preview-id',
    idempotencyKey: 'retry-id',
  });
  expect(JSON.parse(calls[3]?.[1].body as string)).toEqual({
    ...bill,
    expectedRevision: 3,
    previewId: 'preview-id-2',
    idempotencyKey: 'retry-id-2',
  });
});

test('API error codes remain available to the UI without exposing a failed response as data', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'UNAUTHENTICATED', message: 'Sign in again.' },
        }),
        { status: 401 },
      ),
    ),
  );

  await expect(getHouseholds('expired-token')).rejects.toMatchObject({
    status: 401,
    code: 'UNAUTHENTICATED',
    message: 'Sign in again.',
  });
});

test('USD and THB render with two decimals and the correct symbols', () => {
  expect(formatCurrency(12345, 'USD')).toBe('$123.45');
  expect(formatCurrency(12345, 'THB')).toBe('฿123.45');
  expect(formatCurrency(100, 'THB')).toBe('฿1.00');
});

test('expense preview and confirmation send the same draft with a retry key only on confirmation', async () => {
  const draft = {
    title: 'Groceries',
    amountMinor: 101,
    currency: 'THB' as const,
    spentOn: '2026-09-27',
    payerMemberId: 'member-1',
    split: { method: 'equal' as const, shares: [{ memberId: 'member-1' }] },
  };
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ entries: [] }), { status: 200 }),
    );
  vi.stubGlobal('fetch', fetchMock);
  await previewExpense('access-token', 'house-1', draft);
  await createExpense('access-token', 'house-1', draft, 'retry-uuid');
  const previewCall = fetchMock.mock.calls[0] as [string, RequestInit];
  const confirmCall = fetchMock.mock.calls[1] as [string, RequestInit];
  expect(previewCall[0]).toContain('/expenses/preview');
  expect(confirmCall[0]).toMatch(/\/expenses$/);
  expect(JSON.parse(previewCall[1].body as string)).toEqual(draft);
  expect(JSON.parse(confirmCall[1].body as string)).toEqual({
    ...draft,
    idempotencyKey: 'retry-uuid',
  });
});

test('balance sources and manual transfer confirmation use the versioned API and preserve the retry key', async () => {
  const draft = {
    senderMemberId: 'member-b',
    recipientMemberId: 'member-a',
    amountMinor: 7500,
    currency: 'THB' as const,
    settledOn: '2026-09-27',
    method: 'Cash',
    note: 'Electricity',
  };
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ entries: [] }), { status: 200 }),
    );
  vi.stubGlobal('fetch', fetchMock);
  await getBalances('access-token', 'house-1');
  await getBalanceEntries('access-token', 'house-1', 'member-b', 25, 50);
  await previewSettlement('access-token', 'house-1', draft);
  await createSettlement('access-token', 'house-1', draft, 'retry-uuid');
  const calls = fetchMock.mock.calls as [string, RequestInit][];
  expect(calls[0]?.[0]).toContain('/house-1/balances');
  expect(calls[1]?.[0]).toContain('/member-b/entries?limit=25&offset=50');
  expect(calls[2]?.[0]).toContain('/settlements/preview');
  expect(calls[3]?.[0]).toMatch(/\/settlements$/);
  expect(JSON.parse(calls[2]?.[1].body as string)).toEqual(draft);
  expect(JSON.parse(calls[3]?.[1].body as string)).toEqual({
    ...draft,
    idempotencyKey: 'retry-uuid',
  });
  expect(
    (calls[3]?.[1].headers as Record<string, string> | undefined)
      ?.Authorization,
  ).toBe('Bearer access-token');
});
