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
