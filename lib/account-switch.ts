import type { SupabaseClient } from '@supabase/supabase-js';

export class AccountSwitchBlockedError extends Error {
  constructor() {
    super('Finish or discard your open draft before switching accounts.');
  }
}

export async function switchGoogleAccount({
  client,
  origin,
  canLeave,
  disconnectPush,
  clearSelection,
  navigate,
}: {
  client: SupabaseClient;
  origin: string;
  canLeave: () => boolean;
  disconnectPush: () => Promise<unknown>;
  clearSelection: () => void;
  navigate: (url: string) => void;
}) {
  if (!canLeave()) throw new AccountSwitchBlockedError();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: origin,
      queryParams: { prompt: 'select_account' },
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in could not start.');
  if (!canLeave()) throw new AccountSwitchBlockedError();
  await disconnectPush();
  // A draft may have opened while device cleanup was in flight.
  if (!canLeave()) throw new AccountSwitchBlockedError();
  clearSelection();
  navigate(data.url);
}
