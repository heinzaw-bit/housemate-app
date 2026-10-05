'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { pendingInviteKey } from '@/lib/invites';
import { Brand } from './brand';
import type { Section } from './workspace';

const AppView = dynamic(
  () => import('./app-view').then((module) => module.AppView),
  { loading: EntryLoading },
);

export function EntryLoading() {
  return (
    <div className="full-loading" role="status">
      <Brand />
      <span>Opening HouseMate…</span>
    </div>
  );
}

export function HomeEntry({
  children,
  section = 'home',
}: {
  children: ReactNode;
  section?: Section;
}) {
  const { session, checking, error } = useAuth();
  const [entry, setEntry] = useState<{
    authIntent: boolean;
    standalone: boolean;
  } | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    let invitePending = false;
    try {
      invitePending = Boolean(localStorage.getItem(pendingInviteKey));
    } catch {
      // URL invites and callbacks can still open authentication.
    }
    const authIntent =
      section !== 'home' ||
      invitePending ||
      url.searchParams.has('invite') ||
      url.searchParams.has('household') ||
      url.searchParams.has('error') ||
      fragment.has('access_token') ||
      fragment.has('error');
    const mode = window.matchMedia('(display-mode: standalone)');
    const check = () =>
      setEntry({
        authIntent,
        standalone:
          mode.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      });
    check();
    mode.addEventListener('change', check);
    return () => mode.removeEventListener('change', check);
  }, [section]);
  if (checking || !entry) return <EntryLoading />;
  if (
    section !== 'home' ||
    session ||
    error ||
    entry.authIntent ||
    entry.standalone
  )
    return <AppView section={section} />;
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
