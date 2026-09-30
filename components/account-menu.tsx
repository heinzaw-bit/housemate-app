'use client';

import { Menu } from '@base-ui/react/menu';
import { ArrowRightLeft, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import type { ApiUser } from '@/lib/api';

export function AccountMenu({
  me,
  profileHref,
  onSwitchAccount,
  onSignOut,
  busy,
  error,
  preview = false,
}: {
  me: ApiUser;
  profileHref: string;
  onSwitchAccount?: () => Promise<void>;
  onSignOut: () => Promise<void> | void;
  busy: boolean;
  error: string;
  preview?: boolean;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="topbar-avatar"
        aria-label={`Account menu for ${me.displayName}`}
        title="Account menu"
      >
        {me.displayName.charAt(0).toUpperCase()}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          sideOffset={8}
          align="end"
          className="account-menu-positioner"
        >
          <Menu.Popup className="account-menu" aria-label="Your account">
            <div className="account-menu-identity">
              <strong>{me.displayName}</strong>
              <span>{me.email ?? 'HouseMate member'}</span>
            </div>
            <Menu.LinkItem
              className="account-menu-item"
              render={<Link href={profileHref} />}
              closeOnClick
            >
              <UserRound size={18} aria-hidden="true" /> Profile
            </Menu.LinkItem>
            <Menu.Item
              className="account-menu-item"
              disabled={busy || preview || !onSwitchAccount}
              closeOnClick={false}
              onClick={() => void onSwitchAccount?.()}
            >
              <ArrowRightLeft size={18} aria-hidden="true" />
              {busy ? 'Please wait…' : 'Switch Google account'}
            </Menu.Item>
            {!onSwitchAccount && !preview && (
              <p className="account-menu-note">
                Google sign-in is unavailable. Sign out to use an email link.
              </p>
            )}
            <Menu.Item
              className="account-menu-item"
              disabled={busy || preview}
              closeOnClick={false}
              onClick={() => void onSignOut()}
            >
              <LogOut size={18} aria-hidden="true" /> Sign out
            </Menu.Item>
            {error && (
              <p className="account-menu-error" role="alert">
                {error}
              </p>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
