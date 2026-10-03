'use client';

import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Heart,
  LayoutDashboard,
  ReceiptText,
  ShoppingBasket,
  Sparkles,
  UserRound,
  UsersRound,
  UtensilsCrossed,
  WalletCards,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { ApiUser, Household } from '@/lib/api';
import {
  disableBrowserPush,
  localPushDevice,
  refreshBrowserPush,
} from '@/lib/web-push';
import { AccountMenu } from './account-menu';
import { Brand } from './brand';
import { HouseholdMenu } from './household-menu';
import { HouseholdSearch } from './household-search';
import { ThemeToggle } from './theme-toggle';
import { WorkspaceLoading } from './workspace-loading';

const HomeDashboard = dynamic(
  () => import('./home-dashboard').then((module) => module.HomeDashboard),
  { loading: WorkspaceLoading },
);
const AssistantWorkspace = dynamic(
  () =>
    import('./assistant-workspace').then((module) => module.AssistantWorkspace),
  { loading: WorkspaceLoading },
);
const HouseWorkspace = dynamic(
  () => import('./house-workspace').then((module) => module.HouseWorkspace),
  { loading: WorkspaceLoading },
);
const MemberSettings = dynamic(
  () => import('./member-settings').then((module) => module.MemberSettings),
  { loading: WorkspaceLoading },
);
const MoneyWorkspace = dynamic(
  () => import('./money-workspace').then((module) => module.MoneyWorkspace),
  { loading: WorkspaceLoading },
);

import { NotificationBell } from './notification-bell';

const NotificationWorkspace = dynamic(
  () =>
    import('./notification-workspace').then(
      (module) => module.NotificationWorkspace,
    ),
  { loading: WorkspaceLoading },
);

export type Section =
  | 'home'
  | 'money'
  | 'house'
  | 'assistant'
  | 'profile'
  | 'notifications';

const navItems = [
  { href: '/', label: 'Home', section: 'home', icon: LayoutDashboard },
  { href: '/money', label: 'Money', section: 'money', icon: WalletCards },
  { href: '/house', label: 'House', section: 'house', icon: UsersRound },
  {
    href: '/assistant',
    label: 'Assistant',
    section: 'assistant',
    icon: Sparkles,
  },
  { href: '/profile', label: 'Profile', section: 'profile', icon: UserRound },
] as const;

export function Workspace({
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
  const [profileSettingsRequest, setProfileSettingsRequest] = useState(0);
  const openHouseholdSettings = () => {
    if (section === 'profile') setProfileSettingsRequest((value) => value + 1);
  };
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
  return (
    <div className="workspace">
      <a className="skip-link" href="#workspace-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <div className="sidebar-top">
          <Brand />
        </div>
        <div className="sidebar-household-control">
          <HouseholdMenu
            key={household.id}
            household={household}
            households={households}
            onSelectHousehold={onSelectHousehold}
            onCreateHousehold={onCreateHousehold}
            onJoinInvite={onJoinInvite}
            settingsHref={`${hrefFor('/profile')}#household-settings`}
            onOpenSettings={openHouseholdSettings}
            busy={signingOut || switchingAccount}
            preview={preview}
          />
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <p>WORKSPACE</p>
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
          <div className="sidebar-note">
            <span className="sidebar-note-icon">
              <Heart size={19} fill="currentColor" />
            </span>
            <strong>Better together.</strong>
            <p>A little more organized, a lot more at home.</p>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-context">
            <div className="mobile-brand">
              <Brand />
            </div>
            <div className="topbar-location">
              <span className="topbar-breadcrumb">HOUSEMATE</span>
              <span className="topbar-slash">/</span>
              <span>
                {navItems.find((item) => item.section === section)?.label ??
                  'Notifications'}
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
            settingsHref={`${hrefFor('/profile')}#household-settings`}
            onOpenSettings={openHouseholdSettings}
            busy={signingOut || switchingAccount}
            preview={preview}
            mobile
          />
        </div>
        <main id="workspace-content" tabIndex={-1} className="page-content">
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
              moneyHref={hrefFor('/money')}
              houseHref={hrefFor('/house')}
            />
          )}
          {section === 'money' &&
            (preview || !token ? (
              <MoneySection household={household} />
            ) : (
              <MoneyWorkspace
                key={household.id}
                household={household}
                token={token}
              />
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
          {section === 'profile' &&
            !preview &&
            token &&
            onMeUpdated &&
            onHouseholdUpdated && (
              <MemberSettings
                key={household.id}
                settingsRequest={profileSettingsRequest}
                me={me}
                household={household}
                token={token}
                onMeUpdated={onMeUpdated}
                onHouseholdUpdated={onHouseholdUpdated}
                onSwitchAccount={onSwitchAccount}
                switchingAccount={switchingAccount}
                accountError={accountError}
                onSignOut={onSignOut}
                signingOut={signingOut}
                signOutError={signOutError}
              />
            )}
          {section === 'profile' && (preview || !token) && (
            <MemberSettings
              key={household.id}
              token=""
              settingsRequest={profileSettingsRequest}
              onMeUpdated={() => {}}
              onHouseholdUpdated={() => {}}
              me={me}
              household={household}
              onSignOut={onSignOut}
              signingOut={signingOut}
              signOutError={signOutError}
              preview={preview || !token}
            />
          )}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Main navigation">
        {navItems.map(({ href, label, section: itemSection, icon: Icon }) => (
          <Link
            key={href}
            href={hrefFor(href)}
            className={`mobile-nav-link ${section === itemSection ? 'active' : ''}`}
            aria-current={section === itemSection ? 'page' : undefined}
          >
            <Icon size={21} strokeWidth={1.9} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function HomeSection({
  token,
  firstName,
  household,
  moneyHref,
  houseHref,
}: {
  token?: string;
  firstName: string;
  household: Household;
  moneyHref: string;
  houseHref: string;
}) {
  return (
    <div className="content-inner">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">YOUR HOUSEHOLD, AT A GLANCE</span>
          <h1>
            Good to see you, <em>{firstName}.</em>
          </h1>
          <p>Here&apos;s what&apos;s happening at home.</p>
        </div>
      </div>

      {token ? (
        <HomeDashboard key={household.id} household={household} token={token} />
      ) : (
        <>
          <div className="home-top-grid">
            <section className="balance-card">
              <div className="balance-orbit orbit-one" />
              <div className="balance-orbit orbit-two" />
              <div className="balance-card-content">
                <span className="light-tag">
                  <span /> MONEY, MADE SIMPLE
                </span>
                <div>
                  <p className="balance-kicker">Shared expenses</p>
                  <h2>
                    Every cost,
                    <br />
                    clearly shared.
                  </h2>
                  <p className="balance-description">
                    Add a cost or review each confirmed expense and its exact
                    split.
                  </p>
                </div>
                <Link href={moneyHref} className="balance-link">
                  Explore Money <ArrowUpRight size={18} />
                </Link>
              </div>
              <div className="balance-card-art" aria-hidden="true">
                <span className="art-coin art-coin-one">฿</span>
                <span className="art-coin art-coin-two">$</span>
                <span className="art-spark">✳</span>
              </div>
            </section>
            <Card className="tonight-card">
              <div className="card-topline">
                <span className="card-icon peach">
                  <UtensilsCrossed size={20} />
                </span>
                <span className="card-caption">TONIGHT AT HOME</span>
              </div>
              <h2>What&apos;s for dinner?</h2>
              <p>
                No meal plans yet. When someone plans a meal, you&apos;ll see it
                here.
              </p>
              <div className="tonight-card-bottom">
                <span className="status-soft">
                  <Clock3 size={15} /> All clear for now
                </span>
                <span className="decorative-sun" aria-hidden="true">
                  ✳
                </span>
              </div>
            </Card>
          </div>

          <div className="section-heading">
            <div>
              <span className="eyebrow">THE EVERYDAY STUFF</span>
              <h2>A little less to keep in your head.</h2>
            </div>
            <Link href={houseHref} className="inline-link">
              Explore House <ArrowRight size={17} />
            </Link>
          </div>

          <div className="overview-grid">
            <Card className="overview-card">
              <span className="card-icon mint">
                <ShoppingBasket size={20} />
              </span>
              <div>
                <h3>Shopping</h3>
                <p>Nothing needed right now.</p>
              </div>
              <span className="overview-count">
                00 <small>ITEMS</small>
              </span>
            </Card>
            <Card className="overview-card">
              <span className="card-icon lilac">
                <ClipboardList size={20} />
              </span>
              <div>
                <h3>Chores</h3>
                <p>No chores due today.</p>
              </div>
              <span className="overview-count">
                00 <small>DUE</small>
              </span>
            </Card>
            <Card className="overview-card">
              <span className="card-icon butter">
                <CalendarDays size={20} />
              </span>
              <div>
                <h3>Upcoming</h3>
                <p>No events on the calendar.</p>
              </div>
              <span className="overview-count">
                00 <small>EVENTS</small>
              </span>
            </Card>
          </div>

          <div className="bottom-grid">
            <Card className="activity-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">LATEST UPDATES</span>
                  <h2>Activity</h2>
                </div>
                <span className="card-icon gray">
                  <Bell size={19} />
                </span>
              </div>
              <div className="empty-activity">
                <span className="empty-activity-mark">✳</span>
                <div>
                  <strong>It&apos;s quiet here for now.</strong>
                  <p>
                    Household updates will appear here when things get moving.
                  </p>
                </div>
              </div>
            </Card>
            <Card className="house-tip">
              <div className="house-tip-mark">✳</div>
              <span className="eyebrow">A GOOD PLACE TO START</span>
              <h2>
                Make this space
                <br />
                feel like yours.
              </h2>
              <p>
                Your household is ready. Shared expenses, plans, and updates
                will come together here.
              </p>
              <div className="house-tip-line">
                <CheckCircle2 size={17} /> {household.name} is set up
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function MoneySection({ household }: { household: Household }) {
  return (
    <div className="content-inner">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">CLEAR MONEY, CLEAR MINDS</span>
          <h1>
            Money, <em>without the math.</em>
          </h1>
          <p>Every shared cost will have a place and a clear explanation.</p>
        </div>
        <Badge variant="secondary" className="currency-badge">
          {household.defaultCurrency === 'THB' ? '฿' : '$'}{' '}
          <span>{household.defaultCurrency} HOUSEHOLD</span>
        </Badge>
      </div>
      <div className="money-intro">
        <div>
          <span className="light-tag">
            <span /> YOUR MONEY OVERVIEW
          </span>
          <h2>
            Nothing to settle.
            <br />
            <em>Everything in its place.</em>
          </h2>
          <p>
            Expenses, bills, and balances will appear here as your household
            starts sharing costs.
          </p>
        </div>
        <ReceiptText size={112} strokeWidth={0.9} aria-hidden="true" />
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR FINANCES</span>
          <h2>A clear view of every shared cost.</h2>
        </div>
      </div>
      <div className="feature-grid">
        <FeatureMini
          icon={ReceiptText}
          title="Expenses"
          description="See the costs your household shares."
        />
        <FeatureMini
          icon={WalletCards}
          title="Balances"
          description="Know what you owe and what you're owed."
        />
        <FeatureMini
          icon={CheckCircle2}
          title="Settlements"
          description="Record payments made outside HouseMate."
        />
      </div>
      <p className="section-note">
        This design preview has no live household data. Sign in to add and view
        confirmed expenses.
      </p>
    </div>
  );
}

function HouseSection({ household }: { household: Household }) {
  return (
    <div className="content-inner">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">ALL UNDER ONE ROOF</span>
          <h1>
            Make room for <em>life together.</em>
          </h1>
          <p>Plans, tasks, and everyday decisions for {household.name}.</p>
        </div>
      </div>
      <div className="house-hero">
        <span className="house-hero-icon">
          <Heart size={26} fill="currentColor" />
        </span>
        <div>
          <span className="eyebrow">YOUR SHARED SPACE</span>
          <h2>A home runs better together.</h2>
          <p>The small things add up. Keep them in one calm place.</p>
        </div>
        <span className="house-hero-decoration" aria-hidden="true">
          ✳
        </span>
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">HOUSEHOLD TOOLS</span>
          <h2>Everything in its place.</h2>
        </div>
      </div>
      <div className="house-modules">
        <HouseModule
          icon={UtensilsCrossed}
          color="peach"
          title="Meals"
          description="Make plans and see who's joining."
        />
        <HouseModule
          icon={ShoppingBasket}
          color="mint"
          title="Shopping"
          description="Keep the shared list together."
        />
        <HouseModule
          icon={ClipboardList}
          color="lilac"
          title="Chores"
          description="Know what needs doing next."
        />
        <HouseModule
          icon={CalendarDays}
          color="butter"
          title="Events"
          description="Bring everyone into the plan."
        />
        <HouseModule
          icon={Bell}
          color="gray"
          title="Announcements"
          description="Keep important updates visible."
        />
        <HouseModule
          icon={UsersRound}
          color="peach"
          title="Polls"
          description="Make the little decisions together."
        />
      </div>
      <p className="section-note">
        These modules will become interactive as their API endpoints are added.
      </p>
    </div>
  );
}

function AssistantSection() {
  return (
    <div className="content-inner">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">A HELPING HAND</span>
          <h1>
            Meet your <em>household helper.</em>
          </h1>
          <p>Less typing, more time for the people you live with.</p>
        </div>
      </div>
      <div className="assistant-card">
        <span className="assistant-large-icon">
          <Sparkles size={36} />
        </span>
        <span className="eyebrow">COMING AFTER THE ESSENTIALS</span>
        <h2>Ask. Preview. Confirm.</h2>
        <p>
          HouseMate&apos;s assistant will help you find answers and prepare
          household actions. You&apos;ll always review a change before it
          affects your shared records.
        </p>
        <div className="assistant-examples">
          <span>“Who owes for electricity?”</span>
          <span>“Add eggs to shopping”</span>
          <span>“Plan a BBQ this Saturday”</span>
        </div>
      </div>
    </div>
  );
}

type IconType = typeof ReceiptText;
function FeatureMini({
  icon: Icon,
  title,
  description,
}: {
  icon: IconType;
  title: string;
  description: string;
}) {
  return (
    <article className="feature-mini">
      <span className="card-icon mint">
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="soon-tag">COMING NEXT</span>
    </article>
  );
}

function HouseModule({
  icon: Icon,
  color,
  title,
  description,
}: {
  icon: IconType;
  color: string;
  title: string;
  description: string;
}) {
  return (
    <article className="house-module">
      <span className={`card-icon ${color}`}>
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="soon-tag">COMING SOON</span>
    </article>
  );
}
