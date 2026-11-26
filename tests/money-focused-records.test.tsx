// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BalanceWorkspace } from '../components/balance-workspace';
import { BillWorkspace } from '../components/bill-workspace';
import { ExpenseWorkspace } from '../components/expense-workspace';
import { MoneyWorkspace } from '../components/money-workspace';
import * as api from '../lib/api';
import { previewDashboard } from '../lib/preview-dashboard';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push }),
}));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  getMembers: vi.fn(),
  getBills: vi.fn(),
  getExpenses: vi.fn(),
  getBill: vi.fn(),
  setBillStatus: vi.fn(),
  getExpense: vi.fn(),
  getBillHistory: vi.fn(),
  getExpenseHistory: vi.fn(),
  getBalances: vi.fn(),
  getSettlements: vi.fn(),
  previewSettlement: vi.fn(),
  createSettlement: vi.fn(),
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
function transfer(i: number): api.Settlement {
  return {
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
  };
}
beforeEach(() => {
  window.history.replaceState(null, '', '/money?household=home');
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
    if (kind === 'expense') {
      expect(
        screen.getByRole('heading', { name: 'Each person’s share' }),
      ).toBeTruthy();
      expect(
        screen.queryByRole('heading', { name: 'Change history' }),
      ).toBeNull();
      expect(api.getExpenseHistory).not.toHaveBeenCalled();
    }
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

test.each(['member', 'admin'] as const)(
  'saved bill controls respect the %s role',
  async (role) => {
    // Older responses could still grant a regular bill creator edit and removal.
    render(
      <BillWorkspace
        household={{ ...household, role }}
        token="session"
        initialRecordId="bill-1"
        onMoneyChanged={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: 'Bill 1' });
    expect(screen.getByText('Provider status')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add bill' })).toBeTruthy();
    for (const name of ['Edit bill', 'Remove mistaken bill', 'Mark Paid']) {
      const control = screen.queryByRole('button', { name });
      expect(Boolean(control)).toBe(role === 'admin');
    }
    expect(screen.queryByRole('button', { name: 'Mark Unpaid' })).toBeNull();
  },
);

test('saving a provider payment refreshes the unpaid bill total from the API', async () => {
  window.history.replaceState(null, '', '/money?household=home&view=bills');
  const user = userEvent.setup();
  let savedBills = [bill(1), bill(2)];
  let finishFirstSave!: () => void;
  const firstSave = new Promise<void>((resolve) => {
    finishFirstSave = resolve;
  });
  vi.mocked(api.getBills).mockImplementation(async () => savedBills);
  vi.mocked(api.getBill).mockImplementation(
    async (_token, _household, id) =>
      savedBills.find((item) => item.id === id) ?? bill(1),
  );
  vi.mocked(api.getBalances).mockImplementation(async () => {
    const unpaid = savedBills.filter((item) => item.paymentStatus === 'unpaid');
    return {
      ...previewDashboard(household).balance,
      pendingBillCount: unpaid.length,
      pendingBillAmountMinor: unpaid.reduce(
        (sum, item) => sum + item.amountMinor,
        0,
      ),
    };
  });
  vi.mocked(api.setBillStatus).mockImplementation(
    async (_token, _household, id, paymentStatus) => {
      if (id === 'bill-1') await firstSave;
      const saved = savedBills.find((item) => item.id === id);
      if (!saved) throw new Error('Missing bill fixture');
      const updated = { ...saved, paymentStatus, revision: saved.revision + 1 };
      savedBills = savedBills.map((item) => (item.id === id ? updated : item));
      return updated;
    },
  );

  render(<MoneyWorkspace household={household} token="session" />);
  const totals = within(
    await screen.findByRole('region', { name: 'Money overview' }),
  );
  await totals.findByText('2 bills still due to providers');
  expect(totals.getByText('฿200.00 THB')).toBeTruthy();
  await user.click(await screen.findByRole('button', { name: /^Bill 1 / }));
  await user.click(await screen.findByRole('button', { name: 'Mark Paid' }));
  expect(totals.getByText('฿200.00 THB')).toBeTruthy();
  finishFirstSave();
  await totals.findByText('1 bill still due to a provider');
  expect(totals.getByText('฿100.00 THB')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Mark Unpaid' })).toBeTruthy();

  await user.click(screen.getByRole('button', { name: /^Bill 2 / }));
  await user.click(await screen.findByRole('button', { name: 'Mark Paid' }));
  await totals.findByText('No provider bills to pay');
  expect(totals.getByText('฿0.00 THB')).toBeTruthy();
});

test('Overview and Settlements show member balances and expand their own transfer lists', async () => {
  const user = userEvent.setup();
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
    suggestions: [
      {
        senderMemberId: 'one',
        senderDisplayName: 'Aye',
        recipientMemberId: 'two',
        recipientDisplayName: 'Lin',
        amountMinor: 100,
      },
    ],
  });
  vi.mocked(api.getSettlements).mockResolvedValue(
    Array.from({ length: 3 }, (_, i) => transfer(i)),
  );
  const view = render(
    <BalanceWorkspace key="overview" household={household} token="session" />,
  );
  await screen.findByRole('heading', { name: 'Recent activity' });
  expect(
    screen.queryByRole('heading', { name: 'Balances & transfers' }),
  ).toBeNull();
  const overviewBalances = within(
    screen.getByRole('region', { name: 'Member balances' }),
  );
  expect(overviewBalances.getByText('You owe ฿3.00')).toBeTruthy();
  expect(overviewBalances.getByText('Is owed ฿3.00')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'View balance breakdown' }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: 'Record transfer' })).toBeNull();
  expect(
    screen.getByRole('link', { name: /Sender 2/ }).getAttribute('href'),
  ).toBe('/money?household=home&view=balances&record=transfer-2');
  expect(screen.queryByText(/Sender 0/)).toBeNull();
  const overviewUrl = window.location.href;
  const viewAll = screen.getByRole('button', {
    name: 'View all recorded transfers',
  });
  expect(viewAll.getAttribute('aria-expanded')).toBe('false');
  await user.click(viewAll);
  expect(window.location.href).toBe(overviewUrl);
  expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeTruthy();
  expect(
    screen.getByRole('link', { name: /Sender 0/ }).getAttribute('href'),
  ).toBe('/money?household=home&view=balances&record=transfer-0');
  await user.click(
    screen.getByRole('button', { name: 'Show fewer recorded transfers' }),
  );
  expect(screen.queryByText(/Sender 0/)).toBeNull();
  window.history.replaceState({}, '', '/money?household=home&view=balances');
  const settlementsUrl = window.location.href;
  view.rerender(
    <BalanceWorkspace
      key="settlements"
      household={household}
      token="session"
      settlementView
    />,
  );
  await screen.findByRole('heading', { name: 'Recorded transfers' });
  expect(screen.queryByRole('heading', { name: 'Recent activity' })).toBeNull();
  expect(screen.getByText(/Sender 2/)).toBeTruthy();
  expect(screen.queryByText(/Sender 0/)).toBeNull();
  const viewAllTransfers = screen.getByRole('button', {
    name: 'View all recorded transfers',
  });
  expect(viewAllTransfers.textContent).toBe('View all');
  expect(viewAllTransfers.getAttribute('aria-expanded')).toBe('false');
  await user.click(viewAllTransfers);
  await screen.findByText(/Sender 0/);
  expect(window.location.href).toBe(settlementsUrl);
  expect(screen.getByRole('region', { name: 'Member balances' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Record transfer' })).toBeNull();
  expect(screen.queryByText('Suggested transfers')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Record after paying' }),
  ).toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'Show fewer recorded transfers' }),
  );
  expect(screen.queryByText(/Sender 0/)).toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'View all recorded transfers' }),
  );
  await screen.findByText(/Sender 0/);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('the owner can open Record transfer, review a draft, and confirm it', async () => {
  const user = userEvent.setup();
  vi.mocked(api.getBalances).mockResolvedValue({
    ...previewDashboard(household).balance,
    viewerMemberId: 'one',
    members: members.map((member) => ({
      memberId: member.id,
      displayName: member.displayName,
      status: 'active',
      netMinor: 0,
      owesMinor: 0,
      owedMinor: 0,
    })),
  });
  vi.mocked(api.previewSettlement).mockImplementation(
    async (_t, _h, draft) => ({
      ...draft,
      senderDisplayName: 'Lin',
      recipientDisplayName: 'Aye',
      senderBeforeMinor: -100,
      receiverBeforeMinor: 100,
      senderAfterMinor: 0,
      receiverAfterMinor: 0,
      recommendedAmountMinor: 100,
      warnings: [],
    }),
  );
  vi.mocked(api.createSettlement).mockImplementation(async (_t, _h, draft) => ({
    ...transfer(0),
    ...draft,
    senderDisplayName: 'Lin',
    recipientDisplayName: 'Aye',
  }));
  const view = render(<MoneyWorkspace household={household} token="session" />);
  const nav = within(
    screen.getByRole('navigation', { name: 'Money sections' }),
  );
  const settlementsTab = nav.getByRole<HTMLButtonElement>('button', {
    name: 'Settlements',
  });
  const recordTab = nav.getByRole('button', { name: 'Record transfer' });
  expect(settlementsTab.nextElementSibling).toBe(recordTab);
  await user.click(recordTab);
  const recordUrl = '/money?household=home&view=record-transfer';
  expect(push).toHaveBeenCalledWith(recordUrl, { scroll: false });
  window.history.replaceState({}, '', recordUrl);
  view.rerender(<MoneyWorkspace household={household} token="session" />);
  expect(recordTab.getAttribute('aria-current')).toBe('page');
  const direction = await screen.findByLabelText('What happened?');
  expect(settlementsTab.disabled).toBe(false);
  await user.selectOptions(direction, 'received');
  const amount = screen.getByLabelText<HTMLInputElement>('Amount (THB)');
  await user.selectOptions(screen.getByLabelText('Received from'), 'two');
  await user.type(amount, '1.00');
  expect(settlementsTab.disabled).toBe(true);
  await user.click(
    screen.getByRole('button', { name: 'Preview balance effect' }),
  );
  expect(api.previewSettlement).toHaveBeenCalledWith(
    'session',
    'home',
    expect.objectContaining({
      senderMemberId: 'two',
      recipientMemberId: 'one',
      amountMinor: 100,
    }),
  );
  expect(api.createSettlement).not.toHaveBeenCalled();
  await user.click(
    await screen.findByRole('button', { name: 'Confirm recorded transfer' }),
  );
  await screen.findByText('Lin → Aye: ฿1.00 recorded.');
  expect(api.createSettlement).toHaveBeenCalledWith(
    'session',
    'home',
    vi.mocked(api.previewSettlement).mock.calls[0][2],
    expect.any(String),
  );
  expect(amount.value).toBe('');
  expect(settlementsTab.disabled).toBe(false);
});

test.each(['admin', 'member'] as const)(
  '%s cannot open the Record transfer tab by URL',
  async (role) => {
    window.history.replaceState(
      {},
      '',
      '/money?household=home&view=record-transfer',
    );
    vi.mocked(api.getBalances).mockResolvedValue(
      previewDashboard(household).balance,
    );
    render(
      <MoneyWorkspace household={{ ...household, role }} token="session" />,
    );
    await screen.findByRole('heading', { name: 'Recent activity' });
    expect(
      screen
        .getByRole('button', { name: 'Overview' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen.queryByRole('button', { name: 'Record transfer' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Preview balance effect' }),
    ).toBeNull();
  },
);

test('expanded Overview activity can load older transfers and keeps them on refresh', async () => {
  const user = userEvent.setup();
  const firstPage = Array.from({ length: 50 }, (_, i) => transfer(i));
  vi.mocked(api.getBalances).mockResolvedValue(
    previewDashboard(household).balance,
  );
  vi.mocked(api.getSettlements).mockImplementation(
    async (_token, _household, _limit, offset) =>
      offset === 50 ? [transfer(50)] : firstPage,
  );
  render(<BalanceWorkspace household={household} token="session" />);
  await user.click(
    await screen.findByRole('button', { name: 'View all recorded transfers' }),
  );
  await user.click(screen.getByRole('button', { name: 'Load more transfers' }));
  await screen.findByRole('link', { name: /^Sender 50 / });
  expect(api.getSettlements).toHaveBeenLastCalledWith(
    'session',
    'home',
    50,
    50,
  );

  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(api.getSettlements).toHaveBeenCalledTimes(4);
  expect(screen.getByRole('link', { name: /^Sender 50 / })).toBeTruthy();
  expect(window.location.search).toBe('?household=home');
});
