// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { EventWorkspace } from '../components/event-workspace';
import * as api from '../lib/api';
import {
  clearRecentReads,
  householdReadPath,
  readGeneration,
  rememberRead,
} from '../lib/recent-reads';

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  getEvents: vi.fn(),
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
  clearRecentReads();
  rememberRead(
    'session',
    householdReadPath('home', 'events?scope=upcoming&limit=50&offset=0'),
    { events: [event] },
    readGeneration(),
  );
  vi.mocked(api.getEvents).mockReset();
});
afterEach(() => {
  cleanup();
  clearRecentReads();
  vi.restoreAllMocks();
});
test('recent event rows remain visible during a fresh read and are replaced by its result', async () => {
  let finish!: (value: api.HouseholdEvent[]) => void;
  vi.mocked(api.getEvents).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<EventWorkspace household={household} token="session" compact />);
  expect(screen.getByText('House dinner')).toBeTruthy();
  expect(screen.getByText(/Last updated.*Updating/)).toBeTruthy();
  expect(api.getEvents).toHaveBeenCalledTimes(1);
  await act(async () => finish([{ ...event, title: 'Updated dinner' }]));
  expect(screen.queryByText('House dinner')).toBeNull();
  expect(screen.getByText('Updated dinner')).toBeTruthy();
});
test('a refresh network failure retains the snapshot with an outdated warning', async () => {
  vi.mocked(api.getEvents).mockRejectedValueOnce(
    new Error('Network unavailable'),
  );
  render(<EventWorkspace household={household} token="session" compact />);
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    expect.stringContaining('may be out of date'),
  );
  expect(screen.getByText('House dinner')).toBeTruthy();
});
test('lost household access clears the retained snapshot from the view', async () => {
  vi.mocked(api.getEvents).mockRejectedValueOnce(
    new api.ApiRequestError(403, 'FORBIDDEN', 'No access'),
  );
  render(<EventWorkspace household={household} token="session" compact />);
  await screen.findByRole('alert');
  expect(screen.queryByText('House dinner')).toBeNull();
});
