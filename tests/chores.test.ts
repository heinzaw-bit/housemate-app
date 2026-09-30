import { afterEach, expect, test, vi } from 'vitest';
import { completeChore, getChores, requestChoreSwap } from '../lib/api';

afterEach(() => vi.unstubAllGlobals());

test('chore client scopes reads and revisioned actions to the chosen household', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () => new Response(JSON.stringify({ chores: [] })),
    );
  vi.stubGlobal('fetch', fetchMock);
  expect(await getChores('session', 'home', 50, 10)).toEqual([]);
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3001/v1/households/home/chores?limit=50&offset=10',
    expect.objectContaining({
      headers: { Authorization: 'Bearer session' },
      cache: 'no-store',
    }),
  );
  await completeChore('session', 'home', 'chore', 4);
  expect(fetchMock.mock.calls[1]?.[0]).toBe(
    'http://localhost:3001/v1/households/home/chores/chore/complete',
  );
  expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body)).toEqual({
    expectedRevision: 4,
  });
  await requestChoreSwap('session', 'home', 'chore', 5, 'member');
  expect(fetchMock.mock.calls[2]?.[0]).toBe(
    'http://localhost:3001/v1/households/home/chores/chore/swap-requests',
  );
  expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body)).toEqual({
    expectedRevision: 5,
    targetMemberId: 'member',
  });
});
