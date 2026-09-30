'use client';

import { AlertCircle, ArrowRight, LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  const { client, session, checking, configured, error: authError } = useAuth();
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
  const token = session?.access_token;

  useEffect(() => {
    const url = new URL(window.location.href);
    const invite = url.searchParams.get('invite');
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
    const householdId = url.searchParams.get('household');
    setRequestedId(householdId);
    setSelectedId(
      householdId ?? window.localStorage.getItem('housemate.selectedHousehold'),
    );
    setRouteReady(true);
  }, []);

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
    setSelectedId(id);
    setRequestedId(null);
    window.localStorage.setItem('housemate.selectedHousehold', id);
    const url = new URL(window.location.href);
    url.searchParams.set('household', id);
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
    if (!client || signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      await disableBrowserPush(token).catch(() => {});
      const { error: authError } = await client.auth.signOut({
        scope: 'local',
      });
      if (authError) {
        setSignOutError(describeAuthFailure(authError, 'signout'));
      } else {
        window.localStorage.removeItem('housemate.selectedHousehold');
        setSelectedId(null);
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

  if (!data)
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
            current ? { ...current, households: [household] } : current,
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
    />
  );
}
