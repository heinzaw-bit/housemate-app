// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseholdSearch } from '../components/household-search';
import type { Household, SearchHit, SearchPage } from '../lib/api';
import * as api from '../lib/api';
import { useLeaveGuard } from '../lib/pending-work';

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  searchHousehold: vi.fn(),
}));
const home: Household = {
  id: 'home',
  name: 'Our home',
  role: 'member',
  timezone: 'Asia/Bangkok',
  defaultCurrency: 'THB',
  currencyEditable: false,
  createdAt: '2026-01-01T00:00:00Z',
};
const hit: SearchHit = {
  id: 'record',
  type: 'bill',
  title: 'October rent',
  snippet: 'House owner',
  status: 'unpaid',
  createdAt: '2026-10-01T00:00:00.000123Z',
  href: '/money?household=home&view=bills&record=record',
};
function Draft() {
  useLeaveGuard(true);
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerType = 'mouse';
    },
  );
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.mocked(api.searchHousehold).mockResolvedValue({
    results: [hit],
    nextCursor: null,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: 'Search household records' }),
  );
  const input = await screen.findByRole('searchbox', {
    name: 'Search records',
  });
  await user.type(input, 'rent');
  return input;
}

test('keyboard shortcut opens a focused accessible dialog; reads start only after a sufficient query and close clears the session', async () => {
  const user = userEvent.setup();
  render(<HouseholdSearch token="token" household={home} />);
  const trigger = screen.getByRole('button', {
    name: 'Search household records',
  });
  trigger.focus();
  await user.keyboard('{Control>}k{/Control}');
  const input = await screen.findByRole('searchbox', {
    name: 'Search records',
  });
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(api.searchHousehold).not.toHaveBeenCalled();
  await user.type(input, 'r');
  expect(screen.getByText('Type at least 2 characters.')).toBeTruthy();
  await act(async () => new Promise((resolve) => setTimeout(resolve, 330)));
  expect(api.searchHousehold).not.toHaveBeenCalled();
  await user.type(input, 'ent');
  await screen.findByText('October rent');
  const args = vi.mocked(api.searchHousehold).mock.calls[0];
  expect(args.slice(0, 5)).toEqual(['token', 'home', 'rent', 'all', undefined]);
  expect(
    screen.getByRole('link', { name: /October rent/ }).getAttribute('href'),
  ).toBe(hit.href);
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(result.violations).toEqual([]);
  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  expect((input as HTMLInputElement).value).toBe('');
  expect(document.activeElement).toBe(input);
  expect(screen.queryByText('October rent')).toBeNull();
  expect(screen.queryByText('Type at least 2 characters.')).toBeNull();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(trigger);
  await user.click(trigger);
  expect(
    (
      screen.getByRole('searchbox', {
        name: 'Search records',
      }) as HTMLInputElement
    ).value,
  ).toBe('');
  expect(screen.queryByText('October rent')).toBeNull();
});

test('changed queries and whitespace ignore older late responses; filters restart the authorized search', async () => {
  let finish!: (page: SearchPage) => void;
  vi.mocked(api.searchHousehold).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<HouseholdSearch token="token" household={home} />);
  const input = await start(user);
  await waitFor(() => expect(api.searchHousehold).toHaveBeenCalledTimes(1));
  await user.clear(input);
  await user.type(input, 'dinner');
  await act(async () =>
    finish({
      results: [{ ...hit, title: 'Old private response' }],
      nextCursor: null,
    }),
  );
  expect(screen.queryByText('Old private response')).toBeNull();
  await screen.findByText('October rent');
  await user.type(input, ' ');
  await waitFor(() => expect(api.searchHousehold).toHaveBeenCalledTimes(3));
  await screen.findByText('October rent');
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Record type' }),
    'event',
  );
  await waitFor(() =>
    expect(vi.mocked(api.searchHousehold).mock.lastCall?.slice(0, 4)).toEqual([
      'token',
      'home',
      'dinner',
      'event',
    ]),
  );
});

test('search excludes earlier tools from filters and every result page without losing the next cursor', async () => {
  const earlier: SearchHit[] = (
    ['meal', 'chore', 'shopping', 'poll'] as const
  ).map((type) => ({ ...hit, type, title: `Earlier ${type}` }));
  const current: SearchHit[] = (
    ['expense', 'bill', 'settlement', 'event', 'announcement'] as const
  ).map((type) => ({ ...hit, type, title: `Current ${type}` }));
  vi.mocked(api.searchHousehold)
    .mockResolvedValueOnce({ results: earlier, nextCursor: 'cursor' })
    .mockResolvedValueOnce({
      results: [...earlier, ...current],
      nextCursor: null,
    });
  const user = userEvent.setup();
  render(<HouseholdSearch token="token" household={home} />);
  await start(user);
  expect(
    screen.getAllByRole('option').map((option) => option.textContent),
  ).toEqual([
    'All records',
    'Expenses',
    'Bills',
    'Transfers',
    'Events',
    'Announcements',
  ]);
  expect(
    screen.queryByRole('group', { name: 'Earlier household tools' }),
  ).toBeNull();
  await screen.findByText(
    'No matches on this page. Load more results or try another phrase.',
  );
  expect(screen.getByText('0 results · more available')).toBeTruthy();
  expect(screen.queryAllByRole('link')).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Load more results' }));
  await screen.findByText('Current announcement');
  expect(screen.getAllByRole('link')).toHaveLength(5);
  expect(screen.queryByText(/^Earlier /)).toBeNull();
  expect(screen.getByText('5 results')).toBeTruthy();
  expect(vi.mocked(api.searchHousehold).mock.calls[1].slice(0, 5)).toEqual([
    'token',
    'home',
    'rent',
    'all',
    'cursor',
  ]);
  expect(
    screen.queryByRole('button', { name: 'Load more results' }),
  ).toBeNull();
});

test('pagination uses the current cursor, removes overlap and keeps different record types with the same id', async () => {
  vi.mocked(api.searchHousehold)
    .mockResolvedValueOnce({ results: [hit], nextCursor: 'cursor' })
    .mockResolvedValueOnce({
      results: [hit, { ...hit, type: 'expense', title: 'October groceries' }],
      nextCursor: null,
    });
  const user = userEvent.setup();
  render(<HouseholdSearch token="token" household={home} />);
  await start(user);
  await screen.findByText('October rent');
  await user.click(screen.getByRole('button', { name: 'Load more results' }));
  await screen.findByText('October groceries');
  expect(screen.getAllByRole('link')).toHaveLength(2);
  expect(vi.mocked(api.searchHousehold).mock.calls[1].slice(0, 5)).toEqual([
    'token',
    'home',
    'rent',
    'all',
    'cursor',
  ]);
  expect(
    screen.queryByRole('button', { name: 'Load more results' }),
  ).toBeNull();
});

test('record navigation is blocked while a draft remains open; keyboard arrows reach results without mutating records', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Draft />
      <HouseholdSearch token="token" household={home} />
    </>,
  );
  const input = await start(user);
  await screen.findByText('October rent');
  expect(
    screen.getByText(
      'Finish or discard your open draft before opening a result.',
    ),
  ).toBeTruthy();
  input.focus();
  await user.keyboard('{ArrowDown}');
  const link = screen.getByRole('link', { name: /October rent/ });
  expect(document.activeElement).toBe(link);
  await user.keyboard('{Enter}');
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(link.getAttribute('aria-disabled')).toBe('true');
  await user.keyboard('{ArrowUp}');
  expect(document.activeElement).toBe(input);
});

test('offline clears retained data and reconnection performs a fresh search', async () => {
  const user = userEvent.setup();
  render(<HouseholdSearch token="token" household={home} />);
  await start(user);
  await screen.findByText('October rent');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await act(async () => window.dispatchEvent(new Event('offline')));
  expect(screen.queryByText('October rent')).toBeNull();
  expect(screen.getByText(/You’re offline/)).toBeTruthy();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event('online')));
  await screen.findByText('October rent');
  expect(api.searchHousehold).toHaveBeenCalledTimes(2);
});

test('a household remount aborts old reads and never displays another household response', async () => {
  let finish!: (page: SearchPage) => void;
  vi.mocked(api.searchHousehold).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  const view = render(
    <HouseholdSearch key="home" token="token" household={home} />,
  );
  await start(user);
  await waitFor(() => expect(api.searchHousehold).toHaveBeenCalled());
  const signal = vi.mocked(api.searchHousehold).mock.calls[0][5];
  view.rerender(
    <HouseholdSearch
      key="other"
      token="new-token"
      household={{ ...home, id: 'other', name: 'Other household' }}
    />,
  );
  expect(signal?.aborted).toBe(true);
  await act(async () =>
    finish({
      results: [{ ...hit, title: 'Private old household' }],
      nextCursor: null,
    }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText('Private old household')).toBeNull();
});

test('search errors are retryable, empty results have guidance, and preview makes no API calls', async () => {
  vi.mocked(api.searchHousehold)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ results: [], nextCursor: null });
  const user = userEvent.setup();
  const view = render(<HouseholdSearch token="token" household={home} />);
  await start(user);
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText(
    'No matches. Try a shorter phrase or another record type.',
  );
  view.unmount();
  vi.mocked(api.searchHousehold).mockClear();
  render(<HouseholdSearch household={home} />);
  expect(
    (
      screen.getByRole('button', {
        name: 'Search household records',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await user.keyboard('{Control>}k{/Control}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(api.searchHousehold).not.toHaveBeenCalled();
});

test('access failure while loading more clears previous private results', async () => {
  vi.mocked(api.searchHousehold)
    .mockResolvedValueOnce({ results: [hit], nextCursor: 'cursor' })
    .mockRejectedValueOnce(
      new api.ApiRequestError(404, 'NOT_FOUND', 'Household not found.'),
    );
  const user = userEvent.setup();
  render(<HouseholdSearch token="token" household={home} />);
  await start(user);
  await screen.findByText('October rent');
  await user.click(screen.getByRole('button', { name: 'Load more results' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('October rent')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Load more results' }),
  ).toBeNull();
});

test('composition does not send unfinished language input to search', async () => {
  const user = userEvent.setup();
  render(<HouseholdSearch token="token" household={home} />);
  await user.click(
    screen.getByRole('button', { name: 'Search household records' }),
  );
  const input = screen.getByRole('searchbox', { name: 'Search records' });
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'ข้าว' } });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 330)));
  expect(api.searchHousehold).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  await screen.findByText('October rent');
  expect(vi.mocked(api.searchHousehold).mock.calls[0][2]).toBe('ข้าว');
});
