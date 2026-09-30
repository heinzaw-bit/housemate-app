// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AnnouncementWorkspace } from '../components/announcement-workspace';
import { AppStatus } from '../components/app-status';
import { AuthScreen } from '../components/auth-screen';
import { BalanceWorkspace } from '../components/balance-workspace';
import { BillWorkspace } from '../components/bill-workspace';
import { ChoreWorkspace } from '../components/chore-workspace';
import { EventWorkspace } from '../components/event-workspace';
import { ExpenseWorkspace } from '../components/expense-workspace';
import { InstallApp } from '../components/install-app';
import { MealWorkspace } from '../components/meal-workspace';
import { NotificationWorkspace } from '../components/notification-workspace';
import { PollWorkspace } from '../components/poll-workspace';
import { ServiceWorkerRegister } from '../components/service-worker-register';
import { ShoppingWorkspace } from '../components/shopping-workspace';
import { VoidConfirmation } from '../components/void-confirmation';
import * as api from '../lib/api';
import { rememberInstallPrompt } from '../lib/install-prompt';
import { useLeaveGuard } from '../lib/pending-work';

vi.mock('../lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api')>();
  return {
    ...original,
    getMembers: vi.fn(),
    getExpenses: vi.fn(),
    getExpenseHistory: vi.fn(),
    previewExpense: vi.fn(),
    createExpense: vi.fn(),
    getBills: vi.fn(),
    getBalances: vi.fn(),
    getSettlements: vi.fn(),
    getBalanceEntries: vi.fn(),
    getChores: vi.fn(),
    getShoppingItems: vi.fn(),
    getMeals: vi.fn(),
    getEvents: vi.fn(),
    getAnnouncements: vi.fn(),
    getPolls: vi.fn(),
    getNotifications: vi.fn(),
    getNotificationPreferences: vi.fn(),
    getPushConfig: vi.fn(),
    getPushDevices: vi.fn(),
  };
});
const household = {
  id: 'home',
  name: 'Test household',
  defaultCurrency: 'THB',
  timezone: 'Asia/Bangkok',
  role: 'owner',
} as api.Household;
const members: api.HouseholdMember[] = [
  {
    id: 'one',
    email: null,
    displayName: 'Aye',
    role: 'owner',
    joinedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'two',
    email: null,
    displayName: 'Lin',
    role: 'member',
    joinedAt: '2026-01-01T00:00:00Z',
  },
];
beforeEach(() => {
  document.documentElement.lang = 'en';
  document.title = 'HouseMate';
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(api.getMembers).mockResolvedValue(members);
  vi.mocked(api.getExpenses).mockResolvedValue([]);
  vi.mocked(api.getExpenseHistory).mockResolvedValue({
    events: [],
    hasMore: false,
  });
  vi.mocked(api.getBills).mockResolvedValue([]);
  vi.mocked(api.getBalances).mockResolvedValue({
    householdId: 'home',
    currency: 'THB',
    viewerMemberId: 'one',
    members: members.map((member) => ({
      memberId: member.id,
      displayName: member.displayName,
      status: 'active',
      netMinor: 0,
      owesMinor: 0,
      owedMinor: 0,
    })),
    suggestions: [],
    pendingBillCount: 0,
    pendingBillAmountMinor: 0,
  });
  vi.mocked(api.getSettlements).mockResolvedValue([]);
  vi.mocked(api.getBalanceEntries).mockResolvedValue([]);
  vi.mocked(api.getChores).mockResolvedValue([]);
  vi.mocked(api.getShoppingItems).mockResolvedValue([]);
  vi.mocked(api.getMeals).mockResolvedValue([]);
  vi.mocked(api.getEvents).mockResolvedValue([]);
  vi.mocked(api.getAnnouncements).mockResolvedValue([]);
  vi.mocked(api.getPolls).mockResolvedValue([]);
  vi.mocked(api.getNotifications).mockResolvedValue({
    notifications: [],
    unreadCount: 0,
    nextCursor: null,
  });
  vi.mocked(api.getNotificationPreferences).mockResolvedValue({
    categories: Object.fromEntries(
      api.notificationCategories.map((category) => [
        category,
        { inApp: true, webPush: false },
      ]),
    ) as api.NotificationPreferences['categories'],
    quietHours: { enabled: false, start: '23:00', end: '07:00' },
    timezone: 'Asia/Bangkok',
  });
  vi.mocked(api.getPushConfig).mockResolvedValue({
    enabled: false,
    publicKey: null,
    reason: 'server_setup',
  });
  vi.mocked(api.getPushDevices).mockResolvedValue([]);
  vi.mocked(api.previewExpense).mockImplementation(
    async (_token, _hh, draft) => ({
      ...draft,
      splitMethod: 'equal',
      shares: members.map((member) => ({
        memberId: member.id,
        displayName: member.displayName,
        amountMinor: draft.amountMinor / 2,
      })),
    }),
  );
});
afterEach(() => {
  cleanup();
  rememberInstallPrompt(null);
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function checkStructure(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(
    result.violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

test('an interrupted expense confirmation keeps the draft and original retry key until the API confirms', async () => {
  const changed = vi.fn();
  const user = userEvent.setup();
  vi.mocked(api.createExpense)
    .mockRejectedValueOnce(
      new api.ApiRequestError(0, 'NETWORK_ERROR', 'Connection lost'),
    )
    .mockImplementationOnce(async (_token, hh, draft) => ({
      ...draft,
      id: 'saved',
      householdId: hh,
      splitMethod: 'equal',
      splitInput: draft.split,
      payerDisplayName: 'Aye',
      createdByDisplayName: 'Aye',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 1,
      canEdit: true,
      canVoid: true,
      voidedAt: null,
      voidedByDisplayName: null,
      voidReason: null,
      shares: members.map((member) => ({
        memberId: member.id,
        displayName: member.displayName,
        amountMinor: 140,
      })),
    }));
  const { container } = render(
    <main>
      <h1>Money</h1>
      <ExpenseWorkspace
        household={household}
        token="test-session"
        initialCreate
        onMoneyChanged={changed}
      />
    </main>,
  );
  await waitFor(() => expect(api.getMembers).toHaveBeenCalled());
  await user.type(screen.getByLabelText('What was it for?'), 'Groceries');
  await user.type(screen.getByLabelText('Total (THB)'), '2.80');
  await user.click(screen.getByRole('button', { name: /Preview shares/ }));
  const confirm = await screen.findByRole('button', {
    name: 'Confirm expense',
  });
  await checkStructure(container);
  await user.click(confirm);
  await screen.findByText(/Not yet confirmed: HouseMate could not verify/);
  expect(screen.queryByText('No expense has been saved yet.')).toBeNull();
  expect(
    (screen.getByLabelText('What was it for?') as HTMLInputElement).value,
  ).toBe('Groceries');
  expect(changed).not.toHaveBeenCalled();
  expect(api.createExpense).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Confirm expense' }));
  await screen.findByText('Expense confirmed and shared with your household.');
  expect(api.createExpense).toHaveBeenCalledTimes(2);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api.createExpense).mock.calls[0]?.slice(2)).toEqual(
    vi.mocked(api.createExpense).mock.calls[1]?.slice(2),
  );
});

test('installation is explicit and a prompt captured before Profile opens remains usable', async () => {
  render(<ServiceWorkerRegister />);
  const prompt = vi.fn(async () => {});
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: 'dismissed' }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  const { container } = render(
    <main>
      <h1>Profile</h1>
      <InstallApp />
    </main>,
  );
  expect(event.defaultPrevented).toBe(true);
  expect(prompt).not.toHaveBeenCalled();
  const keyboard = userEvent.setup();
  await keyboard.tab();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Install HouseMate' }),
  );
  await keyboard.keyboard('{Enter}');
  expect(prompt).toHaveBeenCalledTimes(1);
  await screen.findByText(/Installation dismissed/);
  expect(
    screen.queryByRole('button', { name: 'Install HouseMate' }),
  ).toBeNull();
  await checkStructure(container);
});

function Guard({ active }: { active: boolean }) {
  useLeaveGuard(active);
  return null;
}
test('offline/reconnected notices never retry a write and app updates wait for unfinished work', async () => {
  const worker = { postMessage: vi.fn() };
  Object.defineProperty(navigator, 'serviceWorker', {
    value: new EventTarget(),
    configurable: true,
  });
  const view = render(
    <>
      <AppStatus />
      <Guard active />
    </>,
  );
  act(() => {
    window.dispatchEvent(
      new CustomEvent('housemate.update.ready', { detail: worker }),
    );
  });
  expect(
    (
      screen.getByRole('button', {
        name: 'Reload to update',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  expect(worker.postMessage).not.toHaveBeenCalled();
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
  await screen.findByText(
    /saves need a connection and are never queued automatically/,
  );
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
  await screen.findByText(/Connection restored/);
  view.rerender(
    <>
      <AppStatus />
      <Guard active={false} />
    </>,
  );
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Reload to update' }));
  expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({
    type: 'HOUSEMATE_ACTIVATE_UPDATE',
  });
  view.rerender(
    <>
      <AppStatus />
      <Guard active />
    </>,
  );
  act(() => {
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
  expect(
    (
      screen.getByRole('button', {
        name: 'Reload to update',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

test('sign-in controls and installation help have accessible names and semantic structure', async () => {
  const { container } = render(
    <AuthScreen client={null} configured={false} callbackError="" />,
  );
  await checkStructure(container);
});

test('a lost removal reply can retry its original key even after the preview deadline passes', async () => {
  const record = {
    id: 'record',
    title: 'Groceries',
    revision: 1,
    currency: 'THB' as const,
  };
  const expiry = Date.now() + 60_000;
  const previewAction = vi.fn(async () => ({
    recordId: record.id,
    title: record.title,
    amountMinor: 280,
    currency: 'THB' as const,
    expectedRevision: 1,
    reason: 'Duplicate entry',
    balanceEffects: [],
    pendingBillCountBefore: 0,
    pendingBillCountAfter: 0,
    pendingBillAmountMinorBefore: 0,
    pendingBillAmountMinorAfter: 0,
    previewId: 'preview',
    expiresAt: new Date(expiry).toISOString(),
  }));
  const confirmed = vi
    .fn()
    .mockRejectedValueOnce(
      new api.ApiRequestError(0, 'NETWORK_ERROR', 'Lost reply'),
    )
    .mockResolvedValueOnce(record);
  const voided = vi.fn();
  render(
    <main>
      <h1>Money</h1>
      <h2>Expenses</h2>
      <h3>Groceries</h3>
      <VoidConfirmation
        record={record}
        kind="expense"
        onCancel={() => {}}
        onVoided={voided}
        previewAction={previewAction}
        confirmAction={confirmed}
      />
    </main>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Reason'), 'Duplicate entry');
  await user.click(
    screen.getByRole('button', { name: 'Preview removal effect' }),
  );
  await user.click(
    await screen.findByLabelText(/I understand this expense will be voided/),
  );
  await user.click(
    screen.getByRole('button', { name: 'Remove mistaken expense' }),
  );
  await screen.findByText(/Not yet confirmed: HouseMate could not verify/);
  vi.spyOn(Date, 'now').mockReturnValue(expiry + 1);
  await user.click(
    screen.getByRole('button', { name: 'Remove mistaken expense' }),
  );
  await waitFor(() => expect(voided).toHaveBeenCalledExactlyOnceWith(record));
  expect(confirmed.mock.calls[0]).toEqual(confirmed.mock.calls[1]);
  expect(previewAction).toHaveBeenCalledTimes(1);
});

for (const [name, element] of [
  [
    'Bills',
    <BillWorkspace
      key="quality-BillWorkspace"
      household={household}
      token="session"
      initialCreate
      onMoneyChanged={() => {}}
    />,
  ],
  [
    'Balances',
    <BalanceWorkspace
      key="quality-BalanceWorkspace"
      household={household}
      token="session"
      onMoneyChanged={() => {}}
    />,
  ],
  [
    'Chores',
    <ChoreWorkspace
      key="quality-ChoreWorkspace"
      household={household}
      token="session"
      createRequest={1}
    />,
  ],
  [
    'Shopping',
    <ShoppingWorkspace
      key="quality-ShoppingWorkspace"
      household={household}
      token="session"
      createRequest={1}
    />,
  ],
  [
    'Meals',
    <MealWorkspace
      key="quality-MealWorkspace"
      household={household}
      token="session"
      createRequest={1}
    />,
  ],
  [
    'Events',
    <EventWorkspace
      key="quality-EventWorkspace"
      household={household}
      token="session"
      createRequest={1}
    />,
  ],
  [
    'Announcements',
    <AnnouncementWorkspace
      key="quality-AnnouncementWorkspace"
      onHouseChanged={() => {}}
      household={household}
      token="session"
      createRequest={1}
    />,
  ],
  [
    'Polls',
    <PollWorkspace
      key="quality-PollWorkspace"
      onHouseChanged={() => {}}
      household={household}
      token="session"
      createRequest={1}
    />,
  ],
  [
    'Notifications',
    <NotificationWorkspace
      key="quality-NotificationWorkspace"
      household={household}
      token="session"
      accountId="u1"
    />,
  ],
] as const) {
  test(
    name +
      ' initial workspace and available creation controls pass structural accessibility checks',
    async () => {
      const { container } = render(
        <main>
          <h1>{name}</h1>
          {element}
        </main>,
      );
      await waitFor(() =>
        expect(
          screen.queryByText(
            /^Loading (members|bills|chores|shopping|meal|event|announcements|polls|notifications)/i,
          ),
        ).toBeNull(),
      );
      if (name === 'Notifications') {
        await userEvent
          .setup()
          .click(screen.getByRole('button', { name: 'Settings' }));
        await screen.findByRole('button', { name: 'Save preferences' });
      }
      await checkStructure(container);
    },
  );
}
