// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HomeEntry, SignInEntry } from '../components/home-entry';
import { pendingInviteKey } from '../lib/invites';

const { auth, replace } = vi.hoisted(() => ({
  auth: {
    session: null as null | { user: { id: string } },
    checking: false,
    error: '',
  },
  replace: vi.fn(),
}));
vi.mock('../lib/auth-context', () => ({ useAuth: () => auth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../components/app-view', () => ({
  AppView: () => <div>Authentication and household flow</div>,
}));

beforeEach(() => {
  auth.session = null;
  auth.checking = false;
  auth.error = '';
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  Object.defineProperty(navigator, 'standalone', {
    configurable: true,
    value: false,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test('ordinary signed-out visitors see the public landing and signed-in members open the app', async () => {
  const view = render(
    <HomeEntry>
      <p>Public landing</p>
    </HomeEntry>,
  );
  expect(screen.getByText('Public landing')).toBeTruthy();
  auth.session = { user: { id: 'member' } };
  view.rerender(
    <HomeEntry>
      <p>Public landing</p>
    </HomeEntry>,
  );
  expect(screen.queryByText('Public landing')).toBeNull();
  await screen.findByText('Authentication and household flow');
  auth.session = null;
  view.rerender(
    <HomeEntry>
      <p>Public landing</p>
    </HomeEntry>,
  );
  expect(screen.getByText('Public landing')).toBeTruthy();
});

test.each([
  '/?invite=invitation',
  '/?household=home',
  '/#access_token=callback',
  '/#error=access_denied',
])('direct entry %s retains the authentication flow', async (path) => {
  window.history.replaceState(null, '', path);
  render(
    <HomeEntry>
      <p>Public landing</p>
    </HomeEntry>,
  );
  await screen.findByText('Authentication and household flow');
  expect(screen.queryByText('Public landing')).toBeNull();
});

test('stored invitations and cleaned callback errors also open authentication', async () => {
  localStorage.setItem(pendingInviteKey, 'invitation');
  const view = render(
    <HomeEntry>
      <p>Public landing</p>
    </HomeEntry>,
  );
  await screen.findByText('Authentication and household flow');
  view.unmount();
  localStorage.clear();
  auth.error = 'Sign-in was canceled.';
  render(
    <HomeEntry>
      <p>Public landing</p>
    </HomeEntry>,
  );
  await screen.findByText('Authentication and household flow');
});

test('sign-in route opens authentication or redirects a restored member to home', async () => {
  const view = render(<SignInEntry />);
  await screen.findByText('Authentication and household flow');
  auth.session = { user: { id: 'member' } };
  view.rerender(<SignInEntry />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  expect(screen.queryByText('Authentication and household flow')).toBeNull();
});

test.each([true, false])(
  'reload waits for sign-in restoration before showing the landing (member: %s)',
  async (restoredMember) => {
    auth.checking = true;
    const entry = (
      <HomeEntry>
        <p>Public landing</p>
      </HomeEntry>
    );
    const view = render(entry);
    expect(screen.getByRole('status').textContent).toContain(
      'Opening HouseMate',
    );
    expect(screen.queryByText('Public landing')).toBeNull();
    expect(screen.queryByText('Authentication and household flow')).toBeNull();
    auth.session = restoredMember ? { user: { id: 'member' } } : null;
    auth.checking = false;
    view.rerender(
      <HomeEntry>
        <p>Public landing</p>
      </HomeEntry>,
    );
    if (restoredMember) {
      await screen.findByText('Authentication and household flow');
      expect(screen.queryByText('Public landing')).toBeNull();
    } else {
      expect(screen.getByText('Public landing')).toBeTruthy();
    }
  },
);

test.each(['Android', 'iPhone'])(
  'signed-out %s Home Screen launches open sign-in instead of marketing',
  async (platform) => {
    if (platform === 'Android') {
      vi.mocked(window.matchMedia).mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList);
    } else {
      Object.defineProperty(navigator, 'standalone', {
        configurable: true,
        value: true,
      });
    }
    render(
      <HomeEntry>
        <p>Public landing</p>
      </HomeEntry>,
    );
    await screen.findByText('Authentication and household flow');
    expect(screen.queryByText('Public landing')).toBeNull();
    expect(window.matchMedia).toHaveBeenCalledWith(
      '(display-mode: standalone)',
    );
  },
);
