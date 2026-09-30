// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NotificationBell } from '../components/notification-bell';
import * as api from '../lib/api';
import { clearPopupCheckpoint } from '../lib/notification-popups';

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getNotifications: vi.fn(),
  getNotificationPreferences: vi.fn(),
}));
const item = (
  id: string,
  overrides: Partial<api.NotificationItem> = {},
): api.NotificationItem => ({
  id,
  householdId: 'home',
  category: 'announcements',
  priority: 'normal',
  entityType: 'announcement',
  entityId: id,
  title: 'New announcement',
  body: `Announcement ${id}`,
  createdAt: '2026-09-30T12:00:01.000Z',
  readAt: null,
  href: `/house?household=home&section=announcements&announcement=${id}`,
  ...overrides,
});
const page = (
  notifications: api.NotificationItem[],
  nextCursor: string | null = null,
): api.NotificationPage => ({
  notifications,
  nextCursor,
  unreadCount: notifications.filter((entry) => !entry.readAt).length,
});
const feed = vi.mocked(api.getNotifications);
const prefs = vi.mocked(api.getNotificationPreferences);
const baseline = item('old', { createdAt: '2026-09-30T12:00:00.000Z' });
async function mount(householdId = 'home', accountId = 'member') {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <NotificationBell
        key={`${accountId}:${householdId}`}
        token="token"
        householdId={householdId}
        accountId={accountId}
      />,
    );
  });
  return view;
}
async function refresh() {
  await act(async () => {
    window.dispatchEvent(new Event('housemate.notifications.changed'));
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  for (const account of ['member', 'other'])
    for (const household of ['home', 'second'])
      clearPopupCheckpoint(account, household);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  feed.mockResolvedValue(page([baseline]));
  prefs.mockResolvedValue({
    categories: Object.fromEntries(
      api.notificationCategories.map((category) => [
        category,
        { inApp: true, webPush: false },
      ]),
    ) as api.NotificationPreferences['categories'],
    quietHours: { enabled: false, start: '23:00', end: '07:00' },
    timezone: 'Asia/Bangkok',
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('initial history is quiet; a new announcement links to its source and dismissal preserves unread count', async () => {
  await mount();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  expect(prefs).not.toHaveBeenCalled();
  const fresh = item('new');
  feed.mockResolvedValue(page([fresh, baseline]));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(
    screen
      .getByRole('link', { name: 'View Announcement new' })
      .getAttribute('href'),
  ).toBe(fresh.href);
  fireEvent.click(
    screen.getByRole('button', { name: 'Dismiss New announcement' }),
  );
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  expect(
    screen.getByRole('link', { name: 'Notifications, 2 unread' }),
  ).toBeTruthy();
  await refresh();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
});

test('assignment and shopping popups respect current preferences, read state, and source kind', async () => {
  await mount();
  const preferences = await prefs('token', 'home');
  preferences.categories.announcements.inApp = false;
  feed.mockResolvedValue(
    page([
      item('muted'),
      item('read', { readAt: '2026-09-30T12:00:02Z' }),
      item('reminder', { title: 'Announcement acknowledgement due' }),
      item('chore', {
        category: 'chores',
        entityType: 'chore',
        title: 'Chore assigned',
      }),
      item('shopping', {
        category: 'shopping',
        entityType: 'shopping',
        title: 'Shopping item added',
      }),
      baseline,
    ]),
  );
  await refresh();
  expect(
    screen
      .getAllByRole('article')
      .map((entry) => entry.getAttribute('aria-label')),
  ).toEqual(['Shopping item added', 'Chore assigned']);
});

test('auto-dismiss pauses for keyboard focus, pointer hover, and a hidden tab', async () => {
  await mount();
  feed.mockResolvedValue(page([item('new'), baseline]));
  await refresh();
  const popup = screen.getByRole('article');
  const view = screen.getByRole('link', { name: 'View Announcement new' });
  await act(async () => {
    view.focus();
    await vi.advanceTimersByTimeAsync(9_000);
  });
  expect(screen.getByRole('article')).toBeTruthy();
  fireEvent.pointerEnter(popup);
  await act(async () => {
    view.blur();
    await vi.advanceTimersByTimeAsync(9_000);
  });
  expect(screen.getByRole('article')).toBeTruthy();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  });
  fireEvent(document, new Event('visibilitychange'));
  fireEvent.pointerLeave(popup);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9_000);
  });
  expect(screen.getByRole('article')).toBeTruthy();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  fireEvent(document, new Event('visibilitychange'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8_000);
  });
  expect(screen.queryAllByRole('article')).toHaveLength(0);
});

test('route remounts do not replay shown notifications and account baselines stay separate', async () => {
  const first = await mount();
  feed.mockResolvedValue(page([item('new'), baseline]));
  await refresh();
  first.unmount();
  const second = await mount();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  second.unmount();
  await mount('home', 'other');
  expect(screen.queryAllByRole('article')).toHaveLength(0);
});

test('same-millisecond boundaries include every page; failed pagination is retried without losing entries', async () => {
  await mount();
  const sameTime = item('same', { createdAt: baseline.createdAt });
  feed
    .mockResolvedValueOnce(page([item('new')], 'cursor'))
    .mockRejectedValueOnce(new Error('Interrupted'));
  await refresh();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  feed
    .mockResolvedValueOnce(page([item('new')], 'cursor'))
    .mockResolvedValueOnce(page([sameTime, baseline]));
  await refresh();
  expect(feed).toHaveBeenLastCalledWith('token', 'home', 'all', 'cursor', 50);
  expect(screen.getAllByRole('article')).toHaveLength(2);
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Dismiss New announcement' })[0],
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Dismiss New announcement' }),
  );
  feed.mockResolvedValue(page([item('new'), sameTime, baseline]));
  await refresh();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
});

test('household switches discard late responses, and access loss removes visible popups', async () => {
  const first = await mount();
  let resolve!: (value: api.NotificationPage) => void;
  feed.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await refresh();
  first.unmount();
  feed.mockResolvedValue(page([]));
  await mount('second');
  await act(async () => {
    resolve(page([item('private'), baseline]));
  });
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  feed.mockResolvedValue(page([item('second', { householdId: 'second' })]));
  await refresh();
  expect(screen.getByRole('article')).toBeTruthy();
  feed.mockRejectedValue(
    new api.ApiRequestError(403, 'forbidden', 'Access lost'),
  );
  await refresh();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
});

test('hidden/offline polling skips reads and burst popups are capped at three without stealing focus', async () => {
  await mount();
  const bell = screen.getByRole('link', { name: 'Notifications, 1 unread' });
  bell.focus();
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: false,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(feed).toHaveBeenCalledTimes(1);
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  });
  await refresh();
  expect(feed).toHaveBeenCalledTimes(1);
  feed.mockResolvedValue(
    page([item('4'), item('3'), item('2'), item('1'), baseline]),
  );
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(document.activeElement).toBe(bell);
  expect(
    screen.getByRole('link', { name: 'Notifications, 5 unread' }),
  ).toBeTruthy();
});
