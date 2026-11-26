// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HomeDashboard } from '../components/home-dashboard';
import { HouseholdOverview } from '../components/household-overview';
import { MoneyWorkspace } from '../components/money-workspace';
import * as api from '../lib/api';
import { useLeaveGuard } from '../lib/pending-work';
import { previewDashboard } from '../lib/preview-dashboard';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push }),
}));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  getDashboard: vi.fn(),
  getBalances: vi.fn(),
}));
vi.mock('../components/balance-workspace', () => ({
  BalanceWorkspace: ({ settlementView }: { settlementView: boolean }) => (
    <p>{settlementView ? 'Recorded transfers' : 'Recent activity'}</p>
  ),
}));
const household: api.Household = {
  id: 'selected-home',
  name: 'Our home',
  defaultCurrency: 'USD',
  timezone: 'America/New_York',
  role: 'member',
  currencyEditable: false,
  createdAt: '2026-01-01T00:00:00Z',
};
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/money?household=selected-home');
  vi.mocked(api.getBalances).mockResolvedValue(
    previewDashboard(household).balance,
  );
});
afterEach(cleanup);

test('dashboard uses API amounts and counts, and labels bill totals as household totals', async () => {
  const data = previewDashboard(household);
  data.balance.members[0].netMinor = -12345;
  data.balance.members[0].expectedNetMinor = -12345;
  data.shoppingOpenCount = 12;
  render(<HouseholdOverview data={data} household={household} />);
  expect(screen.getByText('−$123.45')).toBeTruthy();
  expect(screen.getByText('You owe')).toBeTruthy();
  expect(screen.getByText(/\$2,052.50 total/)).toBeTruthy();
  expect(screen.getByText('12')).toBeTruthy();
  expect(screen.queryByText(/Your share\b/)).toBeNull();
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(result.violations).toEqual([]);
});

test('dashboard deep links keep the selected household and the exact target record', () => {
  render(
    <HouseholdOverview
      data={previewDashboard(household)}
      household={household}
    />,
  );
  for (const link of screen.getAllByRole('link')) {
    expect(
      new URL(
        link.getAttribute('href') ?? '',
        'http://localhost',
      ).searchParams.get('household'),
    ).toBe(household.id);
  }
  const bill = screen.getByRole('link', { name: /Electricity/ });
  expect(bill.getAttribute('href')).toContain(
    'view=bills&record=sample-electricity',
  );
  expect(
    screen
      .getByRole('link', { name: /Respond \/ view details/ })
      .getAttribute('href'),
  ).toContain('view=meals&meal=sample-dinner');
});

test('sample dashboard links remain inside the labelled preview', () => {
  render(
    <HouseholdOverview
      data={previewDashboard(household)}
      household={household}
      preview
    />,
  );
  for (const link of screen.getAllByRole('link'))
    expect(link.getAttribute('href')).toMatch(/^\/preview\//);
});

test('empty dashboard shows actual empty states without sample household records', () => {
  const data = previewDashboard(household);
  data.pendingBills.items = [];
  data.chores.nextDue = null;
  data.nextMeal = null;
  data.recentActivity = [];
  data.shoppingOpenCount = 0;
  data.chores.openCount = 0;
  render(<HouseholdOverview data={data} household={household} />);
  expect(screen.getByText(/No unpaid bills or open chores/)).toBeTruthy();
  expect(screen.getByText(/No meal plans yet/)).toBeTruthy();
  expect(screen.getByText(/No financial activity yet/)).toBeTruthy();
  expect(screen.queryByText('Electricity')).toBeNull();
});

test('dashboard access failure clears previously displayed household data', async () => {
  vi.mocked(api.getDashboard).mockResolvedValueOnce(
    previewDashboard(household),
  );
  render(<HomeDashboard household={household} token="redesign-session" />);
  await screen.findByText('Electricity');
  expect(screen.queryByText(/^(?:Last )?Updated\s+\d/i)).toBeNull();
  vi.mocked(api.getDashboard).mockRejectedValueOnce(
    new api.ApiRequestError(403, 'FORBIDDEN', 'No access'),
  );
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => expect(screen.queryByText('Electricity')).toBeNull());
  expect(screen.getByText('Dashboard unavailable.')).toBeTruthy();
});

test('a payment saved in another tab refreshes Money and supersedes a pending Home read', async () => {
  const unpaid = previewDashboard(household);
  const paid = previewDashboard(household);
  paid.balance.pendingBillCount = 0;
  paid.balance.pendingBillAmountMinor = 0;
  paid.pendingBills.items = [];
  paid.chores.nextDue = null;
  let finishOldRead!: (value: api.Dashboard) => void;
  vi.mocked(api.getDashboard)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldRead = resolve;
        }),
    )
    .mockResolvedValue(paid);
  const otherTab = new BroadcastChannel('housemate:bill-updates');
  try {
    render(
      <>
        <HomeDashboard household={household} token="bill-update-session" />
        <MoneyWorkspace household={household} token="bill-update-session" />
      </>,
    );
    await screen.findByText('1 bill still due to a provider');
    vi.mocked(api.getBalances).mockResolvedValue(paid.balance);
    otherTab.postMessage(household.id);
    await screen.findByText('No provider bills to pay');
    await act(async () => finishOldRead(unpaid));
    await screen.findByText(/No unpaid bills or open chores/);
    expect(screen.queryByText('Electricity')).toBeNull();
    expect(api.getDashboard).toHaveBeenCalledTimes(2);
  } finally {
    otherTab.close();
  }
});

test('Money opens Overview and preserves existing settlement record links', async () => {
  const view = render(<MoneyWorkspace household={household} token="session" />);
  await screen.findByText('Recent activity');
  expect(
    screen
      .getByRole('button', { name: 'Overview' })
      .getAttribute('aria-current'),
  ).toBe('page');
  fireEvent.click(screen.getByRole('button', { name: 'Bills' }));
  expect(push).toHaveBeenCalledWith(
    '/money?household=selected-home&view=bills',
    { scroll: false },
  );
  window.history.replaceState(
    null,
    '',
    '/money?household=selected-home&view=balances&record=old-transfer',
  );
  view.rerender(<MoneyWorkspace household={household} token="session" />);
  await screen.findByText('Recorded transfers');
  expect(
    screen
      .getByRole('button', { name: 'Settlements' })
      .getAttribute('aria-current'),
  ).toBe('page');
});

function OpenDraft() {
  useLeaveGuard(true);
  return null;
}
test('Money does not replace an open draft through tabs', async () => {
  render(
    <>
      <MoneyWorkspace household={household} token="session" />
      <OpenDraft />
    </>,
  );
  await screen.findByText('Recent activity');
  for (const name of ['Overview', 'Expenses', 'Bills', 'Settlements']) {
    const button = screen.getByRole('button', { name });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
  }
  expect(screen.queryByRole('button', { name: 'Add expense' })).toBeNull();
  expect(push).not.toHaveBeenCalled();
});
