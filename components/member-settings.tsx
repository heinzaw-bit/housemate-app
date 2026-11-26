'use client';

import {
  ArrowRightLeft,
  Bell,
  ChevronDown,
  ChevronRight,
  LogOut,
  Pencil,
  Settings,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { SuccessNotice } from '@/components/success-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ApiRequestError,
  type ApiUser,
  type Currency,
  createInvite,
  getInvites,
  getMembers,
  type Household,
  type HouseholdInvite,
  type HouseholdMember,
  revokeInvite,
  updateHousehold,
  updateMe,
  updateMemberRole,
} from '@/lib/api';
import { hasPendingWork, useLeaveGuard } from '@/lib/pending-work';
import { InstallApp } from './install-app';
import styles from './member-settings.module.css';
import { ThemeToggle } from './theme-toggle';

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiRequestError ? cause.message : fallback;
}

function inviteStatus(invite: HouseholdInvite): string {
  if (invite.revokedAt) return 'Revoked';
  if (invite.redeemedAt) return 'Used';
  if (new Date(invite.expiresAt).getTime() <= Date.now()) return 'Expired';
  return 'Available';
}

export function MemberSettings({
  page = 'profile',
  settingsHref,
  me,
  household,
  token,
  onMeUpdated,
  onHouseholdUpdated,
  onSignOut,
  signingOut,
  signOutError,
  onSwitchAccount,
  switchingAccount = false,
  accountError = '',
  preview = false,
}: {
  page?: 'profile' | 'settings';
  settingsHref: string;
  me: ApiUser;
  household: Household;
  token: string;
  onMeUpdated?: (user: ApiUser) => void;
  onHouseholdUpdated?: (household: Household) => void;
  onSignOut: () => Promise<void> | void;
  signingOut: boolean;
  signOutError: string;
  onSwitchAccount?: () => Promise<void>;
  switchingAccount?: boolean;
  accountError?: string;
  preview?: boolean;
}) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [name, setName] = useState(household.name);
  const [timezone, setTimezone] = useState(household.timezone);
  const [currency, setCurrency] = useState<Currency>(household.defaultCurrency);
  const [members, setMembers] = useState<HouseholdMember[] | null>(null);
  const [invites, setInvites] = useState<HouseholdInvite[]>([]);
  const [loadError, setLoadError] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [memberMessage, setMemberMessage] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [newLink, setNewLink] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingHousehold, setEditingHousehold] = useState(false);
  const [navigationMessage, setNavigationMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState('');
  const [timezones] = useState(() => Intl.supportedValuesOf('timeZone'));
  const [roleDraft, setRoleDraft] = useState<{
    member: HouseholdMember;
    role: 'admin' | 'member';
  } | null>(null);
  const restoreEditFocus = useRef<'profile' | 'household' | null>(null);
  const profileInput = useRef<HTMLInputElement>(null);
  const householdInput = useRef<HTMLInputElement>(null);
  const roleSelect = useRef<HTMLSelectElement | null>(null);
  const roleConfirm = useRef<HTMLButtonElement>(null);
  const profileEdit = useRef<HTMLButtonElement>(null);
  const householdEdit = useRef<HTMLButtonElement>(null);
  const [loadKey, setLoadKey] = useState(0);
  const isSettings = page === 'settings';
  const householdSection = useRef<HTMLElement>(null);
  const canManage =
    !preview && (household.role === 'owner' || household.role === 'admin');
  const profileDirty = editingProfile && displayName.trim() !== me.displayName;
  const settingsDirty =
    editingHousehold &&
    (name.trim() !== household.name ||
      timezone !== household.timezone ||
      currency !== household.defaultCurrency);
  const busy =
    savingProfile ||
    savingSettings ||
    !!busyMemberId ||
    creatingInvite ||
    !!busyInviteId;
  const pending = profileDirty || settingsDirty || !!roleDraft || busy;
  useLeaveGuard(pending);
  useEffect(() => {
    if (!pending) return;
    function guardNavigation(event: MouseEvent) {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        !anchor ||
        anchor.getAttribute('target') === '_blank' ||
        anchor.hasAttribute('download')
      )
        return;
      const destination = new URL(
        anchor.getAttribute('href') ?? '',
        window.location.href,
      );
      const current = new URL(window.location.href);
      if (
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.searchParams.get('household') ===
          current.searchParams.get('household')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setNavigationMessage(
        `Save or cancel your changes before leaving ${isSettings ? 'Settings' : 'Profile'}.`,
      );
    }
    document.addEventListener('click', guardNavigation, true);
    return () => document.removeEventListener('click', guardNavigation, true);
  }, [isSettings, pending]);
  useEffect(() => {
    if (roleDraft) roleConfirm.current?.focus();
    else if (!busyMemberId) {
      roleSelect.current?.focus();
      roleSelect.current = null;
    }
  }, [roleDraft, busyMemberId]);
  useEffect(() => {
    if (editingProfile) profileInput.current?.focus();
    else if (restoreEditFocus.current === 'profile') {
      profileEdit.current?.focus();
      restoreEditFocus.current = null;
    }
    if (editingHousehold) householdInput.current?.focus();
    else if (restoreEditFocus.current === 'household') {
      householdEdit.current?.focus();
      restoreEditFocus.current = null;
    }
  }, [editingProfile, editingHousehold]);
  useEffect(() => {
    if (!isSettings) return;
    function followAnchor() {
      if (window.location.hash !== '#household-settings' || hasPendingWork())
        return;
      householdSection.current?.scrollIntoView?.({ block: 'start' });
      householdSection.current?.focus({ preventScroll: true });
    }
    followAnchor();
    window.addEventListener('hashchange', followAnchor);
    return () => window.removeEventListener('hashchange', followAnchor);
  }, [isSettings]);

  function cancelProfile() {
    setDisplayName(me.displayName);
    restoreEditFocus.current = 'profile';
    setEditingProfile(false);
    setProfileMessage('');
    setNavigationMessage('');
  }
  function cancelHousehold() {
    setName(household.name);
    setTimezone(household.timezone);
    setCurrency(household.defaultCurrency);
    restoreEditFocus.current = 'household';
    setEditingHousehold(false);
    setSettingsMessage('');
    setNavigationMessage('');
    setTimezoneSearch('');
  }

  useEffect(() => setDisplayName(me.displayName), [me.displayName]);
  useEffect(() => {
    setName(household.name);
    setTimezone(household.timezone);
    setCurrency(household.defaultCurrency);
  }, [household.name, household.timezone, household.defaultCurrency]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadKey intentionally retries the protected reads.
  useEffect(() => {
    if (preview || !isSettings) return;
    let active = true;
    setMembers(null);
    setInvites([]);
    setLoadError('');
    Promise.all([
      getMembers(token, household.id),
      canManage ? getInvites(token, household.id) : Promise.resolve([]),
    ])
      .then(([memberRows, inviteRows]) => {
        if (active) {
          setMembers(memberRows);
          setInvites(inviteRows);
        }
      })
      .catch((cause) => {
        if (active)
          setLoadError(
            errorMessage(cause, 'Could not load household members.'),
          );
      });
    return () => {
      active = false;
    };
  }, [token, household.id, canManage, loadKey, preview, isSettings]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || savingProfile || !profileDirty || !displayName.trim())
      return;
    setSavingProfile(true);
    setProfileMessage('');
    try {
      const updated = await updateMe(token, displayName.trim());
      onMeUpdated?.(updated);
      setEditingProfile(false);
      setNavigationMessage('');
      setProfileMessage('Profile saved.');
      restoreEditFocus.current = 'profile';
    } catch (cause) {
      setProfileMessage(errorMessage(cause, 'Could not save your profile.'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canManage ||
      savingSettings ||
      !settingsDirty ||
      !name.trim() ||
      !timezone
    )
      return;
    setSavingSettings(true);
    setSettingsMessage('');
    try {
      const updated = await updateHousehold(token, household.id, {
        name: name.trim(),
        timezone: timezone.trim(),
        ...(household.role === 'owner' && household.currencyEditable
          ? { currency }
          : {}),
      });
      onHouseholdUpdated?.(updated);
      setEditingHousehold(false);
      setNavigationMessage('');
      setSettingsMessage('Household settings saved.');
      restoreEditFocus.current = 'household';
    } catch (cause) {
      setSettingsMessage(
        errorMessage(cause, 'Could not save household settings.'),
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function changeRole(member: HouseholdMember, role: 'admin' | 'member') {
    if (
      preview ||
      busyMemberId ||
      household.role !== 'owner' ||
      member.role === 'owner' ||
      member.role === role
    )
      return;
    setRoleDraft(null);
    setBusyMemberId(member.id);
    setMemberMessage('');
    try {
      const updated = await updateMemberRole(
        token,
        household.id,
        member.id,
        role,
      );
      setMembers(
        (current) =>
          current?.map((item) => (item.id === updated.id ? updated : item)) ??
          null,
      );
      setMemberMessage(`${updated.displayName} is now ${updated.role}.`);
    } catch (cause) {
      setMemberMessage(errorMessage(cause, 'Could not change this role.'));
    } finally {
      setBusyMemberId(null);
    }
  }

  async function makeInvite() {
    if (!canManage || creatingInvite || !members || loadError) return;
    setCreatingInvite(true);
    setInviteMessage('');
    setNewLink('');
    try {
      const invite = await createInvite(token, household.id);
      setNewLink(
        `${window.location.origin}/?invite=${encodeURIComponent(invite.token)}`,
      );
      setInvites((current) => [invite, ...current]);
      setInviteMessage(
        'New invitation ready. Copy and share it with one person.',
      );
    } catch (cause) {
      setInviteMessage(errorMessage(cause, 'Could not create an invitation.'));
    } finally {
      setCreatingInvite(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(newLink);
      setInviteMessage('Invitation link copied.');
    } catch {
      setInviteMessage('Copy the link from the field below.');
    }
  }

  async function revoke(inviteId: string) {
    if (!canManage || busyInviteId) return;
    setBusyInviteId(inviteId);
    setInviteMessage('');
    try {
      await revokeInvite(token, household.id, inviteId);
      setInvites((current) =>
        current.map((item) =>
          item.id === inviteId
            ? { ...item, revokedAt: new Date().toISOString() }
            : item,
        ),
      );
      setInviteMessage('Invitation revoked.');
    } catch (cause) {
      setInviteMessage(
        errorMessage(cause, 'Could not revoke this invitation.'),
      );
    } finally {
      setBusyInviteId(null);
    }
  }

  const activeInvites = invites.filter(
    (invite) => inviteStatus(invite) === 'Available',
  );
  const oldInvites = invites.filter(
    (invite) => inviteStatus(invite) !== 'Available',
  );
  const zoneOptions = [
    ...new Set([
      timezone,
      ...timezones.filter((zone) =>
        zone
          .toLowerCase()
          .replaceAll('_', ' ')
          .includes(timezoneSearch.toLowerCase().replaceAll('_', ' ')),
      ),
    ]),
  ];
  const accountBusy = signingOut || switchingAccount;
  const initials = me.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toUpperCase();
  return (
    <div className={`content-inner ${styles.page}`}>
      <header className="page-heading-row">
        <div>
          <h1>{isSettings ? 'Settings' : 'Profile'}</h1>
        </div>
      </header>
      {navigationMessage && (
        <p className="form-message error" role="alert">
          {navigationMessage}
        </p>
      )}
      {!isSettings ? (
        <div className={styles.panel}>
          <Card className={styles.card}>
            <div className={styles.profileSummary}>
              <div className={styles.identity}>
                <span className={styles.avatar} aria-hidden="true">
                  {initials}
                </span>
                <div>
                  <h2>{me.displayName}</h2>
                  <p>
                    {household.name} <span aria-hidden="true">·</span> House{' '}
                    {household.role}
                  </p>
                  {preview && (
                    <Badge className="mt-2" variant="secondary">
                      Design preview
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                ref={profileEdit}
                variant="outline"
                onClick={() => {
                  setEditingProfile(true);
                  setProfileMessage('');
                }}
                disabled={editingProfile || preview || accountBusy}
              >
                <Pencil size={16} aria-hidden="true" /> Edit name
              </Button>
            </div>
            {editingProfile && (
              <form className="settings-form" onSubmit={saveProfile}>
                <label htmlFor="profile-display-name">Display name</label>
                <Input
                  ref={profileInput}
                  id="profile-display-name"
                  className="field"
                  maxLength={120}
                  required
                  value={displayName}
                  disabled={savingProfile}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                <div className={styles.actions}>
                  <Button
                    type="submit"
                    disabled={
                      savingProfile || !profileDirty || !displayName.trim()
                    }
                  >
                    {savingProfile ? 'Saving…' : 'Save changes'}
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={cancelProfile}
                    disabled={savingProfile}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            {profileMessage &&
              (profileMessage === 'Profile saved.' ? (
                <SuccessNotice key={profileMessage}>
                  {profileMessage}
                </SuccessNotice>
              ) : (
                <p className="form-message" role="status">
                  {profileMessage}
                </p>
              ))}
          </Card>
          <Card className={styles.card}>
            <h2>Account</h2>
            <dl className={styles.signInEmail}>
              <dt>Sign-in email</dt>
              <dd>{me.email ?? 'No email address on this account'}</dd>
            </dl>
            <div className={styles.actions}>
              <Button
                variant="outline"
                onClick={() => void onSwitchAccount?.()}
                disabled={accountBusy || preview || !onSwitchAccount || pending}
              >
                <ArrowRightLeft size={17} aria-hidden="true" />
                {switchingAccount ? 'Switching…' : 'Switch account'}
              </Button>
              <Button
                variant="outline"
                onClick={onSignOut}
                disabled={accountBusy || pending}
              >
                <LogOut size={17} aria-hidden="true" />
                {preview
                  ? 'Exit preview'
                  : signingOut
                    ? 'Signing out…'
                    : 'Sign out'}
              </Button>
            </div>
            {pending && (
              <p className="field-help">
                Save or cancel your changes before switching accounts or signing
                out.
              </p>
            )}
            {!onSwitchAccount && !preview && (
              <p className="field-help">
                Google sign-in is unavailable. Sign out to use an email link.
              </p>
            )}
            {(accountError || signOutError) && (
              <p className="form-message error" role="alert">
                {accountError || signOutError}
              </p>
            )}
          </Card>
          <Link
            className={`${styles.card} ${styles.navigationRow} ${styles.mobileSettings}`}
            href={settingsHref}
          >
            <span className={styles.navigationLabel}>
              <Settings size={18} aria-hidden="true" /> Settings
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className={styles.panel}>
          <Card className={styles.card}>
            <h2>App and device</h2>
            <div className={styles.preferenceRow}>
              <div>
                <h3>Appearance</h3>
                <p>Light or dark mode for this browser.</p>
              </div>
              <ThemeToggle />
            </div>
            <div className={styles.install}>
              <InstallApp />
            </div>
          </Card>
          <Card className={styles.card}>
            {preview ? (
              <div className={styles.navigationRow}>
                <div>
                  <h2>
                    <Bell size={18} aria-hidden="true" /> Notifications
                  </h2>
                  <p className={styles.settingSummary}>
                    Available after sign-in
                  </p>
                </div>
              </div>
            ) : (
              <Link
                className={styles.navigationRow}
                aria-label="Notification settings"
                href={`/notifications?household=${encodeURIComponent(household.id)}&view=settings`}
              >
                <div>
                  <h2>
                    <Bell size={18} aria-hidden="true" /> Notifications
                  </h2>
                  <p className={styles.settingSummary}>
                    Updates and quiet hours for {household.name}. Manage
                    notifications on this device.
                  </p>
                </div>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            )}
          </Card>
          <section
            id="household-settings"
            ref={householdSection}
            tabIndex={-1}
            aria-labelledby="household-settings-heading"
            className={styles.householdGroup}
          >
            <h2 id="household-settings-heading" className={styles.groupTitle}>
              Household
            </h2>
            <Card className={styles.card}>
              <div className={styles.cardHeading}>
                <div>
                  <h3>{household.name}</h3>
                  <p>
                    {household.role === 'owner'
                      ? 'You own this household.'
                      : household.role === 'admin'
                        ? 'You help manage this household.'
                        : 'An owner or admin can update household details.'}
                  </p>
                </div>
                {canManage && (
                  <Button
                    ref={householdEdit}
                    variant="outline"
                    onClick={() => {
                      setEditingHousehold(true);
                      setSettingsMessage('');
                    }}
                    disabled={editingHousehold || accountBusy}
                  >
                    <Pencil size={16} aria-hidden="true" /> Edit
                  </Button>
                )}
              </div>
              {editingHousehold ? (
                <form className="settings-form" onSubmit={saveSettings}>
                  <label htmlFor="settings-name">Household name</label>
                  <Input
                    ref={householdInput}
                    id="settings-name"
                    className="field"
                    value={name}
                    maxLength={120}
                    disabled={savingSettings}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                  <label htmlFor="timezone-search">Find a timezone</label>
                  <Input
                    id="timezone-search"
                    className="field"
                    type="search"
                    value={timezoneSearch}
                    onChange={(event) => setTimezoneSearch(event.target.value)}
                    disabled={savingSettings}
                    placeholder="Search city or region"
                  />
                  <label htmlFor="settings-timezone">Timezone</label>
                  <select
                    id="settings-timezone"
                    className="field"
                    value={timezone}
                    disabled={savingSettings}
                    onChange={(event) => setTimezone(event.target.value)}
                  >
                    {zoneOptions.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                  {zoneOptions.length === 1 && timezoneSearch && (
                    <p className="field-help">
                      No other matching timezones. Your selected timezone stays
                      available.
                    </p>
                  )}
                  <label htmlFor="settings-currency">Currency</label>
                  <select
                    id="settings-currency"
                    className="field"
                    value={currency}
                    onChange={(event) =>
                      setCurrency(event.target.value as Currency)
                    }
                    disabled={
                      savingSettings ||
                      household.role !== 'owner' ||
                      !household.currencyEditable
                    }
                  >
                    <option value="THB">THB — Thai Baht</option>
                    <option value="USD">USD — US Dollar</option>
                  </select>
                  <p className="field-help">
                    {!household.currencyEditable
                      ? 'Currency is locked because this household has financial activity.'
                      : household.role !== 'owner'
                        ? 'Only the owner can change the currency.'
                        : 'Currency can be changed until financial activity is recorded.'}
                  </p>
                  <div className={styles.actions}>
                    <Button
                      type="submit"
                      disabled={
                        savingSettings || !settingsDirty || !name.trim()
                      }
                    >
                      {savingSettings ? 'Saving…' : 'Save changes'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={cancelHousehold}
                      disabled={savingSettings}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <dl className={styles.details}>
                  <div>
                    <dt>Your role</dt>
                    <dd>{household.role}</dd>
                  </div>
                  <div>
                    <dt>Timezone</dt>
                    <dd>{household.timezone.replaceAll('_', ' ')}</dd>
                  </div>
                  <div>
                    <dt>Currency</dt>
                    <dd>
                      {household.defaultCurrency}
                      {!household.currencyEditable && (
                        <span className={styles.currencyNote}>
                          Locked after financial activity.
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              )}
              {settingsMessage &&
                (settingsMessage === 'Household settings saved.' ? (
                  <SuccessNotice key={settingsMessage}>
                    {settingsMessage}
                  </SuccessNotice>
                ) : (
                  <p className="form-message" role="status">
                    {settingsMessage}
                  </p>
                ))}
            </Card>
            <Card className={styles.card}>
              <div className={styles.cardHeading}>
                <div>
                  <h3>
                    <UsersRound size={20} aria-hidden="true" /> Members
                    {members ? ` (${members.length})` : ''}
                  </h3>
                  <p>Everyone sharing this household.</p>
                </div>
              </div>
              {preview ? (
                <p className="field-help">
                  Member management is available in your signed-in household.
                </p>
              ) : loadError ? (
                <>
                  <p className="form-message error" role="alert">
                    {loadError}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setLoadKey((value) => value + 1)}
                  >
                    Try again
                  </Button>
                </>
              ) : !members ? (
                <p role="status">Loading members…</p>
              ) : (
                <ul className={styles.memberList}>
                  {members.map((member) => (
                    <li key={member.id} className={styles.memberRow}>
                      <span className={styles.memberAvatar} aria-hidden="true">
                        {member.displayName.charAt(0).toUpperCase()}
                      </span>
                      <strong>{member.displayName}</strong>
                      {household.role === 'owner' && member.role !== 'owner' ? (
                        <select
                          aria-label={`Role for ${member.displayName}`}
                          className={styles.roleSelect}
                          value={member.role}
                          disabled={busy || !!roleDraft}
                          onChange={(event) => {
                            roleSelect.current = event.currentTarget;
                            setMemberMessage('');
                            setRoleDraft({
                              member,
                              role: event.target.value as 'admin' | 'member',
                            });
                          }}
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                      ) : (
                        <Badge variant="secondary">{member.role}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {roleDraft && (
                <div className={styles.roleReview}>
                  <h3>Review role change</h3>
                  <p>
                    Change {roleDraft.member.displayName} from{' '}
                    {roleDraft.member.role} to {roleDraft.role}?
                  </p>
                  <p className="field-help">
                    {roleDraft.role === 'admin'
                      ? 'Admins can manage household details and invitations.'
                      : 'Members cannot manage household details or invitations.'}
                  </p>
                  <div className={styles.actions}>
                    <Button
                      ref={roleConfirm}
                      onClick={() =>
                        void changeRole(roleDraft.member, roleDraft.role)
                      }
                    >
                      Confirm role change
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setRoleDraft(null);
                        setNavigationMessage('');
                      }}
                    >
                      Cancel role change
                    </Button>
                  </div>
                </div>
              )}
              {memberMessage && (
                <p className="form-message" role="status">
                  {memberMessage}
                </p>
              )}
            </Card>
            {canManage && (
              <Card className={styles.card}>
                <div className={styles.cardHeading}>
                  <div>
                    <h3>Invitations</h3>
                    <p>
                      One person per link. Each invitation lasts seven days.
                    </p>
                  </div>
                  <Button
                    onClick={() => void makeInvite()}
                    disabled={creatingInvite || !members || !!loadError}
                  >
                    {creatingInvite ? 'Creating…' : 'Invite someone'}
                  </Button>
                </div>
                {newLink && (
                  <div className={styles.newInvite}>
                    <label htmlFor="new-invite-link">New invite link</label>
                    <Input
                      id="new-invite-link"
                      className="field"
                      readOnly
                      value={newLink}
                      onFocus={(event) => event.target.select()}
                    />
                    <Button variant="outline" onClick={() => void copyInvite()}>
                      Copy link
                    </Button>
                  </div>
                )}
                {!loadError && members && (
                  <>
                    <h3 className={styles.listTitle}>
                      Active invitations ({activeInvites.length})
                    </h3>
                    {activeInvites.length === 0 ? (
                      <p className="field-help">
                        No active invitations. Create one when someone is ready
                        to join.
                      </p>
                    ) : (
                      <ul className={styles.invites}>
                        {activeInvites.map((invite) => (
                          <li key={invite.id}>
                            <div>
                              <strong>Available</strong>
                              <span>
                                Expires{' '}
                                {new Intl.DateTimeFormat(undefined, {
                                  dateStyle: 'medium',
                                  timeZone: household.timezone,
                                }).format(new Date(invite.expiresAt))}
                              </span>
                            </div>
                            <Button
                              variant="outline"
                              onClick={() => void revoke(invite.id)}
                              disabled={!!busyInviteId}
                            >
                              Revoke
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {oldInvites.length > 0 && (
                      <>
                        <Button
                          variant="ghost"
                          aria-expanded={showHistory}
                          aria-controls="invite-history"
                          onClick={() => setShowHistory((value) => !value)}
                        >
                          {showHistory
                            ? 'Hide history'
                            : `Show history (${oldInvites.length})`}
                          <ChevronDown size={16} aria-hidden="true" />
                        </Button>
                        <ul
                          id="invite-history"
                          className={styles.invites}
                          hidden={!showHistory}
                        >
                          {oldInvites.map((invite) => (
                            <li key={invite.id}>
                              <span>
                                Created{' '}
                                {new Intl.DateTimeFormat(undefined, {
                                  dateStyle: 'medium',
                                  timeZone: household.timezone,
                                }).format(new Date(invite.createdAt))}
                              </span>
                              <Badge variant="secondary">
                                {inviteStatus(invite)}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
                {inviteMessage && (
                  <p className="form-message" role="status">
                    {inviteMessage}
                  </p>
                )}
              </Card>
            )}
            <p className={styles.footerNote}>
              Use the household menu to switch homes, create a household, or
              join with an invitation.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
