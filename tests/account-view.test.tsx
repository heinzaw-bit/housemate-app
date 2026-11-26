// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AppShell } from '../components/app-shell';
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
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
  useRouter: () => router,
}));
vi.mock('../lib/auth-context', () => ({ useAuth: () => auth }));
vi.mock('../components/workspace', () => ({
  Workspace: ({
    me,
    household,
    households,
    onCreateHousehold,
    onSelectHousehold,
  }: ComponentProps<typeof import('../components/workspace').Workspace>) => (
    <div>
      <div>Account: {me.displayName}</div>
      <div>Active household: {household.name}</div>
      <div>Households: {households.map((item) => item.name).join(', ')}</div>
      <button type="button" onClick={onCreateHousehold}>
        Create household
      </button>
      <button type="button" onClick={() => onSelectHousehold('other')}>
        Switch household
      </button>
    </div>
  ),
}));
vi.mock('../components/onboarding-screen', () => ({
  OnboardingScreen: ({
    onCreated,
  }: ComponentProps<
    typeof import('../components/onboarding-screen').OnboardingScreen
  >) => (
    <button
      type="button"
      onClick={() =>
        onCreated({
          id: 'new-home',
          name: 'New home',
          timezone: 'Asia/Bangkok',
          defaultCurrency: 'THB',
          role: 'owner',
          currencyEditable: true,
          createdAt: '2026-10-01T00:00:00Z',
        })
      }
    >
      Finish creating household
    </button>
  ),
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
  vi.unstubAllGlobals();
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

test('creating another household keeps the existing memberships and selects the new household', async () => {
  vi.mocked(api.getMe).mockResolvedValue(user('account-a'));
  const interact = userEvent.setup();
  render(<AppView section="home" />);
  await screen.findByText('Households: Home');
  await interact.click(
    screen.getByRole('button', { name: 'Create household' }),
  );
  await interact.click(
    await screen.findByRole('button', { name: 'Finish creating household' }),
  );
  await screen.findByText('Active household: New home');
  expect(screen.getByText('Households: Home, New home')).toBeTruthy();
  expect(localStorage.getItem('housemate.selectedHousehold')).toBe('new-home');
  expect(new URL(window.location.href).searchParams.get('household')).toBe(
    'new-home',
  );
});

test('switching households preserves the section while clearing old entity links and draft prefills', async () => {
  vi.mocked(api.getMe).mockResolvedValue(user('account-a'));
  const [home] = await api.getHouseholds('token-a');
  vi.mocked(api.getHouseholds).mockResolvedValue([
    home,
    { ...home, id: 'other', name: 'Family home' },
  ]);
  vi.mocked(api.getHousehold).mockResolvedValue(home);
  window.history.replaceState(
    null,
    '',
    '/money?household=home&view=expenses&record=old-record&event=old-event&add=1',
  );
  const interact = userEvent.setup();
  render(<AppView section="money" />);
  await screen.findByText('Active household: Home');
  await interact.click(
    screen.getByRole('button', { name: 'Switch household' }),
  );
  await screen.findByText('Active household: Family home');
  const url = new URL(window.location.href);
  expect(url.pathname).toBe('/money');
  expect(url.searchParams.get('view')).toBe('expenses');
  expect(url.searchParams.get('household')).toBe('other');
  expect(url.searchParams.has('record')).toBe(false);
  expect(url.searchParams.has('event')).toBe(false);
  expect(url.searchParams.has('add')).toBe(false);
});

test('main tab navigation keeps the shell node and avoids repeating account reads', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  window.history.replaceState(null, '', '/');
  vi.mocked(api.getMe).mockResolvedValue(user('account-a'));
  vi.mocked(api.getHousehold).mockResolvedValue(
    (await api.getHouseholds('token-a'))[0],
  );
  const view = render(
    <AppShell>
      <p>Public landing</p>
    </AppShell>,
  );
  const shellNode = await screen.findByText('Account: account-a');
  const count = vi.mocked(api.getMe).mock.calls.length;
  const memberships = vi.mocked(api.getHouseholds).mock.calls.length;
  for (const path of [
    '/money',
    '/house',
    '/assistant',
    '/profile',
    '/settings',
    '/',
  ]) {
    window.history.replaceState(null, '', `${path}?household=home`);
    view.rerender(
      <AppShell>
        <p>Public landing</p>
      </AppShell>,
    );
    await waitFor(() =>
      expect(screen.getByText('Account: account-a')).toBe(shellNode),
    );
  }
  expect(api.getMe).toHaveBeenCalledTimes(count);
  expect(api.getHouseholds).toHaveBeenCalledTimes(memberships);
  expect(screen.queryByText('Public landing')).toBeNull();
});

test('an older Profile household settings link keeps its household on the new route', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  window.history.replaceState(
    null,
    '',
    '/profile?household=home#household-settings',
  );
  render(
    <AppShell>
      <p>Public landing</p>
    </AppShell>,
  );
  expect(router.replace).toHaveBeenCalledWith(
    '/settings?household=home#household-settings',
  );
});

test('a changed household URL never displays a different household as its fallback', async () => {
  vi.mocked(api.getMe).mockResolvedValue(user('account-a'));
  const view = render(<AppView section="money" />);
  await screen.findByText('Active household: Home');
  vi.mocked(api.getHousehold).mockRejectedValue(
    new api.ApiRequestError(404, 'NOT_FOUND', 'No access.'),
  );
  window.history.replaceState(null, '', '/money?household=foreign');
  view.rerender(<AppView section="money" />);
  expect(screen.queryByText('Active household: Home')).toBeNull();
  await screen.findByText('You do not have access to this household.');
  expect(screen.queryByText('Active household: Home')).toBeNull();
});
