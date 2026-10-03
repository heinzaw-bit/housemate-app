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
import { NotificationWorkspace } from '../components/notification-workspace';
import * as api from '../lib/api';
import * as push from '../lib/web-push';

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  getNotifications: vi.fn(),
  getNotificationPreferences: vi.fn(),
  getPushConfig: vi.fn(),
  getPushDevices: vi.fn(),
  saveNotificationPreferences: vi.fn(),
  readNotification: vi.fn(),
  readAllNotifications: vi.fn(),
  disablePushDevice: vi.fn(),
}));
vi.mock('../lib/web-push', () => ({
  supportsWebPush: vi.fn(),
  localPushDevice: vi.fn(),
  enableBrowserPush: vi.fn(),
  disableBrowserPush: vi.fn(),
}));
const household: api.Household = {
  id: 'home',
  name: 'Our home',
  timezone: 'Asia/Bangkok',
  defaultCurrency: 'THB',
  currencyEditable: false,
  createdAt: '2026-10-01T00:00:00Z',
  role: 'owner',
};
const preferences = (): api.NotificationPreferences => ({
  categories: Object.fromEntries(
    api.notificationCategories.map((category) => [
      category,
      { inApp: true, webPush: category !== 'shopping' },
    ]),
  ) as api.NotificationPreferences['categories'],
  quietHours: { enabled: false, start: '23:00', end: '07:00' },
  timezone: household.timezone,
});
const item = (id: string, createdAt: string): api.NotificationItem => ({
  id,
  householdId: 'home',
  category: 'announcements',
  priority: 'normal',
  entityType: 'announcement',
  entityId: id,
  title: `Update ${id}`,
  body: 'A household update',
  createdAt,
  readAt: null,
  href: `/house?household=home&announcement=${id}`,
});
const currentDevice = {
  id: 'current',
  enabled: true,
  createdAt: '2026-10-01T00:00:00Z',
  lastSentAt: null,
  lastError: null,
};
async function mount(settings = false) {
  window.history.replaceState(
    null,
    '',
    settings ? '/notifications?view=settings' : '/notifications',
  );
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <NotificationWorkspace
        token="token"
        household={household}
        accountId="account"
      />,
    );
  });
  return view;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-03T18:30:00Z'));
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  vi.stubGlobal('Notification', { permission: 'granted' });
  vi.mocked(api.getNotifications).mockResolvedValue({
    notifications: [],
    unreadCount: 0,
    nextCursor: null,
  });
  vi.mocked(api.getNotificationPreferences).mockResolvedValue(preferences());
  vi.mocked(api.getPushConfig).mockResolvedValue({
    enabled: true,
    publicKey: 'public',
    reason: null,
  });
  vi.mocked(api.getPushDevices).mockResolvedValue([currentDevice]);
  vi.mocked(api.saveNotificationPreferences).mockImplementation(
    async (_token, _household, input) => ({
      ...input,
      timezone: household.timezone,
    }),
  );
  vi.mocked(push.supportsWebPush).mockReturnValue(true);
  vi.mocked(push.localPushDevice).mockReturnValue({
    id: 'current',
    accountId: 'account',
    endpoint: 'https://example.invalid',
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('inbox groups dates in the household timezone and retains read, filter and pagination actions', async () => {
  // Fake the constructor too: Bangkok is already Oct 4 while UTC is Oct 3.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-03T18:30:00Z'));
  vi.mocked(api.getNotifications).mockResolvedValue({
    notifications: [
      item('today', '2026-10-03T18:10:00Z'),
      item('yesterday', '2026-10-03T15:00:00Z'),
      item('older', '2026-10-01T05:00:00Z'),
    ],
    unreadCount: 3,
    nextCursor: 'older-cursor',
  });
  await mount();
  const today = screen.getByRole('heading', { name: 'Today' }).parentElement;
  if (!today) throw Error('Missing date group');
  expect(
    within(today)
      .getByRole('link', { name: /Update today/ })
      .getAttribute('href'),
  ).toContain('announcement=today');
  expect(within(today).queryByText('Update yesterday')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Earlier' })).toBeTruthy();
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark Update today read' }),
    );
  });
  expect(api.readNotification).toHaveBeenCalledWith('token', 'home', 'today');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
  });
  expect(api.readAllNotifications).toHaveBeenCalledWith(
    'token',
    'home',
    'today',
  );
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Load older notifications' }),
    );
  });
  expect(api.getNotifications).toHaveBeenCalledWith(
    'token',
    'home',
    'all',
    'older-cursor',
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
  });
  expect(api.getNotifications).toHaveBeenCalledWith('token', 'home', 'unread');
});

test('settings device refresh preserves edits; quiet hours and categories save only on explicit submit', async () => {
  await mount(true);
  expect(
    screen
      .getByRole('button', { name: 'Save changes' })
      .hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.click(screen.getByText(/9 inbox · 8 push categories/));
  fireEvent.click(
    screen.getByRole('switch', { name: 'Expenses inbox notifications' }),
  );
  fireEvent.click(screen.getByRole('switch', { name: 'Enable quiet hours' }));
  fireEvent.change(screen.getByLabelText('From'), {
    target: { value: '22:00' },
  });
  expect(api.saveNotificationPreferences).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Manage devices'));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Check devices' }));
  });
  expect(
    (
      screen.getByRole('switch', {
        name: 'Expenses inbox notifications',
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe(
    '22:00',
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  });
  expect(api.saveNotificationPreferences).toHaveBeenCalledWith(
    'token',
    'home',
    expect.objectContaining({
      categories: expect.objectContaining({
        money: { inApp: false, webPush: true },
      }),
      quietHours: { enabled: true, start: '22:00', end: '07:00' },
    }),
  );
  expect(screen.getByText('Preferences saved.')).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: 'Save changes' })
      .hasAttribute('disabled'),
  ).toBe(true);
});

test('leaving dirty settings asks before discarding and an active push device can be disabled', async () => {
  await mount(true);
  fireEvent.click(screen.getByRole('switch', { name: 'Enable quiet hours' }));
  fireEvent.click(screen.getByRole('button', { name: 'Inbox' }));
  expect(window.confirm).toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Quiet hours' })).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
  });
  expect(push.disableBrowserPush).toHaveBeenCalledWith('token');
  expect(
    screen.getByRole('button', { name: 'Enable notifications' }),
  ).toBeTruthy();
});

test('push permission and failed setup checks never imply a device is enabled', async () => {
  vi.stubGlobal('Notification', { permission: 'denied' });
  const view = await mount(true);
  expect(screen.getByText('Blocked in device settings')).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: 'Enable notifications' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(push.enableBrowserPush).not.toHaveBeenCalled();
  view.unmount();
  vi.stubGlobal('Notification', { permission: 'granted' });
  vi.mocked(api.getPushDevices).mockRejectedValue(Error('offline'));
  await mount(true);
  expect(screen.getByText('Device status unavailable')).toBeTruthy();
  expect(screen.queryByText('On for this device')).toBeNull();
  expect(
    screen
      .getByRole('button', { name: 'Enable notifications' })
      .hasAttribute('disabled'),
  ).toBe(true);
});

test('expanded settings have accessible switches and no structural axe violations', async () => {
  const view = await mount(true);
  fireEvent.click(screen.getByText(/9 inbox · 8 push categories/));
  fireEvent.click(screen.getByRole('switch', { name: 'Enable quiet hours' }));
  const result = await axe.run(view.container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
});
