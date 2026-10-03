// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BalanceWorkspace } from '../components/balance-workspace';
import { BillWorkspace } from '../components/bill-workspace';
import { ExpenseWorkspace } from '../components/expense-workspace';
import * as api from '../lib/api';

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  getMembers: vi.fn(),
  getBills: vi.fn(),
  getExpenses: vi.fn(),
  getBill: vi.fn(),
  getExpense: vi.fn(),
  getBillHistory: vi.fn(),
  getExpenseHistory: vi.fn(),
  getBalances: vi.fn(),
  getSettlements: vi.fn(),
  getBalanceEntries: vi.fn(),
  previewBillVoid: vi.fn(),
  previewExpenseVoid: vi.fn(),
}));
const household: api.Household = {
  id: 'home',
  name: 'Home',
  defaultCurrency: 'THB',
  timezone: 'Asia/Bangkok',
  role: 'owner',
  createdAt: '2026-01-01T00:00:00Z',
  currencyEditable: true,
};
const members: api.HouseholdMember[] = [
  {
    id: 'one',
    displayName: 'Aye',
    email: null,
    role: 'owner',
    joinedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'two',
    displayName: 'Lin',
    email: null,
    role: 'member',
    joinedAt: '2026-01-01T00:00:00Z',
  },
];
const common = {
  householdId: 'home',
  amountMinor: 10000,
  currency: 'THB' as const,
  payerMemberId: 'one',
  payerDisplayName: 'Aye',
  createdByDisplayName: 'Aye',
  createdAt: '2026-10-03T00:00:00Z',
  updatedAt: '2026-10-03T00:00:00Z',
  revision: 1,
  canEdit: true,
  canVoid: true,
  voidedAt: null,
  voidedByDisplayName: null,
  voidReason: null,
};
const shares = members.map((m) => ({
  memberId: m.id,
  displayName: m.displayName,
  amountMinor: 5000,
}));
function expense(i: number): api.Expense {
  return {
    ...common,
    id: `expense-${i}`,
    title: `Expense ${i}`,
    spentOn: '2026-10-03',
    splitMethod: 'equal',
    splitInput: {
      method: 'equal',
      shares: members.map((m) => ({ memberId: m.id })),
    },
    shares,
  };
}
function bill(i: number): api.Bill {
  return {
    ...common,
    id: `bill-${i}`,
    title: `Bill ${i}`,
    provider: 'Utility',
    billType: 'electricity',
    dueDate: '2026-10-03',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    paymentStatus: 'unpaid',
    statusUpdatedAt: common.createdAt,
    baseMinor: 10000,
    chargeMinor: 0,
    creditMinor: 0,
    sharedParticipantIds: members.map((m) => m.id),
    adjustments: [],
    adjustmentBreakdown: [],
    shares: shares.map((s) => ({
      ...s,
      baseMinor: s.amountMinor,
      adjustmentMinor: 0,
    })),
  };
}
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  document.documentElement.lang = 'en';
  document.title = 'HouseMate';
  vi.mocked(api.getMembers).mockResolvedValue(members);
  vi.mocked(api.getBills).mockResolvedValue([1, 2, 3, 4].map(bill));
  vi.mocked(api.getExpenses).mockResolvedValue([1, 2, 3, 4].map(expense));
  vi.mocked(api.getBill).mockImplementation(async (_t, _h, id) =>
    bill(Number(id.split('-')[1])),
  );
  vi.mocked(api.getExpense).mockImplementation(async (_t, _h, id) =>
    expense(Number(id.split('-')[1])),
  );
  vi.mocked(api.getBillHistory).mockResolvedValue({
    events: [],
    hasMore: false,
  });
  vi.mocked(api.getExpenseHistory).mockResolvedValue({
    events: [],
    hasMore: false,
  });
  vi.mocked(api.getBalanceEntries).mockResolvedValue([]);
  vi.mocked(api.getSettlements).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

for (const kind of ['bill', 'expense'] as const) {
  const Component = kind === 'bill' ? BillWorkspace : ExpenseWorkspace;
  const cap = kind === 'bill' ? 'Bill' : 'Expense';
  test(`${kind}: text controls expand inline and selecting a record opens its details`, async () => {
    const user = userEvent.setup();
    render(
      <Component
        household={household}
        token="session"
        onMoneyChanged={vi.fn()}
      />,
    );
    const all = await screen.findByRole('button', {
      name: `View all ${kind}s`,
    });
    expect(all.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(`${cap} 4`)).toBeNull();
    all.focus();
    await user.keyboard('{Enter}');
    await screen.findByText(`${cap} 4`);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Show less' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText(`${cap} 4`)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Hide details' }));
    await user.click(
      screen.getByRole('button', { name: new RegExp(`${cap} 1`) }),
    );
    await screen.findByRole('heading', { name: `${cap} 1` });
    const hide = screen.getByRole('button', { name: 'Hide details' });
    const panel = document.getElementById(
      hide.getAttribute('aria-controls') ?? '',
    );
    expect(panel?.hidden).toBe(false);
    await user.click(hide);
    expect(panel?.hidden).toBe(true);
    await user.click(screen.getByRole('button', { name: 'View details' }));
    expect(panel?.hidden).toBe(false);
  });
  test(`${kind}: collapsing details preserves the removal draft without a write`, async () => {
    const user = userEvent.setup();
    render(
      <Component
        household={household}
        token="session"
        initialRecordId={`${kind}-1`}
        onMoneyChanged={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: `${cap} 1` });
    await user.click(
      screen.getByRole('button', { name: `Remove mistaken ${kind}` }),
    );
    await user.type(screen.getByLabelText('Reason'), 'Duplicate entry');
    await user.click(screen.getByRole('button', { name: 'Hide details' }));
    await user.click(screen.getByRole('button', { name: 'View details' }));
    expect((screen.getByLabelText('Reason') as HTMLInputElement).value).toBe(
      'Duplicate entry',
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      kind === 'bill' ? api.previewBillVoid : api.previewExpenseVoid,
    ).not.toHaveBeenCalled();
  });
  test(`${kind}: inline pagination retries failures and retains the three-record preview`, async () => {
    const user = userEvent.setup();
    if (kind === 'bill') {
      vi.mocked(api.getBills)
        .mockResolvedValueOnce(
          Array.from({ length: 50 }, (_, i) => bill(i + 1)),
        )
        .mockRejectedValueOnce(new Error('Could not load the next page'))
        .mockResolvedValueOnce([bill(51)]);
    } else {
      vi.mocked(api.getExpenses)
        .mockResolvedValueOnce(
          Array.from({ length: 50 }, (_, i) => expense(i + 1)),
        )
        .mockRejectedValueOnce(new Error('Could not load the next page'))
        .mockResolvedValueOnce([expense(51)]);
    }
    render(
      <Component
        household={household}
        token="session"
        onMoneyChanged={vi.fn()}
      />,
    );
    await user.click(
      await screen.findByRole('button', { name: `View all ${kind}s` }),
    );
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText(`${cap} 51`);
    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText(`${cap} 51`)).toBeNull();
    const listApi = kind === 'bill' ? api.getBills : api.getExpenses;
    expect(listApi).toHaveBeenNthCalledWith(2, 'session', 'home', 50, 50);
    expect(listApi).toHaveBeenNthCalledWith(3, 'session', 'home', 50, 50);
  });
}

test('balance cards expand sources, suggestions and transfers independently inline', async () => {
  const user = userEvent.setup();
  const suggestions = Array.from({ length: 3 }, (_, i) => ({
    senderMemberId: 'one',
    senderDisplayName: 'Aye',
    recipientMemberId: `recipient-${i}`,
    recipientDisplayName: `Recipient ${i}`,
    amountMinor: 100 + i,
  }));
  vi.mocked(api.getBalances).mockResolvedValue({
    householdId: 'home',
    currency: 'THB',
    viewerMemberId: 'one',
    pendingBillCount: 0,
    pendingBillAmountMinor: 0,
    members: [
      {
        memberId: 'one',
        displayName: 'Aye',
        status: 'active',
        netMinor: -300,
        owesMinor: 300,
        owedMinor: 0,
      },
      {
        memberId: 'two',
        displayName: 'Lin',
        status: 'active',
        netMinor: 300,
        owesMinor: 0,
        owedMinor: 300,
      },
    ],
    suggestions,
  });
  vi.mocked(api.getSettlements).mockResolvedValue(
    Array.from({ length: 4 }, (_, i) => ({
      id: `transfer-${i}`,
      householdId: 'home',
      senderMemberId: 'one',
      recipientMemberId: 'two',
      senderDisplayName: `Sender ${i}`,
      recipientDisplayName: 'Lin',
      amountMinor: 100,
      currency: 'THB',
      settledOn: '2026-10-03',
      recordedByDisplayName: 'Aye',
      createdAt: '2026-10-03T00:00:00Z',
    })),
  );
  vi.mocked(api.getBalanceEntries).mockResolvedValue(
    Array.from({ length: 4 }, (_, i) => ({
      sourceType: 'expense',
      sourceId: `expense-${i}`,
      title: `Source ${i}`,
      occurredOn: '2026-10-03',
      paidMinor: 0,
      shareMinor: 100,
      sentMinor: 0,
      receivedMinor: 0,
      effectMinor: -100,
    })),
  );
  render(
    <BalanceWorkspace
      household={household}
      token="session"
      onMoneyChanged={vi.fn()}
    />,
  );
  const sources = await screen.findByRole('button', {
    name: 'View all balance sources',
  });
  expect(screen.queryByText('Source 3')).toBeNull();
  expect(screen.queryByText('Recipient 2')).toBeNull();
  expect(screen.queryByText(/Sender 0/)).toBeNull();
  await user.click(sources);
  await screen.findByText('Source 3');
  await user.click(
    screen.getByRole('button', { name: 'View all suggested transfers' }),
  );
  await screen.findByText('Recipient 2');
  await user.click(
    screen.getByRole('button', { name: 'View all recorded transfers' }),
  );
  await screen.findByText(/Sender 0/);
  expect(screen.queryByRole('dialog')).toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'Show fewer suggested transfers' }),
  );
  expect(screen.queryByText('Recipient 2')).toBeNull();
  expect(screen.getByText('Source 3')).toBeTruthy();
  await user.click(
    screen.getByRole('button', { name: 'Show fewer balance sources' }),
  );
  expect(screen.queryByText('Source 3')).toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'Show fewer recorded transfers' }),
  );
  expect(screen.queryByText(/Sender 0/)).toBeNull();
});
