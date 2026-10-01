// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AssistantDraftReview } from '../components/assistant-draft-review';
import { draftMinor } from '../components/assistant-record-draft';
import { AssistantWorkspace } from '../components/assistant-workspace';
import type { AssistantActionDraft, Household } from '../lib/api';
import * as api from '../lib/api';

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  previewExpense: vi.fn(),
  previewBill: vi.fn(),
  createExpense: vi.fn(),
  createBill: vi.fn(),
  createShoppingItem: vi.fn(),
  createChore: vi.fn(),
  getAssistantConfig: vi.fn(),
  prepareAssistantDraft: vi.fn(),
  askAssistant: vi.fn(),
}));
const household = {
  id: 'home',
  name: 'Our home',
  timezone: 'Asia/Bangkok',
  defaultCurrency: 'THB',
  role: 'member',
} as Household;
const base = {
  householdId: 'home',
  timezone: 'Asia/Bangkok',
  generatedAt: '2026-10-02T00:00:00Z',
  members: [
    { id: 'one', displayName: 'Aye' },
    { id: 'two', displayName: 'Zaw' },
  ],
  recipientIds: [],
  unresolvedFields: ['Choose intended people and check amounts.'],
  notes: ['Nothing is saved before confirmation.'],
};
const shopping: AssistantActionDraft = {
  ...base,
  kind: 'shopping',
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
const chore: AssistantActionDraft = {
  ...base,
  kind: 'chore',
  fields: {
    title: 'Clean kitchen',
    note: null,
    dueAtLocal: '',
    assigneeMemberId: '',
  },
};
const expense: AssistantActionDraft = {
  ...base,
  kind: 'expense',
  fields: {
    title: 'Dinner',
    amountMinor: 50001,
    currency: 'THB',
    spentOn: '',
    payerMemberId: '',
    split: { method: 'equal', shares: [] },
  },
};
const bill: AssistantActionDraft = {
  ...base,
  kind: 'bill',
  fields: {
    title: 'Power',
    billType: 'electricity',
    provider: '',
    amountMinor: 210657,
    currency: 'THB',
    periodStart: '',
    periodEnd: '',
    dueDate: '',
    payerMemberId: '',
    paymentStatus: 'unpaid',
    sharedParticipantIds: [],
    adjustments: [],
  },
};
const published = vi.fn();
const cancelled = vi.fn();
const lost = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  for (const fn of [
    api.createShoppingItem,
    api.createChore,
    api.createExpense,
    api.createBill,
  ])
    vi.mocked(fn).mockResolvedValue({ id: 'saved' } as never);
  vi.mocked(api.previewExpense).mockImplementation(
    async (_token, _home, draft) => ({
      ...draft,
      splitMethod: draft.split.method,
      shares: [
        { memberId: 'one', displayName: 'Aye', amountMinor: 25001 },
        { memberId: 'two', displayName: 'Zaw', amountMinor: 25000 },
      ],
    }),
  );
  vi.mocked(api.previewBill).mockImplementation(
    async (_token, _home, draft) => ({
      ...draft,
      baseMinor: 210557,
      chargeMinor: 100,
      creditMinor: 0,
      shares: [
        {
          memberId: 'one',
          displayName: 'Aye',
          amountMinor: 105378,
          baseMinor: 105278,
          adjustmentMinor: 100,
        },
        {
          memberId: 'two',
          displayName: 'Zaw',
          amountMinor: 105279,
          baseMinor: 105279,
          adjustmentMinor: 0,
        },
      ],
      adjustmentBreakdown: draft.adjustments.map((row) => ({
        ...row,
        shares: [
          {
            memberId: row.memberIds[0],
            displayName: 'Aye',
            amountMinor: row.amountMinor,
          },
        ],
      })),
    }),
  );
});
afterEach(cleanup);
function show(draft: AssistantActionDraft) {
  return render(
    <main>
      <AssistantDraftReview
        draft={draft}
        household={household}
        token="token"
        onCancel={cancelled}
        onPublished={published}
        onAccessLost={lost}
      />
    </main>,
  );
}
async function fillMoney(
  user: ReturnType<typeof userEvent.setup>,
  kind: 'expense' | 'bill',
) {
  await user.selectOptions(screen.getByLabelText('Payer'), 'one');
  const participants = screen.getByRole('group', {
    name: kind === 'expense' ? 'Participants' : 'Shared base participants',
  });
  await user.click(within(participants).getByRole('checkbox', { name: 'Aye' }));
  await user.click(within(participants).getByRole('checkbox', { name: 'Zaw' }));
  if (kind === 'expense')
    fireEvent.change(screen.getByLabelText('Expense date'), {
      target: { value: '2026-10-02' },
    });
  else {
    await user.type(screen.getByLabelText('Provider'), 'Electric Co');
    for (const [label, value] of [
      ['Period start', '2026-09-01'],
      ['Period end', '2026-09-30'],
      ['Due date', '2026-10-10'],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
test('money input conversion is exact and rejects sub-cent, signed, exponent and unsafe input', () => {
  expect(draftMinor('500.01')).toBe(50001);
  expect(draftMinor('0')).toBe(0);
  for (const value of ['1.005', '-1', '1e3', 'Infinity', '10000000000', 'NaN'])
    expect(draftMinor(value)).toBeNull();
});
test('shopping review is editable and cancellation performs no writes; structural accessibility passes', async () => {
  const user = userEvent.setup();
  show(shopping);
  await user.type(screen.getByLabelText('Optional quantity'), '2');
  await user.type(screen.getByLabelText('Optional unit'), 'packs');
  await user.selectOptions(screen.getByLabelText('Buyer'), 'two');
  await user.type(
    screen.getByLabelText('Optional estimated price (THB)'),
    '100.01',
  );
  const check = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(check.violations).toEqual([]);
  await user.click(screen.getByRole('button', { name: 'Review draft' }));
  expect(screen.getByText('Buyer: Zaw · Priority: normal')).toBeTruthy();
  expect(api.createShoppingItem).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Edit draft' }));
  expect(screen.getByLabelText('Optional quantity')).toHaveProperty(
    'value',
    '2',
  );
  await user.click(screen.getByRole('button', { name: 'Cancel draft' }));
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(api.createShoppingItem).not.toHaveBeenCalled();
});
test('shopping interrupted confirmation freezes payload/key through a later rejection and explicit retry', async () => {
  vi.mocked(api.createShoppingItem)
    .mockRejectedValueOnce(
      new api.ApiRequestError(0, 'NETWORK_ERROR', 'Lost response'),
    )
    .mockRejectedValueOnce(
      new api.ApiRequestError(400, 'INVALID_BUYER', 'Buyer changed'),
    );
  const user = userEvent.setup();
  show(shopping);
  await user.click(screen.getByRole('button', { name: 'Review draft' }));
  await user.click(screen.getByRole('button', { name: 'Confirm and save' }));
  await screen.findByRole('alert');
  const first = vi.mocked(api.createShoppingItem).mock.calls[0];
  expect(screen.getByRole('button', { name: 'Edit draft' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.getByRole('button', { name: 'Cancel draft' })).toHaveProperty(
    'disabled',
    true,
  );
  await user.click(screen.getByRole('button', { name: 'Retry confirmation' }));
  await screen.findByText('Buyer changed');
  expect(vi.mocked(api.createShoppingItem).mock.calls[1]).toEqual(first);
  expect(screen.getByRole('button', { name: 'Edit draft' })).toHaveProperty(
    'disabled',
    true,
  );
  await user.click(screen.getByRole('button', { name: 'Retry confirmation' }));
  await waitFor(() =>
    expect(published).toHaveBeenCalledWith('shopping', 'saved', 'Eggs'),
  );
  expect(vi.mocked(api.createShoppingItem).mock.calls[2]).toEqual(first);
  expect(first[3]).toEqual(expect.any(String));
});
test('chore shows unresolved fields and saves only the edited reviewed assignee/time', async () => {
  const user = userEvent.setup();
  show(chore);
  expect(screen.getByText('Choose an assignee.')).toBeTruthy();
  await user.selectOptions(screen.getByLabelText('Assignee'), 'two');
  fireEvent.change(screen.getByLabelText('Due date and time (Asia/Bangkok)'), {
    target: { value: '2099-10-03T19:00' },
  });
  await user.click(screen.getByRole('button', { name: 'Review draft' }));
  expect(api.createChore).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Confirm and save' }));
  await waitFor(() =>
    expect(published).toHaveBeenCalledWith('chore', 'saved', 'Clean kitchen'),
  );
  expect(api.createChore).toHaveBeenCalledWith(
    'token',
    'home',
    {
      title: 'Clean kitchen',
      note: null,
      dueAtLocal: '2099-10-03T19:00',
      assigneeMemberId: 'two',
    },
    expect.any(String),
  );
});
test.each(['equal', 'exact', 'percentage', 'ratio'] as const)(
  'expense %s uses an API-calculated preview before confirmation',
  async (method) => {
    const user = userEvent.setup();
    show(expense);
    await fillMoney(user, 'expense');
    await user.selectOptions(screen.getByLabelText('Split method'), method);
    if (method !== 'equal') {
      const unit =
        method === 'exact'
          ? 'THB'
          : method === 'percentage'
            ? '%'
            : 'ratio units';
      await user.type(
        screen.getByLabelText(`Aye share (${unit})`),
        method === 'exact' ? '250.01' : method === 'percentage' ? '50' : '1',
      );
      await user.type(
        screen.getByLabelText(`Zaw share (${unit})`),
        method === 'exact' ? '250.00' : method === 'percentage' ? '50' : '1',
      );
    }
    await user.click(
      screen.getByRole('button', { name: 'Calculate and review' }),
    );
    await screen.findByText('API-calculated shares');
    expect(api.createExpense).not.toHaveBeenCalled();
    expect(screen.getByText(/Aye:.*250.01/)).toBeTruthy();
    const requested = vi.mocked(api.previewExpense).mock.calls[0][2];
    expect(requested.amountMinor).toBe(50001);
    expect(requested.split.method).toBe(method);
    if (method === 'percentage')
      expect(requested.split.shares[0].value).toBe(5000);
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }));
    await waitFor(() =>
      expect(published).toHaveBeenCalledWith('expense', 'saved', 'Dinner'),
    );
    expect(vi.mocked(api.createExpense).mock.calls[0][2]).toEqual(requested);
  },
);
test('bill includes reviewed hybrid adjustment details and API shares; editing invalidates the preview', async () => {
  const user = userEvent.setup();
  show(bill);
  await fillMoney(user, 'bill');
  await user.click(screen.getByRole('button', { name: 'Add adjustment' }));
  await user.type(screen.getByLabelText('Adjustment label'), 'Special use');
  await user.type(screen.getByLabelText('Adjustment amount (THB)'), '1.00');
  await user.click(
    within(screen.getByRole('group', { name: 'Adjustment members' })).getByRole(
      'checkbox',
      { name: 'Aye' },
    ),
  );
  await user.click(
    screen.getByRole('button', { name: 'Calculate and review' }),
  );
  await screen.findByText('API-calculated shares');
  expect(api.createBill).not.toHaveBeenCalled();
  expect(screen.getByText(/Special use.*individual charge/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Edit draft' }));
  expect(screen.queryByText('API-calculated shares')).toBeNull();
  await user.selectOptions(
    screen.getByLabelText('Provider payment status'),
    'paid',
  );
  await user.click(
    screen.getByRole('button', { name: 'Calculate and review' }),
  );
  await screen.findByText('API-calculated shares');
  await user.click(screen.getByRole('button', { name: 'Confirm and save' }));
  await waitFor(() =>
    expect(published).toHaveBeenCalledWith('bill', 'saved', 'Power'),
  );
  expect(vi.mocked(api.createBill).mock.calls[0][2]).toMatchObject({
    paymentStatus: 'paid',
    adjustments: [
      {
        label: 'Special use',
        kind: 'individual_charge',
        amountMinor: 100,
        memberIds: ['one'],
      },
    ],
  });
});
test('preview failure retains fields; definitive first save rejection permits correction; access loss clears through parent', async () => {
  vi.mocked(api.previewExpense).mockRejectedValueOnce(
    new api.ApiRequestError(400, 'INVALID_SPLIT', 'Shares do not total'),
  );
  vi.mocked(api.createExpense)
    .mockRejectedValueOnce(
      new api.ApiRequestError(400, 'INVALID_MEMBER', 'Choose active members'),
    )
    .mockRejectedValueOnce(
      new api.ApiRequestError(404, 'NOT_FOUND', 'Household not found'),
    );
  const user = userEvent.setup();
  show(expense);
  await fillMoney(user, 'expense');
  await user.click(
    screen.getByRole('button', { name: 'Calculate and review' }),
  );
  await screen.findByText('Shares do not total');
  expect(screen.getByLabelText('Total (THB)')).toHaveProperty(
    'value',
    '500.01',
  );
  await user.click(
    screen.getByRole('button', { name: 'Calculate and review' }),
  );
  await screen.findByText('API-calculated shares');
  await user.click(screen.getByRole('button', { name: 'Confirm and save' }));
  await screen.findByText('Choose active members');
  expect(
    screen.getByRole('button', { name: 'Calculate and review' }),
  ).toBeTruthy();
  await user.click(
    screen.getByRole('button', { name: 'Calculate and review' }),
  );
  await screen.findByText('API-calculated shares');
  await user.click(screen.getByRole('button', { name: 'Confirm and save' }));
  await waitFor(() => expect(lost).toHaveBeenCalledWith('Household not found'));
});
test('pending writes block duplicate confirmation and unmounted drafts discard late replies', async () => {
  let finish!: (value: never) => void;
  vi.mocked(api.createChore).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  const view = show({
    ...chore,
    fields: {
      ...chore.fields,
      assigneeMemberId: 'one',
      dueAtLocal: '2099-01-01T10:00',
    },
  });
  await user.click(screen.getByRole('button', { name: 'Review draft' }));
  await user.click(screen.getByRole('button', { name: 'Confirm and save' }));
  expect(screen.getByRole('button', { name: 'Saving…' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(api.createChore).toHaveBeenCalledTimes(1);
  view.unmount();
  await act(async () => finish({ id: 'saved' } as never));
  expect(published).not.toHaveBeenCalled();
});
test('chat drafts shopping locally without Gemini consent and links the explicitly saved record', async () => {
  vi.mocked(api.getAssistantConfig).mockResolvedValue({
    naturalLanguageEnabled: false,
    actionDraftsEnabled: true,
    provider: null,
    requiresPrivacyAcknowledgement: true,
    supportedDraftKinds: ['shopping'],
  });
  vi.mocked(api.prepareAssistantDraft).mockResolvedValue({ draft: shopping });
  const user = userEvent.setup();
  render(<AssistantWorkspace token="token" household={household} />);
  const input = screen.getByRole('textbox', { name: 'Ask your own question' });
  await waitFor(() => expect(input).toHaveProperty('disabled', false));
  await user.type(input, 'Add shopping eggs');
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  await screen.findByText('Draft shopping item');
  expect(api.askAssistant).not.toHaveBeenCalled();
  expect(api.createShoppingItem).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Review draft' }));
  await user.click(screen.getByRole('button', { name: 'Confirm and save' }));
  await screen.findByText('Shopping item saved: Eggs');
  expect(
    screen
      .getByRole('link', { name: 'Open published record' })
      .getAttribute('href'),
  ).toBe('/house?view=shopping&household=home&item=saved');
});

test.each([
  'individual_charge',
  'shared_charge',
  'individual_credit',
  'shared_credit',
] as const)(
  'hybrid bill %s remains explicit and is calculated only by the API',
  async (kind) => {
    const user = userEvent.setup();
    show(bill);
    await fillMoney(user, 'bill');
    await user.click(screen.getByRole('button', { name: 'Add adjustment' }));
    await user.type(
      screen.getByLabelText('Adjustment label'),
      'Explicit adjustment',
    );
    await user.selectOptions(screen.getByLabelText('Adjustment kind'), kind);
    await user.type(screen.getByLabelText('Adjustment amount (THB)'), '1.01');
    const group = screen.getByRole('group', { name: 'Adjustment members' });
    await user.click(within(group).getByRole('checkbox', { name: 'Aye' }));
    if (kind.startsWith('shared'))
      await user.click(within(group).getByRole('checkbox', { name: 'Zaw' }));
    await user.click(
      screen.getByRole('button', { name: 'Calculate and review' }),
    );
    await screen.findByText('API-calculated shares');
    expect(api.createBill).not.toHaveBeenCalled();
    expect(vi.mocked(api.previewBill).mock.calls[0][2].adjustments).toEqual([
      {
        label: 'Explicit adjustment',
        kind,
        amountMinor: 101,
        memberIds: kind.startsWith('shared') ? ['one', 'two'] : ['one'],
      },
    ]);
  },
);
