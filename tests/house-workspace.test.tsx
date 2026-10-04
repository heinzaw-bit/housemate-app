// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseWorkspace } from '../components/house-workspace';
import * as api from '../lib/api';

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  getMembers: vi.fn(),
  getAnnouncements: vi.fn(),
  getAnnouncement: vi.fn(),
  acknowledgeAnnouncement: vi.fn(),
  getEvents: vi.fn(),
  getEvent: vi.fn(),
  respondToEvent: vi.fn(),
  getHouseActions: vi.fn(),
}));
vi.mock('../components/chore-workspace', () => ({
  ChoreWorkspace: ({ focusedId }: { focusedId: string }) => (
    <p>Earlier chore {focusedId}</p>
  ),
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

test('Board starts with just two sections and one announcement creation action', async () => {
  render(<HouseWorkspace household={household} token="session" />);
  // The initial lazy import may take longer under the full parallel suite.
  await screen.findByRole(
    'button',
    { name: /Building inspection/ },
    { timeout: 5000 },
  );
  const nav = screen.getByRole('navigation', { name: 'Board sections' });
  expect(
    within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Announcements', 'Events']);
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
  await screen.findByRole('button', { name: 'New announcement' });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Events' })),
  );
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
  window.history.replaceState(null, '', '/house?household=home&chore=earlier');
  render(<HouseWorkspace household={household} token="session" />);
  await screen.findByText('Earlier chore earlier');
  expect(
    screen.getByRole('button', { name: 'Back to announcements' }),
  ).toBeTruthy();
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
