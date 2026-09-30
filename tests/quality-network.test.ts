import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, expect, test, vi } from 'vitest';
import { ApiRequestError, getMe, updateMe } from '../lib/api';
import { confirmationFailure } from '../lib/financial-confirmation';
import { appendRecords } from '../lib/record-pages';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('offline writes are not sent and a lost reply has an explicit uncertain confirmation message', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('navigator', { onLine: false });
  const failure = await updateMe('token', 'Member').catch((error) => error);
  expect(failure).toMatchObject({ code: 'OFFLINE' });
  expect(fetcher).not.toHaveBeenCalled();
  expect(confirmationFailure(failure, 'expense')).toContain('was not sent');
  expect(
    confirmationFailure(
      new ApiRequestError(0, 'NETWORK_ERROR', 'lost'),
      'expense',
    ),
  ).toContain('It may have been saved');
  expect(
    confirmationFailure(
      new ApiRequestError(503, 'REQUEST_FAILED', 'failed'),
      'expense',
    ),
  ).toContain('retry key prevents a duplicate');
  expect(
    confirmationFailure(
      new ApiRequestError(409, 'STALE_RECORD', 'Reload latest revision'),
      'expense',
    ),
  ).toBe('Reload latest revision');
});

test('only simultaneous identical reads share a request, without sharing identities or retaining cached data', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementation(async () => new Response('{"id":"next"}'));
  vi.stubGlobal('fetch', fetcher);
  const first = getMe('same');
  const duplicate = getMe('same');
  const otherAccount = getMe('other');
  expect(fetcher).toHaveBeenCalledTimes(2);
  finish(new Response('{"id":"first"}'));
  expect(await first).toEqual({ id: 'first' });
  expect(await duplicate).toEqual({ id: 'first' });
  expect(await otherAccount).toEqual({ id: 'next' });
  await getMe('same');
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test('hung requests time out and unreadable successful replies are not presented as confirmation', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(Error('timeout')));
        }),
    ),
  );
  const request = getMe('timeout');
  const rejected = expect(request).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
  });
  await vi.advanceTimersByTimeAsync(20_000);
  await rejected;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('not JSON', { status: 200 })),
  );
  await expect(updateMe('token', 'Member')).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});

test('overlapping history pages remain unique even at large history sizes', () => {
  const previous = Array.from({ length: 1000 }, (_, index) => ({
    id: String(index),
  }));
  const page = [{ id: '999' }, { id: '1000' }, { id: '1000' }];
  const merged = appendRecords(previous, page);
  expect(merged).toHaveLength(1001);
  expect(new Set(merged.map((row) => row.id)).size).toBe(1001);
});

test('light and dark text palettes meet normal-text contrast on their surfaces', () => {
  const css = readFileSync(
    new URL('../app/globals.css', import.meta.url),
    'utf8',
  );
  const color = (name: string) =>
    css.match(new RegExp(`--${name}: (#[a-fA-F0-9]{6});`))?.[1] ?? '';
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      );
    return (
      (rgb[0] ?? 0) * 0.2126 + (rgb[1] ?? 0) * 0.7152 + (rgb[2] ?? 0) * 0.0722
    );
  };
  const ratio = (fg: string, bg: string) =>
    (Math.max(luminance(fg), luminance(bg)) + 0.05) /
    (Math.min(luminance(fg), luminance(bg)) + 0.05);
  for (const fg of [
    color('foreground'),
    color('muted-foreground'),
    color('primary'),
    color('destructive'),
    '#4b6b56',
  ]) {
    expect(ratio(fg, color('background')), fg).toBeGreaterThanOrEqual(4.5);
    expect(ratio(fg, '#ffffff'), fg).toBeGreaterThanOrEqual(4.5);
  }
  expect(ratio(color('destructive'), '#f3ece9')).toBeGreaterThanOrEqual(4.5);
  expect(ratio(color('primary'), '#ffffff')).toBeGreaterThanOrEqual(3);
  const darkCss = css.match(/\.dark \{([^}]+)\}/)?.[1] ?? '';
  const darkColor = (name: string) =>
    darkCss.match(new RegExp(`--${name}: (#[a-fA-F0-9]{6});`))?.[1] ?? '';
  for (const foreground of [
    'foreground',
    'muted-foreground',
    'primary',
    'destructive',
  ]) {
    for (const background of ['background', 'card', 'popover', 'secondary']) {
      expect(
        ratio(darkColor(foreground), darkColor(background)),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(
    ratio(darkColor('primary-foreground'), darkColor('primary')),
  ).toBeGreaterThanOrEqual(4.5);
});

test('service worker caches only the public offline screen, waits for explicit updates, and never intercepts API writes', async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const add = vi.fn(async () => {});
  const skip = vi.fn(async () => {});
  const offline = new Response('offline');
  const cache = {
    open: vi.fn(async () => ({ add })),
    match: vi.fn(async () => offline),
    keys: vi.fn(async () => ['housemate-offline-v1', 'another-app-cache']),
    delete: vi.fn(async () => true),
  };
  const self = {
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      handlers[name] = handler;
    },
    skipWaiting: skip,
    location: { origin: 'https://housemate.test' },
    clients: { claim: vi.fn() },
  };
  vm.runInNewContext(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
    {
      self,
      caches: cache,
      fetch: vi.fn(async () => {
        throw Error('offline');
      }),
      URL,
      Response,
      AbortController,
      setTimeout,
      clearTimeout,
    },
  );
  let work!: Promise<unknown>;
  const waitUntil = (promise: Promise<unknown>) => {
    work = promise;
  };
  handlers.install({ waitUntil });
  await work;
  expect(add).toHaveBeenCalledExactlyOnceWith('/offline.html');
  expect(skip).not.toHaveBeenCalled();
  handlers.activate({ waitUntil });
  await work;
  expect(cache.delete).toHaveBeenCalledExactlyOnceWith('housemate-offline-v1');
  handlers.message({ data: { type: 'HOUSEMATE_ACTIVATE_UPDATE' }, waitUntil });
  await work;
  expect(skip).toHaveBeenCalledTimes(1);
  const respondWith = vi.fn((promise) => {
    work = promise;
  });
  handlers.fetch({
    request: {
      mode: 'cors',
      method: 'POST',
      url: 'https://housemate.test/v1/expense',
    },
    respondWith,
  });
  expect(respondWith).not.toHaveBeenCalled();
  handlers.fetch({
    request: {
      mode: 'navigate',
      method: 'GET',
      url: 'https://housemate.test/money',
    },
    respondWith,
  });
  expect(await work).toBe(offline);
  expect(cache.match).toHaveBeenCalledWith('/offline.html');
});
