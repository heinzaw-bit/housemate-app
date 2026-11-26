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
import axe from 'axe-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseWorkspace } from '../components/house-workspace';
import '../components/poll-workspace';
import * as api from '../lib/api';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  getMembers: vi.fn(),
  getAnnouncements: vi.fn(),
  getAnnouncement: vi.fn(),
  acknowledgeAnnouncement: vi.fn(),
  createAnnouncement: vi.fn(),
  createEvent: vi.fn(),
  getEvents: vi.fn(),
  getEvent: vi.fn(),
  respondToEvent: vi.fn(),
  getMeals: vi.fn(),
  getMeal: vi.fn(),
  createMeal: vi.fn(),
  respondToMeal: vi.fn(),
  setMealCookingRoles: vi.fn(),
  getPolls: vi.fn(),
  createPoll: vi.fn(),
  getShoppingItems: vi.fn(),
  getShoppingItem: vi.fn(),
  createShoppingItem: vi.fn(),
  previewExpense: vi.fn(),
  purchaseShoppingItem: vi.fn(),
  purchaseShoppingWithExpense: vi.fn(),
  getChores: vi.fn(),
  getChore: vi.fn(),
  createChore: vi.fn(),
  completeChore: vi.fn(),
  getHouseActions: vi.fn(),
}));
const household: api.Household = {
  id: 'home',
  name: 'Our home',
  role: 'member',
  timezone: 'Asia/Bangkok',
  defaultCurrency: 'THB',
  currencyEditable: false,
  createdAt: '2026-01-01T00:00:00Z',
};
const announcement: api.Announcement = {
  id: 'notice',
  householdId: 'home',
  title: 'Building inspection',
  body: 'Please clear the hallway.',
  priority: 'important',
  requiresAcknowledgement: true,
  expiresAt: null,
  timezone: household.timezone,
  publishedAt: '2026-10-01T10:00:00Z',
  authorDisplayName: 'Aye',
  viewerMemberId: 'one',
  recipients: [
    { memberId: 'one', displayName: 'Aye', active: true, acknowledgedAt: null },
  ],
  counts: { total: 1, acknowledged: 0, awaiting: 1 },
  expired: false,
  canAcknowledge: true,
};
const event: api.HouseholdEvent = {
  id: 'dinner',
  householdId: 'home',
  title: 'House dinner',
  description: 'Bring something to share.',
  location: 'Kitchen',
  startsAt: '2030-10-05T12:00:00Z',
  endsAt: null,
  timezone: household.timezone,
  createdAt: '2026-10-01T10:00:00Z',
  creatorDisplayName: 'Aye',
  viewerMemberId: 'one',
  attendees: [
    { memberId: 'one', displayName: 'Aye', response: null, respondedAt: null },
  ],
  counts: { going: 0, maybe: 0, notGoing: 0, awaiting: 1 },
  canRespond: true,
};
const meal: api.Meal = {
  id: 'meal-1',
  householdId: household.id,
  mealType: 'dinner',
  question: 'Who is joining Saturday dinner?',
  startsAt: '2030-10-05T12:00:00Z',
  responseDeadline: '2030-10-05T08:00:00Z',
  timezone: household.timezone,
  createdAt: '2026-10-01T10:00:00Z',
  creatorDisplayName: 'Aye',
  viewerMemberId: 'one',
  participants: [
    { memberId: 'one', displayName: 'Aye', response: null, respondedAt: null },
  ],
  counts: { joining: 0, notJoining: 0, maybe: 0, awaiting: 1 },
  cookingRoles: [],
  canRespond: true,
};
const member: api.HouseholdMember = {
  id: 'one',
  displayName: 'Aye',
  email: null,
  role: 'member',
  joinedAt: meal.createdAt,
};
const item: api.ShoppingItem = {
  id: 'item-1',
  householdId: 'home',
  title: 'Dish soap',
  quantity: 1,
  unit: 'bottle',
  note: null,
  priority: 'high',
  assignedBuyerMemberId: 'one',
  estimatedPriceMinor: 5000,
  currency: 'THB',
  status: 'assigned',
  assignedBuyerDisplayName: 'Aye',
  purchasedPriceMinor: null,
  purchasedByDisplayName: null,
  purchasedAt: null,
  cancelledAt: null,
  linkedExpenseId: null,
  linkedExpenseVoidedAt: null,
  createdByDisplayName: 'Aye',
  createdAt: meal.createdAt,
  updatedAt: meal.createdAt,
  revision: 1,
  viewerMemberId: 'one',
};
const chore: api.Chore = {
  id: 'chore-1',
  householdId: 'home',
  title: 'Clean the kitchen',
  note: null,
  dueAt: '2030-10-05T12:00:00Z',
  timezone: household.timezone,
  assigneeMemberId: 'one',
  assigneeDisplayName: 'Aye',
  status: 'open',
  skipReason: null,
  closedAt: null,
  closedByDisplayName: null,
  createdByDisplayName: 'Aye',
  createdAt: meal.createdAt,
  updatedAt: meal.createdAt,
  revision: 1,
  viewerMemberId: 'one',
  canManage: false,
  canComplete: true,
  canRequestSwap: true,
  pendingSwap: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/house?household=home');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(api.getMembers).mockResolvedValue([]);
  vi.mocked(api.getAnnouncements).mockResolvedValue([announcement]);
  vi.mocked(api.getAnnouncement).mockResolvedValue(announcement);
  vi.mocked(api.getEvents).mockResolvedValue([event]);
  vi.mocked(api.getEvent).mockResolvedValue(event);
  vi.mocked(api.getMeals).mockResolvedValue([meal]);
  vi.mocked(api.getMeal).mockResolvedValue(meal);
  vi.mocked(api.getPolls).mockResolvedValue([]);
  vi.mocked(api.getShoppingItems).mockResolvedValue([item]);
  vi.mocked(api.getShoppingItem).mockResolvedValue(item);
  vi.mocked(api.getChores).mockResolvedValue([chore]);
  vi.mocked(api.getChore).mockResolvedValue(chore);
  vi.mocked(api.respondToEvent).mockResolvedValue({
    ...event,
    attendees: [
      {
        ...event.attendees[0],
        response: 'going',
        respondedAt: '2026-10-04T00:00:00Z',
      },
    ],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openTool(name: string) {
  await act(async () => fireEvent.click(screen.getByRole('button', { name })));
}

test('Polls uses the House header to open and refocus its draft and refreshes on return', async () => {
  const visibility = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('visible');
  try {
    render(<HouseWorkspace household={household} token="session" />);
    await openTool('Polls');
    await screen.findByText('No polls in this view yet.');
    const titleRow = screen.getByRole('heading', {
      name: 'House',
    }).parentElement;
    if (!titleRow) throw new Error('House title row is missing');
    const create = within(titleRow).getByRole('button', { name: 'New poll' });
    expect(screen.getAllByRole('button', { name: 'New poll' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Refresh polls' })).toBeNull();

    await act(async () => fireEvent.click(create));
    const question = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Question',
    });
    expect(document.activeElement).toBe(question);
    fireEvent.change(question, {
      target: { value: 'Which game should we play?' },
    });
    await act(async () => fireEvent.click(create));
    expect(question.value).toBe('Which game should we play?');
    expect(document.activeElement).toBe(question);
    expect(api.createPoll).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Cancel poll draft' }),
      ),
    );
    expect(screen.queryByRole('textbox', { name: 'Question' })).toBeNull();

    vi.mocked(api.getPolls).mockClear();
    await act(async () => fireEvent.focus(window));
    expect(api.getPolls).toHaveBeenCalledExactlyOnceWith(
      'session',
      'home',
      'open',
      50,
      0,
    );
  } finally {
    visibility.mockRestore();
  }
});

test('shopping keeps the header draft and confirms a purchase without adding an expense', async () => {
  vi.mocked(api.getMembers).mockResolvedValue([member]);
  const created = {
    ...item,
    id: 'item-2',
    title: 'Laundry detergent',
    status: 'needed',
    estimatedPriceMinor: null,
  } as const;
  vi.mocked(api.createShoppingItem).mockImplementation(async () => {
    vi.mocked(api.getShoppingItems).mockResolvedValue([created, item]);
    vi.mocked(api.getShoppingItem).mockResolvedValue(created);
    return created;
  });
  vi.mocked(api.purchaseShoppingItem).mockResolvedValue({
    ...created,
    status: 'purchased',
    purchasedByDisplayName: member.displayName,
    purchasedPriceMinor: null,
  });
  render(<HouseWorkspace household={household} token="session" />);
  await openTool('Shopping');
  await screen.findByRole('button', { name: /Dish soap/ });
  expect(api.getShoppingItem).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Mark purchased' })).toBeNull();
  const create = screen.getByRole('button', { name: 'New item' });
  await act(async () => fireEvent.click(create));
  const name = screen.getByRole<HTMLInputElement>('textbox', {
    name: 'Item name',
  });
  expect(document.activeElement).toBe(name);
  fireEvent.change(name, { target: { value: created.title } });
  await act(async () => fireEvent.click(create));
  expect(name.value).toBe(created.title);
  expect(api.createShoppingItem).not.toHaveBeenCalled();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Add item' })),
  );
  expect(api.createShoppingItem).toHaveBeenCalledExactlyOnceWith(
    'session',
    'home',
    expect.objectContaining({ title: created.title }),
    expect.any(String),
  );
  await act(async () =>
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark purchased' }),
    ),
  );
  expect(api.purchaseShoppingItem).not.toHaveBeenCalled();
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'New item' }),
  ).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Chores' }).disabled,
  ).toBe(true);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' })),
  );
  expect(api.purchaseShoppingItem).toHaveBeenCalledExactlyOnceWith(
    'session',
    'home',
    created.id,
    created.revision,
    null,
  );
  expect(api.purchaseShoppingWithExpense).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole('button', { name: 'History' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  expect(screen.getByText('Purchased by Aye.')).toBeTruthy();
});

test('shopping reviews the expense shares before confirming a linked purchase', async () => {
  vi.mocked(api.getMembers).mockResolvedValue([member]);
  const shares = [{ memberId: 'one', displayName: 'Aye', amountMinor: 5000 }];
  vi.mocked(api.previewExpense).mockImplementation(
    async (_token, _home, draft) => ({
      ...draft,
      splitMethod: draft.split.method,
      shares,
    }),
  );
  vi.mocked(api.purchaseShoppingWithExpense).mockImplementation(
    async (_token, _home, _item, _revision, draft) => ({
      item: {
        ...item,
        status: 'purchased',
        linkedExpenseId: 'expense-1',
        purchasedPriceMinor: 5000,
      },
      expense: {
        ...draft,
        id: 'expense-1',
        householdId: 'home',
        splitMethod: draft.split.method,
        splitInput: draft.split,
        shares,
        payerDisplayName: 'Aye',
        createdByDisplayName: 'Aye',
        createdAt: meal.createdAt,
        updatedAt: meal.createdAt,
        revision: 1,
        canEdit: true,
        canVoid: true,
        voidedAt: null,
        voidedByDisplayName: null,
        voidReason: null,
      },
    }),
  );
  render(<HouseWorkspace household={household} token="session" />);
  await openTool('Shopping');
  const row = await screen.findByRole('button', { name: /Dish soap/ });
  await act(async () => fireEvent.click(row));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Mark purchased' }),
  );
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Add a shared expense' }),
  );
  const confirm = screen.getByRole<HTMLButtonElement>('button', {
    name: 'Confirm purchase and expense',
  });
  expect(confirm.disabled).toBe(true);
  await act(async () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview expense shares' }),
    ),
  );
  expect(api.previewExpense).toHaveBeenCalledExactlyOnceWith(
    'session',
    'home',
    expect.objectContaining({ amountMinor: 5000, payerMemberId: 'one' }),
  );
  expect(api.purchaseShoppingWithExpense).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(confirm));
  expect(api.purchaseShoppingWithExpense).toHaveBeenCalledExactlyOnceWith(
    'session',
    'home',
    item.id,
    item.revision,
    vi.mocked(api.previewExpense).mock.calls[0][2],
    expect.any(String),
  );
  expect(
    screen
      .getByRole('link', { name: 'View linked expense' })
      .getAttribute('href'),
  ).toContain('record=expense-1');
});

test('chores opens on assignments and keeps creation and completion in their own views', async () => {
  vi.mocked(api.getMembers).mockResolvedValue([member]);
  const created = { ...chore, id: 'chore-2', title: 'Take out recycling' };
  vi.mocked(api.createChore).mockImplementation(async () => {
    vi.mocked(api.getChores).mockResolvedValue([created, chore]);
    vi.mocked(api.getChore).mockResolvedValue(created);
    return created;
  });
  vi.mocked(api.completeChore).mockResolvedValue({
    ...created,
    status: 'completed',
    closedAt: meal.createdAt,
    closedByDisplayName: 'Aye',
  });
  render(<HouseWorkspace household={household} token="session" />);
  await openTool('Chores');
  const row = await screen.findByRole('button', { name: /Clean the kitchen/ });
  expect(
    screen
      .getByRole('button', { name: 'Assigned to me' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  expect(api.getChore).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(row));
  const title = await screen.findByRole('heading', { name: chore.title });
  expect(document.activeElement).toBe(title.closest('[data-slot="card"]'));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Back to chores' })),
  );
  await waitFor(() => expect(document.activeElement).toBe(row));
  const create = screen.getByRole('button', { name: 'New chore' });
  await act(async () => fireEvent.click(create));
  const name = screen.getByRole<HTMLInputElement>('textbox', {
    name: 'Chore name',
  });
  expect(document.activeElement).toBe(name);
  fireEvent.change(name, { target: { value: created.title } });
  await act(async () => fireEvent.click(create));
  expect(name.value).toBe(created.title);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Create chore' })),
  );
  expect(api.createChore).toHaveBeenCalledExactlyOnceWith(
    'session',
    'home',
    expect.objectContaining({ title: created.title, assigneeMemberId: 'one' }),
    expect.any(String),
  );
  await act(async () =>
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark complete' }),
    ),
  );
  expect(api.completeChore).toHaveBeenCalledExactlyOnceWith(
    'session',
    'home',
    created.id,
    created.revision,
  );
  expect(
    screen
      .getByRole('button', { name: 'History' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
});

test('Meals opens with a list and lets a member publish through the House header', async () => {
  vi.mocked(api.getMembers).mockResolvedValue([
    {
      id: 'one',
      displayName: 'Aye',
      email: null,
      role: 'member',
      joinedAt: meal.createdAt,
    },
  ]);
  vi.mocked(api.createMeal).mockResolvedValue({
    ...meal,
    question: 'Sunday breakfast?',
  });
  vi.mocked(api.getMeal).mockResolvedValue({
    ...meal,
    question: 'Sunday breakfast?',
  });
  render(<HouseWorkspace household={household} token="session" />);
  expect(api.getMeals).not.toHaveBeenCalled();
  await openTool('Meals');
  const row = await screen.findByRole('button', {
    name: /Who is joining Saturday dinner/,
  });
  expect(within(row).getByText('Reply needed')).toBeTruthy();
  expect(api.getMeal).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: meal.question })).toBeNull();

  const create = screen.getByRole('button', { name: 'New meal' });
  await act(async () => fireEvent.click(create));
  const question = screen.getByRole<HTMLInputElement>('textbox', {
    name: 'Question',
  });
  expect(document.activeElement).toBe(question);
  fireEvent.change(question, { target: { value: 'Sunday breakfast?' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Meal type' }), {
    target: { value: 'breakfast' },
  });
  await act(async () => fireEvent.click(create));
  expect(question.value).toBe('Sunday breakfast?');
  expect(document.activeElement).toBe(question);
  expect(api.createMeal).not.toHaveBeenCalled();
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Events' }).disabled,
  ).toBe(true);

  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Publish meal check' })),
  );
  expect(api.createMeal).toHaveBeenCalledExactlyOnceWith(
    'session',
    'home',
    expect.objectContaining({
      mealType: 'breakfast',
      question: 'Sunday breakfast?',
      participantIds: ['one'],
      idempotencyKey: expect.any(String),
    }),
  );
  await screen.findByRole('heading', { name: 'Sunday breakfast?' });
  expect(screen.getByText('Meal check published.')).toBeTruthy();
});

test('Meals supports replies, editing cooking roles and returning to the list', async () => {
  const replied: api.Meal = {
    ...meal,
    participants: [
      {
        ...meal.participants[0],
        response: 'joining',
        respondedAt: meal.createdAt,
      },
    ],
    counts: { ...meal.counts, joining: 1, awaiting: 0 },
  };
  vi.mocked(api.respondToMeal).mockResolvedValue(replied);
  vi.mocked(api.setMealCookingRoles).mockResolvedValue({
    ...replied,
    cookingRoles: [{ memberId: 'one', displayName: 'Aye', role: 'Cook' }],
  });
  render(<HouseWorkspace household={household} token="session" />);
  await openTool('Meals');
  const row = await screen.findByRole('button', {
    name: /Who is joining Saturday dinner/,
  });
  await act(async () => fireEvent.click(row));
  const title = await screen.findByRole('heading', { name: meal.question });
  expect(document.activeElement).toBe(title.closest('[data-slot="card"]'));
  const reply = screen.getByRole('button', { name: 'Joining' });
  await act(async () => fireEvent.click(reply));
  expect(api.respondToMeal).toHaveBeenCalledExactlyOnceWith(
    'session',
    'home',
    meal.id,
    'joining',
  );
  expect(reply.getAttribute('aria-pressed')).toBe('true');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Edit cooking roles' })),
  );
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Member for cooking role' }),
    { target: { value: 'one' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
  expect(api.setMealCookingRoles).not.toHaveBeenCalled();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Save cooking roles' })),
  );
  expect(api.setMealCookingRoles).toHaveBeenCalledExactlyOnceWith(
    'session',
    'home',
    meal.id,
    [{ memberId: 'one', role: 'Cook' }],
  );
  expect(screen.getByText('Aye · Cook')).toBeTruthy();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Back to meals' })),
  );
  expect(screen.queryByRole('heading', { name: meal.question })).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(row));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Past' })),
  );
  expect(api.getMeals).toHaveBeenLastCalledWith(
    'session',
    'home',
    'past',
    50,
    0,
  );
});

test('a meal notification opens its record even when it is outside the first list page', async () => {
  vi.mocked(api.getMeals).mockResolvedValue([]);
  const past = {
    ...meal,
    startsAt: '2020-10-05T12:00:00Z',
    responseDeadline: '2020-10-05T08:00:00Z',
    canRespond: false,
  };
  vi.mocked(api.getMeal).mockResolvedValue(past);
  window.history.replaceState(null, '', '/house?household=home&meal=meal-1');
  render(<HouseWorkspace household={household} token="session" />);
  await screen.findByRole('heading', { name: meal.question });
  expect(api.getMeal).toHaveBeenCalledWith('session', 'home', meal.id);
  expect(screen.queryByRole('button', { name: 'Joining' })).toBeNull();
  expect(screen.getByText('Responses are closed.')).toBeTruthy();
});

test('House opens with six unselected tools until a member chooses one', async () => {
  const page = render(<HouseWorkspace household={household} token="session" />);
  const nav = screen.getByRole('navigation', { name: 'House sections' });
  expect(
    within(nav)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label')),
  ).toEqual([
    'Meals',
    'Shopping',
    'Chores',
    'Events',
    'Announcements',
    'Polls',
  ]);
  expect(within(nav).queryAllByRole('button', { current: 'page' })).toEqual([]);
  expect(screen.queryByRole('button', { name: 'New announcement' })).toBeNull();
  expect(api.getAnnouncements).not.toHaveBeenCalled();
  await openTool('Announcements');
  await screen.findByRole(
    'button',
    { name: /Building inspection/ },
    { timeout: 5000 },
  );
  expect(within(nav).getByRole('button', { current: 'page' })).toBe(
    within(nav).getByRole('button', { name: 'Announcements' }),
  );
  expect(screen.getByRole('button', { name: 'New announcement' })).toBeTruthy();
  expect(screen.queryByText('Your next actions')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add…' })).toBeNull();
  expect(api.getHouseActions).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: 'Announcements' })).toBeNull();
  expect(screen.getByText('Acknowledgement needed')).toBeTruthy();
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(result.violations).toEqual([]);
  window.history.replaceState(null, '', '/house?household=home');
  page.rerender(<HouseWorkspace household={household} token="session" />);
  expect(within(nav).queryAllByRole('button', { current: 'page' })).toEqual([]);
  expect(
    screen.queryByRole('button', { name: /Building inspection/ }),
  ).toBeNull();
});

test('Board header opens the active draft without publishing or resetting it', async () => {
  render(<HouseWorkspace household={household} token="session" />);
  await openTool('Announcements');
  await screen.findByRole('button', { name: /Building inspection/ });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'New announcement' })),
  );
  const announcementTitle = screen.getByRole('textbox', {
    name: 'Title',
  });
  fireEvent.change(announcementTitle, { target: { value: 'Water update' } });
  const eventsTool = screen.getByRole('button', { name: 'Events' });
  expect((eventsTool as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(eventsTool);
  expect((announcementTitle as HTMLInputElement).value).toBe('Water update');
  expect(window.location.search).toBe('?household=home&view=announcements');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'New announcement' })),
  );
  expect((announcementTitle as HTMLInputElement).value).toBe('Water update');
  expect(document.activeElement).toBe(announcementTitle);
  await act(async () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel announcement draft' }),
    ),
  );
  expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull();
  expect(api.createAnnouncement).not.toHaveBeenCalled();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Events' })),
  );
  await screen.findByRole('button', { name: /House dinner/ });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'New event' })),
  );
  const eventTitle = screen.getByRole('textbox', { name: 'Event title' });
  fireEvent.change(eventTitle, { target: { value: 'Dinner together' } });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'New event' })),
  );
  expect((eventTitle as HTMLInputElement).value).toBe('Dinner together');
  expect(document.activeElement).toBe(eventTitle);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Cancel event draft' })),
  );
  expect(screen.queryByRole('textbox', { name: 'Event title' })).toBeNull();
  expect(api.createEvent).not.toHaveBeenCalled();
});

test('Board status refresh reloads the selected section without creating records', async () => {
  render(<HouseWorkspace household={household} token="session" />);
  await openTool('Announcements');
  await screen.findByRole('button', { name: /Building inspection/ });
  vi.mocked(api.getAnnouncements).mockClear();
  await act(async () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh announcements' }),
    ),
  );
  expect(api.getAnnouncements).toHaveBeenCalledTimes(1);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Events' })),
  );
  await screen.findByRole('button', { name: /House dinner/ });
  vi.mocked(api.getEvents).mockClear();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Refresh events' })),
  );
  expect(api.getEvents).toHaveBeenCalledExactlyOnceWith(
    'session',
    'home',
    'upcoming',
  );
  expect(api.createAnnouncement).not.toHaveBeenCalled();
  expect(api.createEvent).not.toHaveBeenCalled();
});

test('loaded notices prioritise active urgent/important items and open mobile detail', async () => {
  vi.mocked(api.getAnnouncements).mockResolvedValue([
    {
      ...announcement,
      id: 'normal',
      title: 'New ordinary notice',
      priority: 'normal',
      canAcknowledge: false,
      publishedAt: '2026-10-04T00:00:00Z',
    },
    announcement,
    {
      ...announcement,
      id: 'urgent',
      title: 'Water shutdown',
      priority: 'urgent',
    },
    {
      ...announcement,
      id: 'expired',
      title: 'Old urgent notice',
      priority: 'urgent',
      expired: true,
      canAcknowledge: false,
      publishedAt: '2026-09-01T00:00:00Z',
    },
  ]);
  render(<HouseWorkspace household={household} token="session" />);
  await openTool('Announcements');
  const ordinary = await screen.findByRole('button', {
    name: /New ordinary notice/,
  });
  const list = ordinary.parentElement;
  if (!list) throw new Error('Missing list');
  expect(
    within(list)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual([
    expect.stringContaining('Water shutdown'),
    expect.stringContaining('Building inspection'),
    expect.stringContaining('New ordinary notice'),
    expect.stringContaining('Old urgent notice'),
  ]);
  await act(async () =>
    fireEvent.click(
      screen.getByRole('button', { name: /Building inspection/ }),
    ),
  );
  expect(api.getAnnouncement).toHaveBeenCalledWith('session', 'home', 'notice');
  expect(screen.getByRole('button', { name: 'I have read this' })).toBeTruthy();
  await act(async () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to announcements' }),
    ),
  );
  expect(screen.queryByRole('button', { name: 'I have read this' })).toBeNull();
});

test('Events opens as a list, supports attendance and returns to the mobile list', async () => {
  render(<HouseWorkspace household={household} token="session" />);
  await openTool('Events');
  const row = await screen.findByRole('button', { name: /House dinner/ });
  expect(window.location.search).toBe('?household=home&view=events');
  expect(screen.getByRole('button', { name: 'New event' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Going' })).toBeNull();
  await act(async () => fireEvent.click(row));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Going' })),
  );
  expect(api.respondToEvent).toHaveBeenCalledWith(
    'session',
    'home',
    'dinner',
    'going',
  );
  expect(
    screen
      .getByRole('link', { name: 'Add expense from event' })
      .getAttribute('href'),
  ).toContain('&event=dinner');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Back to events' })),
  );
  expect(screen.queryByRole('button', { name: 'Going' })).toBeNull();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Past' })),
  );
  expect(api.getEvents).toHaveBeenCalledWith('session', 'home', 'past');
});

test('notification links still open a specific announcement and older chore records', async () => {
  window.history.replaceState(
    null,
    '',
    '/house?household=home&announcement=notice',
  );
  const view = render(<HouseWorkspace household={household} token="session" />);
  await screen.findByRole('button', { name: 'I have read this' });
  view.unmount();
  vi.mocked(api.getChores).mockResolvedValue([]);
  vi.mocked(api.getChore).mockResolvedValue({
    ...chore,
    id: 'earlier',
    title: 'Earlier chore',
  });
  window.history.replaceState(null, '', '/house?household=home&chore=earlier');
  render(<HouseWorkspace household={household} token="session" />);
  await screen.findByRole('heading', { name: 'Earlier chore' });
  expect(api.getChore).toHaveBeenCalledWith('session', 'home', 'earlier');
  expect(
    screen.getByRole('button', { name: 'Chores' }).getAttribute('aria-current'),
  ).toBe('page');
});

test('a past event notification opens its details even outside the first list page', async () => {
  const past = {
    ...event,
    startsAt: '2020-10-05T12:00:00Z',
    canRespond: false,
  };
  vi.mocked(api.getEvents).mockResolvedValue([]);
  vi.mocked(api.getEvent).mockResolvedValue(past);
  window.history.replaceState(null, '', '/house?household=home&event=dinner');
  render(<HouseWorkspace household={household} token="session" />);
  await screen.findByRole('link', { name: 'Add expense from event' });
  expect(api.getEvent).toHaveBeenCalledWith('session', 'home', 'dinner');
  expect(
    screen.getByRole('button', { name: 'Past' }).getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    screen.getByText('Attendance closed when this event started.'),
  ).toBeTruthy();
});
