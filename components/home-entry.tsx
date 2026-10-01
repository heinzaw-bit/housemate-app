'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { pendingInviteKey } from '@/lib/invites';
import { Brand } from './brand';

const AppView = dynamic(
  () => import('./app-view').then((module) => module.AppView),
  { loading: EntryLoading },
);

function EntryLoading() {
  return (
    <div className="full-loading" role="status">
      <Brand />
      <span>Opening HouseMate…</span>
    </div>
  );
}

export function HomeEntry({ children }: { children: ReactNode }) {
  const { session, error } = useAuth();
  const [authIntent, setAuthIntent] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    let invitePending = false;
    try {
      invitePending = Boolean(localStorage.getItem(pendingInviteKey));
    } catch {
      // URL invites and callbacks can still open authentication.
    }
    setAuthIntent(
      invitePending ||
        url.searchParams.has('invite') ||
        url.searchParams.has('household') ||
        url.searchParams.has('error') ||
        fragment.has('access_token') ||
        fragment.has('error'),
    );
  }, []);
  if (session || error || authIntent) return <AppView section="home" />;
  return children;
}

export function SignInEntry() {
  const { session, checking } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!checking && session) router.replace('/');
  }, [session, checking, router]);
  if (checking || session) return <EntryLoading />;
  return <AppView section="home" />;
}
