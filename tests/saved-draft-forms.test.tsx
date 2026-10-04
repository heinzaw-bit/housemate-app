// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AssistantWorkspace } from '../components/assistant-workspace';
import { BillWorkspace } from '../components/bill-workspace';
import { ExpenseWorkspace } from '../components/expense-workspace';
import { SavedDraftProvider } from '../components/saved-draft';
import * as api from '../lib/api';
import { draftKey } from '../lib/saved-drafts';

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  getMembers: vi.fn(),
  getExpenses: vi.fn(),
  getBills: vi.fn(),
  getExpenseHistory: vi.fn(),
  previewExpense: vi.fn(),
  createExpense: vi.fn(),
  getAssistantConfig: vi.fn(),
  prepareAssistantDraft: vi.fn(),
  createShoppingItem: vi.fn(),
  askAssistant: vi.fn(),
  previewBill: vi.fn(),
}));
const household = {
  id: 'home',
  name: 'Our home',
  timezone: 'Asia/Bangkok',
  defaultCurrency: 'THB',
  role: 'owner',
} as api.Household;
const members = [
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
] as api.HouseholdMember[];
const wrap = (child: ReactNode) =>
  render(
    <SavedDraftProvider
      account="account"
      household="home"
      households={['home']}
      context="THB:Asia/Bangkok"
    >
      {child}
    </SavedDraftProvider>,
  );
const expense = () =>
  wrap(
    <ExpenseWorkspace
      household={household}
      token="private-session"
      onMoneyChanged={vi.fn()}
    />,
  );
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.mocked(api.getMembers).mockResolvedValue(members);
  vi.mocked(api.getExpenses).mockResolvedValue([]);
  vi.mocked(api.getBills).mockResolvedValue([]);
  vi.mocked(api.getExpenseHistory).mockResolvedValue({
    events: [],
    hasMore: false,
  });
  vi.mocked(api.getAssistantConfig).mockResolvedValue({
    naturalLanguageEnabled: false,
    actionDraftsEnabled: true,
    supportedDraftKinds: ['shopping'],
  } as Awaited<ReturnType<typeof api.getAssistantConfig>>);
  vi.mocked(api.previewExpense).mockImplementation(
    async (_token, _home, draft) => ({
      ...draft,
      splitMethod: 'equal',
      shares: members.map((m) => ({
        memberId: m.id,
        displayName: m.displayName,
        amountMinor: draft.amountMinor / 2,
      })),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('expense restores raw inputs, requires a fresh API preview and retries an interrupted confirmation with the same key', async () => {
  const user = userEvent.setup();
  const first = expense();
  await user.click(screen.getByRole('button', { name: 'Add expense' }));
  await waitFor(() => expect(api.getMembers).toHaveBeenCalled());
  await user.type(screen.getByLabelText('What was it for?'), 'Groceries');
  await user.type(screen.getByLabelText('Total (THB)'), '280');
  await user.click(screen.getByRole('button', { name: /Preview shares/ }));
  vi.mocked(api.createExpense).mockRejectedValue(
    new api.ApiRequestError(0, 'NETWORK_ERROR', 'Connection lost'),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Confirm expense' }),
  );
  await screen.findByText(/Not yet confirmed: HouseMate/);
  const original = vi.mocked(api.createExpense).mock.calls[0].slice(2);
  const stored =
    localStorage.getItem(draftKey('account', 'home', 'expense')) ?? '';
  expect(stored).not.toContain('private-session');
  expect(stored).not.toContain('displayName');
  expect(stored).not.toContain('preview');
  first.unmount();
  expense();
  await user.click(await screen.findByRole('button', { name: 'Resume draft' }));
  expect(
    (screen.getByLabelText('What was it for?') as HTMLInputElement).value,
  ).toBe('Groceries');
  expect(screen.queryByRole('button', { name: 'Confirm expense' })).toBeNull();
  expect(api.createExpense).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: /Preview shares/ }));
  expect(api.previewExpense).toHaveBeenCalledTimes(2);
  await user.click(
    await screen.findByRole('button', { name: 'Confirm expense' }),
  );
  await waitFor(() => expect(api.createExpense).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.createExpense).mock.calls[1].slice(2)).toEqual(original);
});

test('bill restores adjustments and explicitly empty participants instead of defaulting them to everyone', async () => {
  const key = draftKey('account', 'home', 'bill');
  localStorage.setItem(
    key,
    JSON.stringify({
      version: 1,
      accountId: 'account',
      householdId: 'home',
      kind: 'bill',
      context: 'THB:Asia/Bangkok',
      savedAt: Date.now(),
      attempt: null,
      value: {
        title: 'Power',
        billType: 'electricity',
        provider: 'Electric Co',
        amount: '1500',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        dueDate: '2026-11-01',
        payer: 'one',
        paymentStatus: 'unpaid',
        participants: [],
        rows: [
          {
            id: 'row-one',
            label: 'Aye credit',
            kind: 'individual_credit',
            amount: '70',
            memberIds: ['one'],
          },
        ],
      },
    }),
  );
  wrap(
    <BillWorkspace
      household={household}
      token="private-session"
      onMoneyChanged={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Resume draft' }));
  expect(
    (screen.getByDisplayValue('Electric Co') as HTMLInputElement).value,
  ).toBe('Electric Co');
  await user.click(screen.getByRole('button', { name: 'Continue to split' }));
  expect(screen.getByDisplayValue('Aye credit')).toBeTruthy();
  expect(screen.getByDisplayValue('70')).toBeTruthy();
  const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
  expect(saved.value.participants).toEqual([]);
  expect(saved.value.rows[0].memberIds).toEqual(['one']);
  expect(api.previewBill).not.toHaveBeenCalled();
});

test('assistant recovers edited fields with fresh household members and no provider call or automatic write', async () => {
  const action: api.AssistantActionDraft = {
    kind: 'shopping',
    householdId: 'home',
    timezone: 'Asia/Bangkok',
    generatedAt: new Date().toISOString(),
    members,
    recipientIds: [],
    unresolvedFields: [],
    notes: [],
    fields: {
      title: 'Eggs',
      quantity: null,
      unit: null,
      note: null,
      priority: 'normal',
      assignedBuyerMemberId: null,
      estimatedPriceMinor: null,
    },
  };
  vi.mocked(api.prepareAssistantDraft).mockResolvedValue({ draft: action });
  const user = userEvent.setup();
  const first = wrap(
    <AssistantWorkspace household={household} token="private-session" />,
  );
  await waitFor(() => expect(api.getAssistantConfig).toHaveBeenCalled());
  await user.type(
    screen.getByLabelText('Ask your own question'),
    'Add shopping eggs',
  );
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  const title = await screen.findByLabelText('Title');
  await user.clear(title);
  await user.type(title, 'Free range eggs');
  fireEvent.change(screen.getByLabelText('Optional quantity'), {
    target: { value: '12' },
  });
  first.unmount();
  wrap(<AssistantWorkspace household={household} token="private-session" />);
  await user.click(await screen.findByRole('button', { name: 'Resume draft' }));
  await waitFor(() =>
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Free range eggs',
    ),
  );
  expect(
    (screen.getByLabelText('Optional quantity') as HTMLInputElement).value,
  ).toBe('12');
  expect(api.getMembers).toHaveBeenCalledTimes(1);
  expect(api.askAssistant).not.toHaveBeenCalled();
  expect(api.prepareAssistantDraft).toHaveBeenCalledTimes(1);
  expect(api.createShoppingItem).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancel draft' }));
  expect(
    localStorage.getItem(draftKey('account', 'home', 'assistant')),
  ).toBeNull();
  expect(
    localStorage.getItem(
      draftKey('account', 'home', 'assistant-editor-shopping'),
    ),
  ).toBeNull();
});
