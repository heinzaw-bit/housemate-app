import { afterEach, expect, test, vi } from 'vitest';
import {
  acknowledgeAnnouncement,
  createAnnouncement,
  createPoll,
  getAnnouncements,
  getPolls,
  voteInPoll,
} from '../lib/api';

afterEach(() => vi.unstubAllGlobals());

test('communications preserve publication retry keys and replace only the authenticated member selection', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const announcement = {
    title: 'Water',
    body: 'Tomorrow',
    priority: 'urgent' as const,
    requiresAcknowledgement: true,
    recipientIds: ['member'],
    expiresAtLocal: null,
    idempotencyKey: 'retry-announcement',
  };
  const poll = {
    question: 'Which day?',
    options: ['Saturday', 'Sunday'],
    allowMultiple: true,
    deadlineLocal: '2030-10-01T12:00',
    voterIds: ['member'],
    idempotencyKey: 'retry-poll',
  };
  await createAnnouncement('token', 'home', announcement);
  await createAnnouncement('token', 'home', announcement);
  await createPoll('token', 'home', poll);
  await createPoll('token', 'home', poll);
  await acknowledgeAnnouncement('token', 'home', 'post');
  await voteInPoll('token', 'home', 'poll', ['choice']);
  await voteInPoll('token', 'home', 'poll', []);
  const requests = fetchMock.mock.calls.map(([url, options]) => ({
    url,
    options: options as RequestInit,
  }));
  for (const { options } of requests) {
    expect((options.headers as Record<string, string>).Authorization).toBe(
      'Bearer token',
    );
    expect(options.cache).toBe('no-store');
  }
  expect(requests[0].options.body).toBe(requests[1].options.body);
  expect(requests[2].options.body).toBe(requests[3].options.body);
  expect(requests[4].url).toBe(
    'http://localhost:3001/v1/households/home/announcements/post/acknowledgement',
  );
  expect(requests[4].options.method).toBe('PUT');
  expect(requests[4].options.body).toBeUndefined();
  expect(JSON.parse(requests[5].options.body as string)).toEqual({
    optionIds: ['choice'],
  });
  expect(JSON.parse(requests[6].options.body as string)).toEqual({
    optionIds: [],
  });
});

test('filtered communication pages send bounded pagination and encode household selectors', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response('{"announcements":[],"polls":[]}', { status: 200 }),
    );
  vi.stubGlobal('fetch', fetchMock);
  expect(
    await getAnnouncements('token', 'home/other', 'needs_ack', 50, 50),
  ).toEqual([]);
  expect(await getPolls('token', 'home/other', 'needs_vote', 50, 100)).toEqual(
    [],
  );
  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://localhost:3001/v1/households/home%2Fother/announcements?scope=needs_ack&limit=50&offset=50',
  );
  expect(fetchMock.mock.calls[1][0]).toBe(
    'http://localhost:3001/v1/households/home%2Fother/polls?scope=needs_vote&limit=50&offset=100',
  );
});
