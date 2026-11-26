'use client';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { hasPendingWork } from '@/lib/pending-work';
import { HomeEntry } from './home-entry';
import type { Section } from './workspace';

const sections: Record<string, Section> = {
  '/': 'home',
  '/money': 'money',
  '/house': 'house',
  '/assistant': 'assistant',
  '/profile': 'profile',
  '/settings': 'settings',
  '/notifications': 'notifications',
};
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const section = sections[path];
  useEffect(() => {
    if (path !== '/profile') return;
    function followLegacySettingsLink() {
      const { search, hash } = window.location;
      if (hash === '#household-settings' && !hasPendingWork())
        router.replace(`/settings${search}${hash}`);
    }
    followLegacySettingsLink();
    window.addEventListener('hashchange', followLegacySettingsLink);
    return () =>
      window.removeEventListener('hashchange', followLegacySettingsLink);
  }, [path, router]);
  if (!section) return children;
  // The same entry and account view stay mounted across all main routes.
  return <HomeEntry section={section}>{children}</HomeEntry>;
}
