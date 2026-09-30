// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AppView } from '../components/app-view';
import type { ApiUser } from '../lib/api';
import * as api from '../lib/api';

const auth = vi.hoisted(() => ({
  client: null,
  session: { access_token: 'token-a', user: { id: 'account-a' } },
  checking: false,
  configured: true,
  error: '',
}));
vi.mock('../lib/auth-context', () => ({ useAuth: () => auth }));
vi.mock('../components/workspace', () => ({
  Workspace: ({ me }: { me: ApiUser }) => <div>Account: {me.displayName}</div>,
}));
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getMe: vi.fn(),
  getHouseholds: vi.fn(),
  getHousehold: vi.fn(),
}));
const user = (id: string): ApiUser => ({
  id,
  displayName: id,
  email: `${id}@example.test`,
});
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  auth.session = { access_token: 'token-a', user: { id: 'account-a' } };
  vi.mocked(api.getHouseholds).mockResolvedValue([
    {
      id: 'home',
      name: 'Home',
      defaultCurrency: 'THB',
      timezone: 'Asia/Bangkok',
      role: 'member',
      currencyEditable: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('account changes hide old household views immediately while fresh API reads are pending', async () => {
  let finish!: (me: ApiUser) => void;
  vi.mocked(api.getMe)
    .mockResolvedValueOnce(user('account-a'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const view = render(<AppView section="home" />);
  await screen.findByText('Account: account-a');
  auth.session = { access_token: 'token-b', user: { id: 'account-b' } };
  view.rerender(<AppView section="home" />);
  expect(screen.queryByText('Account: account-a')).toBeNull();
  await waitFor(() => expect(api.getMe).toHaveBeenCalledWith('token-b'));
  await act(async () => finish(user('account-b')));
  expect(screen.getByText('Account: account-b')).toBeTruthy();
});
test('late responses from the previous account cannot replace the new account', async () => {
  let finishOld!: (me: ApiUser) => void;
  vi.mocked(api.getMe)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockResolvedValueOnce(user('account-b'));
  const view = render(<AppView section="home" />);
  await waitFor(() => expect(api.getMe).toHaveBeenCalledWith('token-a'));
  auth.session = { access_token: 'token-b', user: { id: 'account-b' } };
  view.rerender(<AppView section="home" />);
  await screen.findByText('Account: account-b');
  await act(async () => finishOld(user('account-a')));
  expect(screen.queryByText('Account: account-a')).toBeNull();
  expect(screen.getByText('Account: account-b')).toBeTruthy();
});
