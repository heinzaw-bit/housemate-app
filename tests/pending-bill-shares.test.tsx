// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BalanceWorkspace } from '../components/balance-workspace';
import { BillWorkspace } from '../components/bill-workspace';
import { HouseholdOverview } from '../components/household-overview';
import { VoidConfirmation } from '../components/void-confirmation';
import * as api from '../lib/api';
import { previewDashboard } from '../lib/preview-dashboard';
import { clearRecentReads } from '../lib/recent-reads';

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  getMembers: vi.fn(),
  getBills: vi.fn(),
  getBillHistory: vi.fn(),
  getBalances: vi.fn(),
  getSettlements: vi.fn(),
  previewBill: vi.fn(),
  createBill: vi.fn(),
}));
const household: api.Household = {
  id: 'home',
  name: 'Our home',
  timezone: 'Asia/Bangkok',
  defaultCurrency: 'THB',
  role: 'owner',
  currencyEditable: false,
  createdAt: '2026-01-01T00:00:00Z',
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
function summary(pending = 5000): api.BalanceSummary {
  return {
    householdId: 'home',
    currency: 'THB',
    viewerMemberId: 'one',
    members: members.map((member) => ({
      memberId: member.id,
      displayName: member.displayName,
      status: 'active',
      netMinor: 0,
      owedMinor: 0,
      owesMinor: 0,
      pendingBillShareMinor: pending,
      expectedNetMinor: member.id === 'one' ? pending : -pending,
    })),
    pendingBillCount: 1,
    pendingBillAmountMinor: pending * 2,
    suggestions: [],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  clearRecentReads();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.mocked(api.getBalances).mockResolvedValue(summary());
  vi.mocked(api.getSettlements).mockResolvedValue([]);
  vi.mocked(api.getMembers).mockResolvedValue(members);
  vi.mocked(api.getBills).mockResolvedValue([]);
  vi.mocked(api.getBillHistory).mockResolvedValue({
    events: [],
    hasMore: false,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearRecentReads();
});

test('Settlements shows combined balances and refreshes new unpaid splits', async () => {
  vi.useFakeTimers();
  await act(async () => {
    render(
      <BalanceWorkspace household={household} token="session" settlementView />,
    );
  });
  const balances = within(
    screen.getByRole('region', { name: 'Member balances' }),
  );
  expect(balances.getByText('You’re owed ฿50.00')).toBeTruthy();
  expect(balances.getByText('Owes ฿50.00')).toBeTruthy();
  expect(balances.getAllByText('Includes unpaid bills')).toHaveLength(2);
  expect(balances.queryByText('Pending bill share')).toBeNull();

  vi.mocked(api.getBalances).mockResolvedValue(summary(12500));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(balances.getByText('You’re owed ฿125.00')).toBeTruthy();
  expect(balances.getByText('Owes ฿125.00')).toBeTruthy();
  expect(api.getBalances).toHaveBeenLastCalledWith('session', 'home');
});

test('hidden or offline Settlements waits to refresh', async () => {
  vi.useFakeTimers();
  await act(async () => {
    render(
      <BalanceWorkspace household={household} token="session" settlementView />,
    );
  });
  screen.getByText('Aye (you)');
  const reads = vi.mocked(api.getBalances).mock.calls.length;
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(api.getBalances).toHaveBeenCalledTimes(reads);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  Object.defineProperty(navigator, 'onLine', {
    value: false,
    configurable: true,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(api.getBalances).toHaveBeenCalledTimes(reads);
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
  });
  await act(async () => {
    window.dispatchEvent(new Event('online'));
  });
  expect(api.getBalances).toHaveBeenCalledTimes(reads + 1);
});

test('Home uses the API combined balance instead of a separate pending share', () => {
  const data = previewDashboard(household);
  data.balance.members[0].pendingBillShareMinor = 12345;
  data.balance.members[0].expectedNetMinor = 60655;
  render(<HouseholdOverview data={data} household={household} />);
  expect(screen.getByText('+฿606.55')).toBeTruthy();
  expect(screen.getByText('Includes unpaid bills')).toBeTruthy();
  expect(
    screen.queryByRole('region', { name: 'Your pending bill share' }),
  ).toBeNull();
});

test('an unpaid contribution can change an owed balance into an expected contribution', () => {
  const data = previewDashboard(household);
  data.balance.members[0].expectedNetMinor = -10000;
  render(<HouseholdOverview data={data} household={household} />);
  expect(screen.getByText('−฿100.00')).toBeTruthy();
  expect(screen.getByText('You owe')).toBeTruthy();
});

test('older API replies keep confirmed amounts without calculating an expected balance in the client', async () => {
  const old = summary();
  for (const member of old.members) delete member.expectedNetMinor;
  vi.mocked(api.getBalances).mockResolvedValue(old);
  render(
    <BalanceWorkspace household={household} token="session" settlementView />,
  );
  const balances = within(
    await screen.findByRole('region', { name: 'Member balances' }),
  );
  expect(balances.getAllByText('Confirmed balance only')).toHaveLength(2);
  expect(balances.getByText('You’re settled up')).toBeTruthy();
});

test('removing an unpaid bill previews its combined balance effect before explicit confirmation', async () => {
  const user = userEvent.setup();
  const record = {
    id: 'bill',
    title: 'Internet',
    revision: 1,
    currency: 'THB' as const,
  };
  const confirm = vi.fn().mockResolvedValue(record);
  const preview = vi.fn().mockResolvedValue({
    recordId: record.id,
    title: record.title,
    amountMinor: 90000,
    currency: 'THB',
    expectedRevision: 1,
    reason: 'Duplicate',
    balanceEffects: [],
    expectedBalanceEffects: [
      {
        memberId: 'one',
        displayName: 'Aye',
        beforeMinor: 60000,
        changeMinor: -60000,
        afterMinor: 0,
      },
    ],
    pendingBillCountBefore: 1,
    pendingBillCountAfter: 0,
    pendingBillAmountMinorBefore: 90000,
    pendingBillAmountMinorAfter: 0,
    previewId: 'preview',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  render(
    <VoidConfirmation
      record={record}
      kind="bill"
      pendingBill
      onCancel={vi.fn()}
      onVoided={vi.fn()}
      previewAction={preview}
      confirmAction={confirm}
    />,
  );
  await user.type(screen.getByLabelText('Reason'), 'Duplicate');
  await user.click(
    screen.getByRole('button', { name: 'Preview removal effect' }),
  );
  expect(
    await screen.findByText('Balance effect (includes unpaid bills):'),
  ).toBeTruthy();
  expect(screen.getByText(/฿600\.00 THB.*฿0\.00 THB/)).toBeTruthy();
  expect(confirm).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Remove mistaken bill' }),
  ).toHaveProperty('disabled', true);
  await user.click(screen.getByRole('checkbox'));
  await user.click(
    screen.getByRole('button', { name: 'Remove mistaken bill' }),
  );
  expect(confirm).toHaveBeenCalledWith(
    'Duplicate',
    'preview',
    expect.any(String),
  );
});

test('confirming an unpaid bill explicitly shares pending allocations and preserves its unpaid status', async () => {
  const changed = vi.fn();
  const user = userEvent.setup();
  vi.mocked(api.previewBill).mockImplementation(
    async (_token, _home, draft) => ({
      ...draft,
      baseMinor: draft.amountMinor,
      chargeMinor: 0,
      creditMinor: 0,
      adjustmentBreakdown: [],
      shares: members.map((member) => ({
        memberId: member.id,
        displayName: member.displayName,
        baseMinor: 5000,
        adjustmentMinor: 0,
        amountMinor: 5000,
      })),
    }),
  );
  vi.mocked(api.createBill).mockImplementation(
    async (_token, _home, draft) => ({
      ...draft,
      id: 'new-bill',
      householdId: 'home',
      createdAt: '2026-11-16T00:00:00Z',
      updatedAt: '2026-11-16T00:00:00Z',
      statusUpdatedAt: '2026-11-16T00:00:00Z',
      payerDisplayName: 'Aye',
      createdByDisplayName: 'Aye',
      baseMinor: draft.amountMinor,
      chargeMinor: 0,
      creditMinor: 0,
      adjustmentBreakdown: [],
      shares: members.map((member) => ({
        memberId: member.id,
        displayName: member.displayName,
        baseMinor: 5000,
        adjustmentMinor: 0,
        amountMinor: 5000,
      })),
      revision: 1,
      canEdit: true,
      canVoid: true,
      voidedAt: null,
      voidedByDisplayName: null,
      voidReason: null,
    }),
  );
  render(
    <BillWorkspace
      household={household}
      token="session"
      initialCreate
      onMoneyChanged={changed}
    />,
  );
  await screen.findByRole('option', { name: 'Lin' });
  await user.type(screen.getByLabelText('Bill title'), 'WiFi fee');
  await user.type(screen.getByLabelText('Provider'), 'Internet provider');
  await user.type(screen.getByLabelText('Total (THB)'), '100');
  await user.click(screen.getByRole('button', { name: 'Continue to split' }));
  await user.click(
    screen.getByRole('button', { name: 'Preview exact shares' }),
  );
  expect(await screen.findByRole('note')).toHaveProperty(
    'textContent',
    expect.stringContaining('household balances using the planned payer'),
  );
  expect(api.createBill).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Confirm bill' }));
  expect(api.createBill).toHaveBeenCalledWith(
    'session',
    'home',
    expect.objectContaining({ paymentStatus: 'unpaid' }),
    expect.any(String),
  );
  expect(changed).toHaveBeenCalledOnce();
  expect(
    await screen.findByText(
      /Unpaid bill confirmed. Household balances include/,
    ),
  ).toBeTruthy();
});
