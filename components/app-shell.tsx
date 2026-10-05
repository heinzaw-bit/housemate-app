'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { HomeEntry } from './home-entry';
import type { Section } from './workspace';

const sections: Record<string, Section> = {
  '/': 'home',
  '/money': 'money',
  '/house': 'house',
  '/assistant': 'assistant',
  '/profile': 'profile',
  '/notifications': 'notifications',
};
export function AppShell({ children }: { children: ReactNode }) {
  const section = sections[usePathname()];
  if (!section) return children;
  // The same entry and account view stay mounted across all main routes.
  return <HomeEntry section={section}>{children}</HomeEntry>;
}
