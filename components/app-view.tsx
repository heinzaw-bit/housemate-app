'use client';

import { AlertCircle, ArrowRight, LoaderCircle, RefreshCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  AccountSwitchBlockedError,
  switchGoogleAccount,
} from '@/lib/account-switch';
import {
  ApiRequestError,
  type ApiUser,
  getHousehold,
  getHouseholds,
  getMe,
  type Household,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { describeAuthFailure } from '@/lib/auth-errors';
import { pendingInviteKey } from '@/lib/invites';
import { hasPendingWork } from '@/lib/pending-work';
import { clearRecentReads } from '@/lib/recent-reads';
import { disableBrowserPush } from '@/lib/web-push';
import { AuthScreen } from './auth-screen';
import { Brand } from './brand';
import { JoinInvite } from './join-invite';
import { OnboardingScreen } from './onboarding-screen';
import { type Section, Workspace } from './workspace';

interface LoadedData {
  me: ApiUser;
  households: Household[];
}

export function AppView({ section }: { section: Section }) {
  const { session } = useAuth();
  // Replace the entire view on account changes, including cross-tab sign-in.
  // No previous account's data, errors or drafts survive until a new API read.
  return (
    <AccountView key={session?.user.id ?? 'signed-out'} section={section} />
  );
}

function AccountView({ section }: { section: Section }) {
  const { client, session, checking, configured, error: authError } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [creatingAnother, setCreatingAnother] = useState(false);
  const [routeReady, setRouteReady] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [accountError, setAccountError] = useState('');
  const token = session?.access_token;
  const routeParams = useSearchParams();
  const routeHousehold = routeParams.get('household');
  const routeInvite = routeParams.get('invite');
  const priorHousehold = useRef<string | null | undefined>(undefined);
  const locallySelected = useRef<string | null>(null);

  useEffect(() => {
    // The initial Home URL may omit the household selector. Remember the
    // authorized selection so adding that same selector does not reload it.
    if (!data) return;
    const current =
      data.households.find((household) => household.id === selectedId) ??
      data.households[0];
    if (current) locallySelected.current = current.id;
  }, [data, selectedId]);

  useEffect(() => {
    if (
      priorHousehold.current !== routeHousehold &&
      routeHousehold !== locallySelected.current
    ) {
      clearRecentReads();
    }
    priorHousehold.current = routeHousehold;
    const url = new URL(window.location.href);
    const invite = routeInvite;
    if (invite) {
      const boundedInvite = invite.slice(0, 128);
      window.localStorage.setItem(pendingInviteKey, boundedInvite);
      setPendingInvite(boundedInvite);
      url.searchParams.delete('invite');
      window.history.replaceState(
        null,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    } else {
      setPendingInvite(window.localStorage.getItem(pendingInviteKey));
    }
    const householdId = routeHousehold;
    setRequestedId(
      householdId === locallySelected.current ? null : householdId,
    );
    setSelectedId(
      householdId ?? window.localStorage.getItem('housemate.selectedHousehold'),
    );
    setRouteReady(true);
  }, [routeHousehold, routeInvite]);

  useEffect(() => {
    if (!token || !routeReady) {
      setData(null);
      setError('');
      return;
    }
    let active = true;
    if (retryKey > 0) setData(null);
    setLoading(true);
    setError('');
    Promise.all([
      getMe(token),
      getHouseholds(token),
      requestedId ? getHousehold(token, requestedId) : Promise.resolve(null),
    ])
      .then(([me, households]) => {
        if (active) setData({ me, households });
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof ApiRequestError
              ? cause.status === 404 && requestedId
                ? 'You do not have access to this household.'
                : cause.message
              : 'Could not load your home. Please try again.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, retryKey, routeReady, requestedId]);

  function selectHousehold(id: string) {
    locallySelected.current = id;
    clearRecentReads();
    setSelectedId(id);
    setRequestedId(null);
    window.localStorage.setItem('housemate.selectedHousehold', id);
    const url = new URL(window.location.href);
    url.searchParams.set('household', id);
    // Entity links and create/event-prefill parameters belong to the old household.
    for (const key of [
      'record',
      'event',
      'meal',
      'chore',
      'item',
      'announcement',
      'poll',
      'add',
    ])
      url.searchParams.delete(key);
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function startJoin(inviteToken: string) {
    window.localStorage.setItem(pendingInviteKey, inviteToken);
    setPendingInvite(inviteToken);
  }

  function clearJoin() {
    window.localStorage.removeItem(pendingInviteKey);
    setPendingInvite(null);
  }

  function clearHouseholdLink() {
    const url = new URL(window.location.href);
    url.searchParams.delete('household');
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
    setRequestedId(null);
    setSelectedId(null);
    setRetryKey((key) => key + 1);
  }

  async function signOut() {
    if (!client || signingOut || switchingAccount) return;
    if (hasPendingWork()) {
      setSignOutError('Finish or discard your open draft before signing out.');
      return;
    }
    setSigningOut(true);
    setSignOutError('');
    try {
      await disableBrowserPush(token).catch(() => {});
      if (hasPendingWork()) {
        setSignOutError(
          'Finish or discard your open draft before signing out.',
        );
        return;
      }
      const { error: authError } = await client.auth.signOut({
        scope: 'local',
      });
      if (authError) {
        setSignOutError(describeAuthFailure(authError, 'signout'));
      } else {
        window.localStorage.removeItem('housemate.selectedHousehold');
        router.replace('/sign-in?signed-out=1');
      }
    } catch (failure) {
      setSignOutError(
        describeAuthFailure(
          failure instanceof Error ? failure : null,
          'signout',
        ),
      );
    } finally {
      setSigningOut(false);
    }
  }

  async function switchAccount() {
    if (!client || switchingAccount || signingOut) return;
    setAccountError('');
    if (!navigator.onLine) {
      setAccountError('Reconnect to the internet before switching accounts.');
      return;
    }
    setSwitchingAccount(true);
    try {
      await switchGoogleAccount({
        client,
        origin: window.location.origin,
        canLeave: () => !hasPendingWork(),
        disconnectPush: () => disableBrowserPush(token).catch(() => {}),
        clearSelection: () => {
          window.localStorage.removeItem('housemate.selectedHousehold');
          window.localStorage.removeItem(pendingInviteKey);
        },
        navigate: (url) => window.location.assign(url),
      });
    } catch (failure) {
      setAccountError(
        failure instanceof AccountSwitchBlockedError
          ? failure.message
          : describeAuthFailure(
              failure instanceof Error ? failure : null,
              'google',
            ),
      );
    } finally {
      setSwitchingAccount(false);
    }
  }

  if (checking || !routeReady || (token && loading && !data)) {
    return (
      <div className="full-loading">
        <Brand />
        <LoaderCircle className="spin" size={26} />
        <span>Finding your place…</span>
      </div>
    );
  }

  if (!session || !token)
    return (
      <AuthScreen
        client={client}
        configured={configured}
        callbackError={authError}
        joinPending={Boolean(pendingInvite)}
        signedOut={routeParams.get('signed-out') === '1'}
      />
    );

  if (error) {
    return (
      <main className="error-page">
        <Brand />
        <div className="error-card">
          <span className="error-icon">
            <AlertCircle size={27} />
          </span>
          <h1>We couldn&apos;t open your home.</h1>
          <p>{error}</p>
          <div className="error-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => setRetryKey((key) => key + 1)}
            >
              <RefreshCw size={17} /> Try again
            </button>
            {requestedId && (
              <button
                className="secondary-button"
                type="button"
                onClick={clearHouseholdLink}
              >
                Open my households
              </button>
            )}
            <button
              className="text-button"
              type="button"
              onClick={signOut}
              disabled={signingOut}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}{' '}
              <ArrowRight size={17} />
            </button>
            {signOutError && (
              <p className="form-message error" role="alert">
                {signOutError}
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  const displayedHousehold =
    data?.households.find((household) => household.id === selectedId) ??
    data?.households[0];
  if (!data || (routeHousehold && displayedHousehold?.id !== routeHousehold))
    return (
      <div className="full-loading">
        <Brand />
        <LoaderCircle className="spin" size={26} />
      </div>
    );

  if (pendingInvite) {
    return (
      <JoinInvite
        token={token}
        inviteToken={pendingInvite}
        onAccepted={(household) => {
          clearJoin();
          setData((current) =>
            current
              ? {
                  ...current,
                  households: [
                    ...current.households.filter(
                      (item) => item.id !== household.id,
                    ),
                    household,
                  ],
                }
              : current,
          );
          selectHousehold(household.id);
        }}
        onCancel={clearJoin}
      />
    );
  }

  if (data.households.length === 0 || creatingAnother) {
    return (
      <OnboardingScreen
        token={token}
        client={client}
        initialMode={creatingAnother ? 'create' : 'choose'}
        onCancel={creatingAnother ? () => setCreatingAnother(false) : undefined}
        onJoinInvite={startJoin}
        onCreated={(household) => {
          setData((current) =>
            current
              ? {
                  ...current,
                  households: [
                    ...current.households.filter(
                      (item) => item.id !== household.id,
                    ),
                    household,
                  ],
                }
              : current,
          );
          selectHousehold(household.id);
          setCreatingAnother(false);
        }}
      />
    );
  }

  const activeHousehold =
    data.households.find((household) => household.id === selectedId) ??
    data.households[0];
  return (
    <Workspace
      key={data.me.id}
      section={section}
      me={data.me}
      households={data.households}
      household={activeHousehold}
      onSelectHousehold={selectHousehold}
      token={token}
      onMeUpdated={(me) =>
        setData((current) => (current ? { ...current, me } : current))
      }
      onHouseholdUpdated={(household) =>
        setData((current) =>
          current
            ? {
                ...current,
                households: current.households.map((item) =>
                  item.id === household.id ? household : item,
                ),
              }
            : current,
        )
      }
      onJoinInvite={startJoin}
      onCreateHousehold={() => setCreatingAnother(true)}
      onSignOut={signOut}
      signingOut={signingOut}
      signOutError={signOutError}
      onSwitchAccount={
        process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true'
          ? switchAccount
          : undefined
      }
      switchingAccount={switchingAccount}
      accountError={accountError || authError}
    />
  );
}
