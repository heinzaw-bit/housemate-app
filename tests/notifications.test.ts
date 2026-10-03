import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, expect, test, vi } from 'vitest';
import {
  getNotifications,
  readAllNotifications,
  readNotification,
  registerPushDevice,
} from '../lib/api';
import { enableBrowserPush, refreshBrowserPush } from '../lib/web-push';

afterEach(() => vi.unstubAllGlobals());

test('notification read boundaries and device refresh carry identity only in the bearer token', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await getNotifications('token', 'home/other', 'unread', 'opaque+/cursor');
  await readNotification('token', 'home', 'notification');
  await readAllNotifications('token', 'home', 'newest-displayed');
  await registerPushDevice('token', {
    endpoint: 'https://fcm.googleapis.com/test',
    keys: { p256dh: 'key', auth: 'auth' },
    refreshOnly: true,
  });
  for (const [, options] of fetchMock.mock.calls) {
    expect(options.headers.Authorization).toBe('Bearer token');
    expect(options.cache).toBe('no-store');
  }
  const url = new URL(fetchMock.mock.calls[0][0]);
  expect(url.pathname).toContain('home%2Fother');
  expect(url.searchParams.get('cursor')).toBe('opaque+/cursor');
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
    throughId: 'newest-displayed',
  });
  expect(JSON.parse(fetchMock.mock.calls[3][1].body).refreshOnly).toBe(true);
});

test('push denial keeps consent separate from silent subscription refresh', async () => {
  const requestPermission = vi.fn();
  const register = vi.fn();
  const fetchMock = vi.fn();
  vi.stubGlobal('window', {
    isSecureContext: true,
    PushManager: () => {},
    Notification: {},
  });
  vi.stubGlobal('navigator', { serviceWorker: { register } });
  vi.stubGlobal('Notification', { permission: 'denied', requestPermission });
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('fetch', fetchMock);
  await expect(enableBrowserPush('token', 'account', 'key')).rejects.toThrow(
    'blocked',
  );
  await refreshBrowserPush('token', 'account');
  expect(requestPermission).not.toHaveBeenCalled();
  expect(register).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('service worker never displays incoming private text and constrains notification links to this app', async () => {
  const handlers = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const worker = {
    location: { origin: 'https://housemate.example' },
    addEventListener: (name: string, handler: (event: unknown) => void) =>
      handlers.set(name, handler),
    registration: { showNotification },
  };
  vm.runInNewContext(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
    { self: worker, URL },
  );
  let completed = Promise.resolve();
  handlers.get('push')?.({
    data: {
      json: () => ({
        id: 'note',
        title: 'Private balance',
        body: 'Secret household text',
        href: 'https://attacker.example/private',
      }),
    },
    waitUntil: (promise: Promise<void>) => {
      completed = promise;
    },
  });
  await completed;
  expect(showNotification.mock.calls[0][0]).toBe('HouseMate');
  const options = showNotification.mock.calls[0][1];
  expect(options.body).not.toContain('Secret');
  expect(options.data.href).toBe('https://housemate.example/notifications');
  expect(options.tag).toBe('housemate-note');
  handlers.get('push')?.({
    data: {
      json: () => ({ id: 'other', href: '/house?household=home&poll=vote' }),
    },
    waitUntil: (promise: Promise<void>) => {
      completed = promise;
    },
  });
  await completed;
  expect(showNotification.mock.calls[1][1].data.href).toBe(
    'https://housemate.example/house?household=home&poll=vote',
  );
});

function notificationClickHarness() {
  const handlers = new Map<string, (event: unknown) => void>();
  const openWindow = vi.fn();
  const matchAll = vi.fn().mockResolvedValue([]);
  vm.runInNewContext(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
    {
      URL,
      self: {
        location: { origin: 'https://housemate.example' },
        clients: { openWindow, matchAll },
        addEventListener: (name: string, handler: (event: unknown) => void) =>
          handlers.set(name, handler),
      },
    },
  );
  const close = vi.fn();
  const click = (href?: string) => {
    let completed = Promise.resolve();
    handlers.get('notificationclick')?.({
      notification: { close, data: { href } },
      waitUntil: (promise: Promise<void>) => {
        completed = promise;
      },
    });
    return completed;
  };
  return { openWindow, matchAll, close, click };
}

const announcementHref =
  'https://housemate.example/house?household=home&view=announcements&announcement=note';

test('notification tap immediately asks the browser to open the installed app and focuses its returned window', async () => {
  const worker = notificationClickHarness();
  const focus = vi.fn().mockResolvedValue(undefined);
  const navigate = vi.fn();
  worker.openWindow.mockResolvedValue({
    url: announcementHref,
    focus,
    navigate,
  });
  const completed = worker.click(announcementHref);
  expect(worker.openWindow).toHaveBeenCalledWith(announcementHref);
  expect(worker.matchAll).not.toHaveBeenCalled();
  await completed;
  expect(focus).toHaveBeenCalledOnce();
  expect(navigate).not.toHaveBeenCalled();
  expect(worker.close).toHaveBeenCalledOnce();
});

test('notification tap corrects a returned window that opens at the app start page', async () => {
  const worker = notificationClickHarness();
  const focus = vi.fn().mockResolvedValue(undefined);
  const navigate = vi.fn().mockResolvedValue({ url: announcementHref });
  worker.openWindow.mockResolvedValue({
    url: 'https://housemate.example/',
    focus,
    navigate,
  });
  await worker.click(announcementHref);
  expect(navigate).toHaveBeenCalledWith(announcementHref);
  expect(focus.mock.invocationCallOrder[0]).toBeLessThan(
    navigate.mock.invocationCallOrder[0],
  );
});

test('an explicit focus rejection does not discard an already opened notification target', async () => {
  const worker = notificationClickHarness();
  worker.openWindow.mockResolvedValue({
    url: announcementHref,
    focus: vi.fn().mockRejectedValue(new Error('Already opening')),
  });
  await expect(worker.click(announcementHref)).resolves.toBeUndefined();
  expect(worker.matchAll).not.toHaveBeenCalled();
});

test.each(['rejected', 'null'])(
  'notification tap recovers from %s opening using a live app window',
  async (outcome) => {
    const worker = notificationClickHarness();
    if (outcome === 'rejected')
      worker.openWindow.mockRejectedValue(new Error('Opening unavailable'));
    else worker.openWindow.mockResolvedValue(null);
    const focus = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue({ url: announcementHref });
    worker.matchAll.mockResolvedValue([
      { url: 'https://housemate.example/money', focus, navigate },
    ]);
    await worker.click(announcementHref);
    expect(worker.matchAll).toHaveBeenCalledWith({
      type: 'window',
      includeUncontrolled: true,
    });
    expect(navigate).toHaveBeenCalledWith(announcementHref);
    expect(focus.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0],
    );
  },
);

test('notification fallback ignores other origins and survives inert or closed windows', async () => {
  const worker = notificationClickHarness();
  worker.openWindow.mockResolvedValue(null);
  const foreignFocus = vi.fn();
  const navigate = vi.fn().mockResolvedValue({ url: announcementHref });
  worker.matchAll.mockResolvedValue([
    { url: 'https://other.example/', focus: foreignFocus },
    {
      url: 'https://housemate.example/',
      focus: vi.fn().mockRejectedValue(new Error('Inert')),
    },
    {
      url: 'https://housemate.example/money',
      focus: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(null),
    },
    {
      url: 'https://housemate.example/house',
      focus: vi.fn().mockResolvedValue(undefined),
      navigate,
    },
  ]);
  await worker.click(announcementHref);
  expect(foreignFocus).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith(announcementHref);
});

test.each([undefined, 'https://other.example/house', '/profile'])(
  'notification taps with an unsafe or missing link open the inbox: %s',
  async (href) => {
    const worker = notificationClickHarness();
    worker.openWindow.mockResolvedValue({
      url: 'https://housemate.example/notifications',
      focus: vi.fn().mockResolvedValue(undefined),
    });
    await worker.click(href);
    expect(worker.openWindow).toHaveBeenCalledWith(
      'https://housemate.example/notifications',
    );
  },
);

test('notification tap reports failure when the browser cannot open or recover a window', async () => {
  const worker = notificationClickHarness();
  worker.openWindow.mockRejectedValue(new Error('Opening unavailable'));
  await expect(worker.click(announcementHref)).rejects.toThrow(
    'Could not open the HouseMate notification.',
  );
});
