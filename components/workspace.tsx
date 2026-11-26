'use client';

import {
  ArrowRight,
  Bell,
  Home,
  Settings,
  Sparkles,
  UserRound,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ApiUser, Household } from '@/lib/api';
import { previewDashboard } from '@/lib/preview-dashboard';
import {
  disableBrowserPush,
  localPushDevice,
  refreshBrowserPush,
} from '@/lib/web-push';
import { AccountMenu } from './account-menu';
import { Brand } from './brand';
import { HouseTools, type HouseView, houseTools } from './house-tools';
import { HouseholdMenu } from './household-menu';
import { HouseholdOverview } from './household-overview';
import { HouseholdSearch } from './household-search';
import { MoneyPreview } from './money-preview';
import { SavedDraftProvider } from './saved-draft';
import { ThemeToggle } from './theme-toggle';
import { WorkspaceLoading } from './workspace-loading';

const HomeDashboard = dynamic(
  () => import('./home-dashboard').then((module) => module.HomeDashboard),
  { loading: () => <WorkspaceLoading kind="home" /> },
);
const AssistantWorkspace = dynamic(
  () =>
    import('./assistant-workspace').then((module) => module.AssistantWorkspace),
  { loading: () => <WorkspaceLoading kind="assistant" /> },
);
const HouseWorkspace = dynamic(
  () => import('./house-workspace').then((module) => module.HouseWorkspace),
  { loading: () => <WorkspaceLoading /> },
);
const MemberSettings = dynamic(
  () => import('./member-settings').then((module) => module.MemberSettings),
  { loading: () => <WorkspaceLoading kind="profile" /> },
);
const MoneyWorkspace = dynamic(
  () => import('./money-workspace').then((module) => module.MoneyWorkspace),
  { loading: () => <WorkspaceLoading kind="money" /> },
);

import { NotificationBell } from './notification-bell';

const NotificationWorkspace = dynamic(
  () =>
    import('./notification-workspace').then(
      (module) => module.NotificationWorkspace,
    ),
  { loading: () => <WorkspaceLoading /> },
);

export type Section =
  | 'home'
  | 'money'
  | 'house'
  | 'assistant'
  | 'profile'
  | 'settings'
  | 'notifications';

const navItems = [
  { href: '/', label: 'Home', section: 'home', icon: Home },
  { href: '/money', label: 'Money', section: 'money', icon: WalletCards },
  { href: '/house', label: 'Board', section: 'house', icon: UsersRound },
  {
    href: '/assistant',
    label: 'Assistant',
    section: 'assistant',
    icon: Sparkles,
  },
  { href: '/profile', label: 'Profile', section: 'profile', icon: UserRound },
] as const;

export function Workspace(props: Parameters<typeof ScopedWorkspace>[0]) {
  return (
    <SavedDraftProvider
      account={props.preview ? '' : props.me.id}
      household={props.household.id}
      households={props.households.map((household) => household.id)}
      context={`${props.household.defaultCurrency}:${props.household.timezone}`}
    >
      <ScopedWorkspace
        key={`${props.me.id}:${props.household.id}:${props.household.defaultCurrency}:${props.household.timezone}`}
        {...props}
      />
    </SavedDraftProvider>
  );
}

function ScopedWorkspace({
  section,
  me,
  households,
  household,
  onSelectHousehold,
  token,
  onMeUpdated,
  onHouseholdUpdated,
  onJoinInvite,
  onCreateHousehold,
  onSignOut,
  signingOut,
  signOutError,
  onSwitchAccount,
  switchingAccount = false,
  accountError = '',
  preview = false,
}: {
  section: Section;
  me: ApiUser;
  households: Household[];
  household: Household;
  onSelectHousehold: (id: string) => void;
  token?: string;
  onMeUpdated?: (user: ApiUser) => void;
  onHouseholdUpdated?: (household: Household) => void;
  onJoinInvite?: (inviteToken: string) => void;
  onCreateHousehold?: () => void;
  onSignOut: () => Promise<void> | void;
  signingOut: boolean;
  signOutError: string;
  onSwitchAccount?: () => Promise<void>;
  switchingAccount?: boolean;
  accountError?: string;
  preview?: boolean;
}) {
  const firstName = me.displayName.split(' ')[0] || 'there';
  useEffect(() => {
    if (!token || preview) return;
    const sync = () => {
      const previous = localPushDevice();
      if (previous && previous.accountId !== me.id)
        void disableBrowserPush().catch(() => {});
      else void refreshBrowserPush(token, me.id).catch(() => {});
    };
    sync();
    window.addEventListener('focus', sync);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'housemate.push.subscription-changed') sync();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('focus', sync);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [token, me.id, preview]);
  const hrefFor = (href: string) =>
    preview
      ? `/preview${href === '/' ? '' : href}`
      : `${href}?household=${encodeURIComponent(household.id)}`;
  const settingsHref = hrefFor('/settings');
  const householdSettingsHref = `${settingsHref}#household-settings`;
  return (
    <div className="workspace design-workspace">
      <a className="skip-link" href="#workspace-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <div className="sidebar-top">
          <Brand refreshable />
        </div>
        <div className="sidebar-household-control">
          <HouseholdMenu
            key={household.id}
            household={household}
            households={households}
            onSelectHousehold={onSelectHousehold}
            onCreateHousehold={onCreateHousehold}
            onJoinInvite={onJoinInvite}
            settingsHref={householdSettingsHref}
            busy={signingOut || switchingAccount}
            preview={preview}
          />
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map(({ href, label, section: itemSection, icon: Icon }) => (
            <Link
              key={href}
              href={hrefFor(href)}
              className={`sidebar-link ${section === itemSection ? 'active' : ''}`}
              aria-current={section === itemSection ? 'page' : undefined}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{label}</span>
              {section === itemSection && <span className="active-mark" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            className={`sidebar-link ${section === 'settings' ? 'active' : ''}`}
            aria-current={section === 'settings' ? 'page' : undefined}
            href={settingsHref}
          >
            <Settings size={18} aria-hidden="true" />
            <span>Settings</span>
            {section === 'settings' && <span className="active-mark" />}
          </Link>
          <div className="design-user-mini">
            <span className="design-user-avatar">
              {firstName.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{me.displayName || firstName}</strong>
              <small>
                {household.role === 'owner'
                  ? 'House owner'
                  : household.role === 'admin'
                    ? 'House admin'
                    : 'House member'}
              </small>
            </span>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-context">
            <div className="mobile-brand">
              <Brand refreshable />
            </div>
            <div className="topbar-location">
              <span className="topbar-breadcrumb">HOUSEMATE</span>
              <span className="topbar-slash">/</span>
              <span>
                {section === 'settings'
                  ? 'Settings'
                  : (navItems.find((item) => item.section === section)?.label ??
                    'Notifications')}
              </span>
            </div>
            <HouseholdSearch
              key={`${me.id}:${household.id}`}
              token={preview ? undefined : token}
              household={household}
              disabled={signingOut || switchingAccount}
            />
          </div>
          <div className="topbar-actions">
            <span className="topbar-date">
              {new Intl.DateTimeFormat('en', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              }).format(new Date())}
            </span>
            {token && !preview ? (
              <NotificationBell
                key={`${me.id}:${household.id}`}
                token={token}
                householdId={household.id}
                accountId={me.id}
              />
            ) : (
              <button
                type="button"
                className="header-icon-button header-icon-button-plain"
                disabled
                aria-label="Notifications unavailable in preview"
                title="Notifications are available in the signed-in app"
              >
                <Bell size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
            <ThemeToggle />
            <AccountMenu
              me={me}
              profileHref={hrefFor('/profile')}
              onSwitchAccount={onSwitchAccount}
              onSignOut={onSignOut}
              busy={signingOut || switchingAccount}
              error={accountError || signOutError}
              preview={preview}
            />
          </div>
        </header>

        <div className="mobile-household-control">
          <HouseholdMenu
            key={household.id}
            household={household}
            households={households}
            onSelectHousehold={onSelectHousehold}
            onCreateHousehold={onCreateHousehold}
            onJoinInvite={onJoinInvite}
            settingsHref={householdSettingsHref}
            busy={signingOut || switchingAccount}
            preview={preview}
            mobile
          />
        </div>
        <main id="workspace-content" tabIndex={-1} className="page-content">
          <div className="motion-section" key={section}>
            {section === 'notifications' && token && !preview && (
              <NotificationWorkspace
                key={household.id}
                token={token}
                household={household}
                accountId={me.id}
              />
            )}
            {section === 'home' && (
              <HomeSection
                key={household.id}
                token={preview ? undefined : token}
                firstName={firstName}
                household={household}
                preview={preview}
              />
            )}
            {section === 'money' &&
              (preview ? (
                <MoneyPreview household={household} />
              ) : token ? (
                <MoneyWorkspace
                  key={household.id}
                  household={household}
                  token={token}
                />
              ) : (
                <p role="status">Sign in to load your household’s money.</p>
              ))}
            {section === 'house' &&
              (preview || !token ? (
                <HouseSection household={household} />
              ) : (
                <HouseWorkspace
                  key={household.id}
                  household={household}
                  token={token}
                />
              ))}
            {section === 'assistant' &&
              (preview || !token ? (
                <AssistantSection />
              ) : (
                <AssistantWorkspace
                  key={household.id}
                  household={household}
                  token={token}
                />
              ))}
            {(section === 'profile' || section === 'settings') && (
              <MemberSettings
                key={section}
                page={section}
                settingsHref={settingsHref}
                token={token ?? ''}
                onMeUpdated={onMeUpdated}
                onHouseholdUpdated={onHouseholdUpdated}
                me={me}
                household={household}
                onSwitchAccount={onSwitchAccount}
                switchingAccount={switchingAccount}
                accountError={accountError}
                onSignOut={onSignOut}
                signingOut={signingOut}
                signOutError={signOutError}
                preview={preview || !token}
              />
            )}
          </div>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Main navigation">
        {navItems.map(({ href, label, section: itemSection, icon: Icon }) => {
          const current =
            section === itemSection
              ? 'page'
              : section === 'settings' && itemSection === 'profile'
                ? 'location'
                : undefined;
          return (
            <Link
              key={href}
              href={hrefFor(href)}
              className={`mobile-nav-link ${current ? 'active' : ''}`}
              aria-current={current}
            >
              <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function HomeSection({
  token,
  firstName,
  household,
  preview,
}: {
  token?: string;
  firstName: string;
  household: Household;
  preview: boolean;
}) {
  return (
    <div className="content-inner">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">
            {new Intl.DateTimeFormat('en', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: household.timezone,
            }).format(new Date())}
          </span>
          <h1>Good to see you, {firstName}</h1>
          <p>Here&apos;s what&apos;s happening at home.</p>
        </div>
      </div>

      {token ? (
        <HomeDashboard key={household.id} household={household} token={token} />
      ) : preview ? (
        <HouseholdOverview
          data={previewDashboard(household)}
          household={household}
          preview
        />
      ) : (
        <p role="status">Sign in to load your household overview.</p>
      )}
    </div>
  );
}

function HouseSection({ household }: { household: Household }) {
  const [view, setView] = useState<HouseView | null>(null);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('view');
    if (houseTools.some((tool) => tool.id === requested))
      setView(requested as HouseView);
  }, []);
  function selectView(next: HouseView) {
    setView(next);
    const url = new URL(window.location.href);
    for (const key of [
      'meal',
      'item',
      'chore',
      'event',
      'announcement',
      'poll',
      'add',
    ])
      url.searchParams.delete(key);
    url.searchParams.set('view', next);
    window.history.replaceState(null, '', url);
  }
  const tool = houseTools.find((item) => item.id === view);
  return (
    <div className="content-inner">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">OUR HOUSE</span>
          <h1>Board</h1>
          <p>Plans, tasks, and the everyday things you share.</p>
        </div>
      </div>
      <HouseTools view={view} onSelect={selectView} />
      {tool && (
        <section className="design-panel design-preview-detail">
          <h2>{tool.title}</h2>
          <p>{tool.detail}</p>
          <p className="design-muted">
            This is a read-only design preview for {household.name}. Sign in to
            see your household’s records and make changes.
          </p>
          <Link href="/sign-in" className="primary-button">
            Sign in to continue <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  );
}

function AssistantSection() {
  return (
    <div className="content-inner">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">YOUR HOUSEHOLD HELPER</span>
          <h1>Assistant</h1>
          <p>Ask questions about life around the house.</p>
        </div>
      </div>
      <section className="design-panel design-preview-chat">
        <span className="design-item-icon green">
          <Sparkles size={22} aria-hidden="true" />
        </span>
        <h2>What can I help with?</h2>
        <p>
          Get clear answers about balances, bills, meals, and your household
          plans.
        </p>
        <div className="assistant-examples">
          <span>How much do I owe?</span>
          <span>Who is eating tonight?</span>
          <span>What needs my attention?</span>
        </div>
        <p className="design-muted">
          Sign in to ask about your household. This preview does not send
          messages or change records.
        </p>
        <Link className="primary-button" href="/sign-in">
          Sign in to ask HouseMate <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
