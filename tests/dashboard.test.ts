import { afterEach, expect, test, vi } from 'vitest';
import {
  ApiRequestError,
  type Dashboard,
  getDashboard,
  getMeals,
  getSettlement,
} from '../lib/api';
import {
  activityHref,
  activityLabel,
  moneyCreateHref,
  moneyHref,
} from '../lib/dashboard';

afterEach(() => vi.unstubAllGlobals());

test('dashboard reads the chosen household without caching and supports cancellation', async () => {
  const snapshot = { householdId: 'home', recentActivity: [] };
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(snapshot)));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  expect(await getDashboard('session', 'home', controller.signal)).toEqual(
    snapshot,
  );
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3001/v1/households/home/dashboard',
    expect.objectContaining({
      cache: 'no-store',
      signal: expect.any(AbortSignal),
      headers: { Authorization: 'Bearer session' },
    }),
  );
  const pendingFetch = vi.fn(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      }),
  );
  vi.stubGlobal('fetch', pendingFetch);
  const request = getDashboard('session', 'home', controller.signal);
  const rejection = expect(request).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
  });
  controller.abort();
  await rejection;
  expect(pendingFetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
});

test('dashboard access failures remain distinguishable so the UI can discard stale data', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'Household not found.' },
        }),
        { status: 404 },
      ),
    ),
  );
  await expect(getDashboard('session', 'foreign')).rejects.toMatchObject({
    status: 404,
    code: 'NOT_FOUND',
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  await expect(getDashboard('session', 'home')).rejects.toBeInstanceOf(
    ApiRequestError,
  );
});

test('an API missing a new route explains that the local server needs restarting', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Route GET:/v1/households/home/meals not found',
          error: 'Not Found',
          statusCode: 404,
        }),
        { status: 404 },
      ),
    ),
  );
  await expect(getMeals('session', 'home')).rejects.toMatchObject({
    status: 404,
    code: 'API_ROUTE_MISSING',
    message:
      'This feature needs a newer HouseMate API. Restart the API, then refresh this page.',
  });
});

test('each activity link preserves household, correct Money tab and record ID', () => {
  for (const [resourceType, view] of [
    ['expense', 'expenses'],
    ['bill', 'bills'],
    ['settlement', 'balances'],
  ] as const) {
    const event = {
      resourceType,
      resourceId: 'record',
      kind: 'voided',
      actorDisplayName: 'Alice',
    } as Dashboard['recentActivity'][number];
    expect(activityHref('home', event)).toBe(
      `/money?household=home&view=${view}&record=record`,
    );
    expect(activityLabel(event)).toBe('Alice voided');
  }
  expect(moneyHref('home', 'balances')).toBe(
    '/money?household=home&view=balances',
  );
  expect(moneyCreateHref('home', 'expenses')).toBe(
    '/money?household=home&view=expenses&add=1',
  );
  expect(moneyCreateHref('home', 'bills')).toBe(
    '/money?household=home&view=bills&add=1',
  );
});

test('an older transfer is fetched directly instead of depending on the first list page', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: 'old-transfer' })));
  vi.stubGlobal('fetch', fetchMock);
  expect(await getSettlement('session', 'home', 'old-transfer')).toEqual({
    id: 'old-transfer',
  });
  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    'http://localhost:3001/v1/households/home/settlements/old-transfer',
  );
});
