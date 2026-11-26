// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  createExpense,
  getBalances,
  previewExpense,
  setBillStatus,
} from '../lib/api';
import {
  clearRecentReads,
  householdReadPath,
  readGeneration,
  recentRead,
  recentReadLifetimeMs,
  rememberRead,
} from '../lib/recent-reads';

const path = householdReadPath('home', 'balances');
const draft = {
  title: 'Groceries',
  amountMinor: 100,
  currency: 'THB' as const,
  spentOn: '2026-10-06',
  payerMemberId: 'one',
  split: { method: 'equal' as const, shares: [{ memberId: 'one' }] },
};
beforeEach(() => clearRecentReads());
afterEach(() => {
  clearRecentReads();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test('snapshots are isolated by session and household and expire after one minute', () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  rememberRead('session-a', path, { amount: 100 }, readGeneration());
  expect(recentRead('session-a', path)?.value).toEqual({ amount: 100 });
  expect(recentRead('session-b', path)).toBeNull();
  expect(
    recentRead('session-a', householdReadPath('other', 'balances')),
  ).toBeNull();
  clock.mockReturnValue(1000 + recentReadLifetimeMs);
  expect(recentRead('session-a', path)).toBeNull();
});
test('cache excludes details, previews, assistant content and later pages', () => {
  for (const resource of [
    'expenses/id',
    'expenses/preview',
    'assistant/questions',
    'expenses?limit=50&offset=50',
    'expenses?limit=5&offset=0',
  ]) {
    const endpoint = householdReadPath('home', resource);
    rememberRead('session', endpoint, { private: 'value' }, readGeneration());
    expect(recentRead('session', endpoint)).toBeNull();
  }
});
test('cache is bounded and an old response cannot repopulate cleared snapshots', () => {
  const version = readGeneration();
  for (let i = 0; i < 65; i++)
    rememberRead(
      'session',
      householdReadPath(`home${i}`, 'balances'),
      i,
      version,
    );
  expect(
    recentRead('session', householdReadPath('home0', 'balances')),
  ).toBeNull();
  expect(
    recentRead('session', householdReadPath('home64', 'balances'))?.value,
  ).toBe(64);
  clearRecentReads();
  rememberRead('session', path, { old: true }, version);
  expect(recentRead('session', path)).toBeNull();
});
test('API always reads fresh and confirmation clears snapshots while previews do not', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  await getBalances('session', 'home');
  expect(recentRead('session', path)).not.toBeNull();
  await getBalances('session', 'home');
  expect(fetcher).toHaveBeenCalledTimes(2);
  await previewExpense('session', 'home', draft);
  expect(recentRead('session', path)).not.toBeNull();
  await createExpense('session', 'home', draft, 'explicit-key');
  expect(recentRead('session', path)).toBeNull();
});
test('permission failures clear snapshots and failed reads are never cached', async () => {
  rememberRead('session', path, { balance: 100 }, readGeneration());
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'FORBIDDEN', message: 'No access' },
        }),
        { status: 403 },
      ),
    ),
  );
  await expect(getBalances('session', 'home')).rejects.toMatchObject({
    status: 403,
  });
  expect(recentRead('session', path)).toBeNull();
});
test('a read started before confirmation cannot be shared with a new read or revive its snapshot', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementation(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  const old = getBalances('session', 'home');
  await createExpense('session', 'home', draft, 'explicit-key');
  await getBalances('session', 'home');
  expect(fetcher).toHaveBeenCalledTimes(3);
  finish(new Response(JSON.stringify({ old: true })));
  await old;
  expect(recentRead('session', path)?.value).toEqual({});
});

test('bill status broadcasts a household refresh signal only after a successful save', async () => {
  const otherTab = new BroadcastChannel('housemate:bill-updates');
  const messages: unknown[] = [];
  otherTab.onmessage = (event) => messages.push(event.data);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"paymentStatus":"paid"}')),
  );
  try {
    await expect(
      setBillStatus('session', 'failed-home', 'bill', 'paid'),
    ).rejects.toMatchObject({ status: 503 });
    await setBillStatus('session', 'home', 'bill', 'paid');
    await vi.waitFor(() => expect(messages).toEqual(['home']));
  } finally {
    otherTab.close();
  }
});
