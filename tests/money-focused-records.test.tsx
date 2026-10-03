// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
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
  test(`${kind}: full history retries a failed page and opens a record beyond the first page`, async () => {
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
    const list = await screen.findByRole('dialog', { name: `All ${kind}s` });
    await user.click(within(list).getByRole('button', { name: 'Load more' }));
    await within(list).findByRole('alert');
    await user.click(within(list).getByRole('button', { name: 'Load more' }));
    await user.click(
      await within(list).findByRole('button', {
        name: new RegExp(`${cap} 51`),
      }),
    );
    const detail = await screen.findByRole('dialog', {
      name: `${cap} details`,
    });
    await within(detail).findByRole('heading', { name: `${cap} 51` });
    const listApi = kind === 'bill' ? api.getBills : api.getExpenses;
    expect(listApi).toHaveBeenNthCalledWith(2, 'session', 'home', 50, 50);
    expect(listApi).toHaveBeenNthCalledWith(3, 'session', 'home', 50, 50);
  });
  test(`${kind}: editing returns to the existing preview form without hiding it behind a panel`, async () => {
    const user = userEvent.setup();
    render(
      <Component
        household={household}
        token="session"
        initialRecordId={`${kind}-1`}
        onMoneyChanged={vi.fn()}
      />,
    );
    const detail = await screen.findByRole('dialog', {
      name: `${cap} details`,
    });
    await user.click(
      await within(detail).findByRole('button', { name: `Edit ${kind}` }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const title = await screen.findByDisplayValue(`${cap} 1`);
    expect(document.activeElement).toBe(title);
    expect(
      (
        screen.getByRole('button', {
          name: `View all ${kind}s`,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  test(`${kind}: three-record preview, full list, lazy activity and Back to the full list`, async () => {
    const user = userEvent.setup();
    render(
      <main>
        <h1>Money</h1>
        <Component
          household={household}
          token="session"
          onMoneyChanged={vi.fn()}
        />
      </main>,
    );
    await screen.findByText(`${cap} 1`);
    expect(screen.queryByText(`${cap} 4`)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: `View all ${kind}s` }));
    let dialog = await screen.findByRole('dialog', { name: `All ${kind}s` });
    await user.click(
      within(dialog).getByRole('button', { name: new RegExp(`${cap} 4`) }),
    );
    dialog = await screen.findByRole('dialog', { name: `${cap} details` });
    await within(dialog).findByRole('heading', { name: `${cap} 4` });
    const history =
      kind === 'bill' ? api.getBillHistory : api.getExpenseHistory;
    expect(history).not.toHaveBeenCalled();
    expect(within(dialog).getAllByText('Aye').length).toBeGreaterThan(0);
    await user.click(within(dialog).getByRole('tab', { name: 'Activity' }));
    await within(dialog).findByText('No history is available for this record.');
    expect(history).toHaveBeenCalledWith('session', 'home', `${kind}-4`, 20, 0);
    expect(within(dialog).getByText('Lin')).toBeTruthy();
    const results = await axe.run(dialog, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await user.keyboard('{Escape}');
    await screen.findByRole('dialog', { name: `All ${kind}s` });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  test(`${kind}: a removal draft survives Escape and can be cancelled before closing`, async () => {
    const user = userEvent.setup();
    render(
      <Component
        household={household}
        token="session"
        initialRecordId={`${kind}-4`}
        onMoneyChanged={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole('dialog', {
      name: `${cap} details`,
    });
    await within(dialog).findByRole('heading', { name: `${cap} 4` });
    await user.click(
      within(dialog).getByRole('button', { name: `Remove mistaken ${kind}` }),
    );
    await user.type(within(dialog).getByLabelText('Reason'), 'Duplicate entry');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: `${cap} details` })).toBeTruthy();
    expect(
      (within(dialog).getByLabelText('Reason') as HTMLInputElement).value,
    ).toBe('Duplicate entry');
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Finish or cancel',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      kind === 'bill' ? api.previewBillVoid : api.previewExpenseVoid,
    ).not.toHaveBeenCalled();
  });
}

test('balances show compact suggestions/transfers and open complete authorized views without writes', async () => {
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
      method: 'Bank transfer',
      note: 'Saved note',
    })),
  );
  vi.mocked(api.getBalanceEntries).mockResolvedValue([
    {
      sourceType: 'expense',
      sourceId: 'expense-1',
      title: 'Groceries source',
      occurredOn: '2026-10-03',
      paidMinor: 0,
      shareMinor: 300,
      sentMinor: 0,
      receivedMinor: 0,
      effectMinor: -300,
    },
  ]);
  render(
    <BalanceWorkspace
      household={household}
      token="session"
      onMoneyChanged={vi.fn()}
    />,
  );
  await screen.findByRole('button', { name: 'View breakdown' });
  expect(screen.queryByText('Recipient 2')).toBeNull();
  expect(screen.queryByText(/Sender 0/)).toBeNull(); // date tie breaks by id desc
  expect(screen.queryByText('Saved note')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'View breakdown' }));
  let dialog = await screen.findByRole('dialog', { name: 'Balance breakdown' });
  await within(dialog).findByText('Groceries source');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await user.click(screen.getByRole('button', { name: 'View all transfers' }));
  dialog = await screen.findByRole('dialog', {
    name: 'All recorded transfers',
  });
  expect(within(dialog).getAllByText(/Note: Saved note/).length).toBe(4);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await user.click(
    screen.getByRole('button', { name: 'View all suggestions' }),
  );
  dialog = await screen.findByRole('dialog', {
    name: 'All suggested transfers',
  });
  expect(within(dialog).getByText('Recipient 2')).toBeTruthy();
  await user.click(
    within(dialog).getAllByRole('button', { name: 'Record transfer' })[0],
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    screen.getByRole('heading', {
      name: 'Record money transferred outside HouseMate',
    }),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole('button', {
        name: 'View all transfers',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
