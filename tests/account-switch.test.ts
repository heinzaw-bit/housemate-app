import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test, vi } from 'vitest';
import {
  AccountSwitchBlockedError,
  switchGoogleAccount,
} from '../lib/account-switch';

function setup() {
  const signInWithOAuth = vi.fn().mockResolvedValue({
    data: { url: 'https://example.supabase.co/auth/v1/authorize' },
    error: null,
  });
  const signOut = vi.fn();
  const options = {
    client: { auth: { signInWithOAuth, signOut } } as unknown as SupabaseClient,
    origin: 'https://housemate-app.example',
    canLeave: vi.fn(() => true),
    disconnectPush: vi.fn().mockResolvedValue(undefined),
    clearSelection: vi.fn(),
    navigate: vi.fn(),
  };
  return { options, signInWithOAuth, signOut };
}
test('Google account chooser starts without signing out the current session', async () => {
  const { options, signInWithOAuth, signOut } = setup();
  await switchGoogleAccount(options);
  expect(signInWithOAuth).toHaveBeenCalledWith({
    provider: 'google',
    options: {
      redirectTo: options.origin,
      queryParams: { prompt: 'select_account' },
      skipBrowserRedirect: true,
    },
  });
  expect(signOut).not.toHaveBeenCalled();
  expect(options.disconnectPush.mock.invocationCallOrder[0]).toBeLessThan(
    options.clearSelection.mock.invocationCallOrder[0],
  );
  expect(options.navigate).toHaveBeenCalledWith(
    'https://example.supabase.co/auth/v1/authorize',
  );
});
test('existing drafts block OAuth and leave session/selection untouched', async () => {
  const { options, signInWithOAuth } = setup();
  options.canLeave.mockReturnValue(false);
  await expect(switchGoogleAccount(options)).rejects.toBeInstanceOf(
    AccountSwitchBlockedError,
  );
  expect(signInWithOAuth).not.toHaveBeenCalled();
  expect(options.clearSelection).not.toHaveBeenCalled();
});
test('a draft opened during cleanup blocks navigation and keeps selection', async () => {
  const { options } = setup();
  options.disconnectPush.mockImplementation(async () => {
    options.canLeave.mockReturnValue(false);
  });
  await expect(switchGoogleAccount(options)).rejects.toBeInstanceOf(
    AccountSwitchBlockedError,
  );
  expect(options.clearSelection).not.toHaveBeenCalled();
  expect(options.navigate).not.toHaveBeenCalled();
});
test('provider startup failure leaves the current account and device untouched', async () => {
  const { options, signInWithOAuth, signOut } = setup();
  const error = new Error('Provider unavailable');
  signInWithOAuth.mockResolvedValue({ data: { url: null }, error });
  await expect(switchGoogleAccount(options)).rejects.toBe(error);
  expect(options.disconnectPush).not.toHaveBeenCalled();
  expect(options.clearSelection).not.toHaveBeenCalled();
  expect(signOut).not.toHaveBeenCalled();
});
