'use client';

import { KeyRound, LogOut, UsersRound } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
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
import { parseInviteInput } from '@/lib/invites';
import { useLeaveGuard } from '@/lib/pending-work';
import { InstallApp } from './install-app';

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
  me,
  household,
  token,
  onMeUpdated,
  onHouseholdUpdated,
  onJoinInvite,
  onCreateHousehold,
  onSignOut,
  signingOut,
  signOutError,
}: {
  me: ApiUser;
  household: Household;
  token: string;
  onMeUpdated: (user: ApiUser) => void;
  onHouseholdUpdated: (household: Household) => void;
  onJoinInvite: (inviteToken: string) => void;
  onCreateHousehold: () => void;
  onSignOut: () => Promise<void> | void;
  signingOut: boolean;
  signOutError: string;
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
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [loadKey, setLoadKey] = useState(0);
  const canManage = household.role === 'owner' || household.role === 'admin';
  useLeaveGuard(
    savingProfile ||
      savingSettings ||
      displayName !== me.displayName ||
      (canManage &&
        (name !== household.name ||
          timezone !== household.timezone ||
          currency !== household.defaultCurrency)),
  );

  useEffect(() => setDisplayName(me.displayName), [me.displayName]);
  useEffect(() => {
    setName(household.name);
    setTimezone(household.timezone);
    setCurrency(household.defaultCurrency);
  }, [household.name, household.timezone, household.defaultCurrency]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadKey intentionally retries the protected reads.
  useEffect(() => {
    let active = true;
    setMembers(null);
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
  }, [token, household.id, canManage, loadKey]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayName.trim()) return;
    setSavingProfile(true);
    setProfileMessage('');
    try {
      onMeUpdated(await updateMe(token, displayName.trim()));
      setProfileMessage('Profile saved.');
    } catch (cause) {
      setProfileMessage(errorMessage(cause, 'Could not save your profile.'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !name.trim() || !timezone.trim()) return;
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
      onHouseholdUpdated(updated);
      setSettingsMessage('Household settings saved.');
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
      household.role !== 'owner' ||
      member.role === 'owner' ||
      member.role === role
    )
      return;
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

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const inviteToken = parseInviteInput(joinInput, window.location.origin);
    if (!inviteToken) {
      setJoinError('Paste a HouseMate invitation link or its code.');
      return;
    }
    setJoinError('');
    onJoinInvite(inviteToken);
  }

  return (
    <div className="content-inner">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">YOUR CORNER OF THE HOUSE</span>
          <h1>
            Your <em>profile.</em>
          </h1>
          <p>Manage your name and your place in {household.name}.</p>
        </div>
      </div>
      <div className="settings-grid">
        <Card className="settings-card">
          <span className="eyebrow">YOUR PROFILE</span>
          <h2>{me.displayName}</h2>
          <p className="field-help">
            {me.email ?? 'No email address on this account'}
          </p>
          <form className="settings-form" onSubmit={saveProfile}>
            <label htmlFor="profile-display-name">Display name</label>
            <Input
              id="profile-display-name"
              className="field"
              maxLength={120}
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <Button
              className="primary-button"
              type="submit"
              disabled={savingProfile || !displayName.trim()}
            >
              {savingProfile ? 'Saving…' : 'Save profile'}
            </Button>
          </form>
          {profileMessage && (
            <p className="form-message" role="status">
              {profileMessage}
            </p>
          )}
          <Button
            variant="outline"
            className="secondary-button sign-out-button"
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
          >
            <LogOut size={17} /> {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
          {signOutError && (
            <p className="form-message error" role="alert">
              {signOutError}
            </p>
          )}
        </Card>

        <Card className="settings-card" id="household-settings">
          <span className="eyebrow">HOUSEHOLD SETTINGS</span>
          <h2>{household.name}</h2>
          <Badge variant="secondary" className="role-badge">
            {household.role}
          </Badge>
          <form className="settings-form" onSubmit={saveSettings}>
            <label htmlFor="settings-name">Household name</label>
            <Input
              id="settings-name"
              className="field"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              disabled={!canManage}
              required
            />
            <label htmlFor="settings-timezone">Timezone</label>
            <Input
              id="settings-timezone"
              className="field"
              value={timezone}
              maxLength={100}
              onChange={(event) => setTimezone(event.target.value)}
              disabled={!canManage}
              required
            />
            <label htmlFor="settings-currency">Currency</label>
            <select
              id="settings-currency"
              className="field"
              value={currency}
              onChange={(event) => setCurrency(event.target.value as Currency)}
              disabled={
                household.role !== 'owner' || !household.currencyEditable
              }
            >
              <option value="THB">THB — Thai Baht</option>
              <option value="USD">USD — US Dollar</option>
            </select>
            {!household.currencyEditable && (
              <p className="field-help">
                Currency is read-only because this household has financial
                activity.
              </p>
            )}
            {canManage && (
              <Button
                className="primary-button"
                type="submit"
                disabled={savingSettings || !name.trim() || !timezone.trim()}
              >
                {savingSettings ? 'Saving…' : 'Save household'}
              </Button>
            )}
          </form>
          {settingsMessage && (
            <p className="form-message" role="status">
              {settingsMessage}
            </p>
          )}
        </Card>

        <Card className="settings-card settings-wide">
          <span className="eyebrow">YOUR PEOPLE</span>
          <h2>
            <UsersRound size={22} /> Members
          </h2>
          {loadError && (
            <p className="form-message error" role="alert">
              {loadError}
            </p>
          )}
          {loadError && (
            <Button
              variant="outline"
              className="secondary-button"
              type="button"
              onClick={() => setLoadKey((value) => value + 1)}
            >
              Try again
            </Button>
          )}
          {!members && !loadError && (
            <p className="field-help">Loading members…</p>
          )}
          {members && (
            <ul className="member-list">
              {members.map((member) => (
                <li key={member.id} className="member-row">
                  <span className="member-avatar">
                    {member.displayName.charAt(0).toUpperCase()}
                  </span>
                  <span className="member-info">
                    <strong>{member.displayName}</strong>
                    <small>{member.email ?? 'Household member'}</small>
                  </span>
                  {household.role === 'owner' && member.role !== 'owner' ? (
                    <select
                      aria-label={`Role for ${member.displayName}`}
                      className="member-role"
                      value={member.role}
                      disabled={busyMemberId === member.id}
                      onChange={(event) =>
                        changeRole(
                          member,
                          event.target.value as 'admin' | 'member',
                        )
                      }
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  ) : (
                    <Badge variant="secondary" className="member-role-label">
                      {member.role}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
          {memberMessage && (
            <p className="form-message" role="status">
              {memberMessage}
            </p>
          )}
        </Card>

        <Card className="settings-card settings-wide">
          <span className="eyebrow">INVITATIONS</span>
          <h2>
            <KeyRound size={22} /> Bring someone in
          </h2>
          {canManage && (
            <>
              <p className="field-help">
                Each link works once and expires after seven days. Share it
                privately with one person.
              </p>
              <Button
                className="primary-button"
                type="button"
                onClick={makeInvite}
                disabled={creatingInvite}
              >
                {creatingInvite ? 'Creating…' : 'Create invite link'}
              </Button>
              {newLink && (
                <div className="new-invite">
                  <label htmlFor="new-invite-link">New invite link</label>
                  <Input
                    id="new-invite-link"
                    className="field"
                    readOnly
                    value={newLink}
                    onFocus={(event) => event.target.select()}
                  />
                  <Button
                    variant="outline"
                    className="secondary-button"
                    type="button"
                    onClick={copyInvite}
                  >
                    Copy link
                  </Button>
                </div>
              )}
              {invites.length > 0 && (
                <ul className="invite-list">
                  {invites.map((invite) => (
                    <li key={invite.id}>
                      <span>
                        Created{' '}
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                        }).format(new Date(invite.createdAt))}
                      </span>
                      <strong>{inviteStatus(invite)}</strong>
                      {inviteStatus(invite) === 'Available' && (
                        <Button
                          variant="ghost"
                          className="text-button"
                          type="button"
                          onClick={() => revoke(invite.id)}
                          disabled={busyInviteId === invite.id}
                        >
                          Revoke
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {inviteMessage && (
            <p className="form-message" role="status">
              {inviteMessage}
            </p>
          )}
          <form className="settings-form join-another" onSubmit={submitJoin}>
            <label htmlFor="join-another-link">Join another household</label>
            <Input
              id="join-another-link"
              className="field"
              value={joinInput}
              onChange={(event) => setJoinInput(event.target.value)}
              placeholder="Paste an invite link or code"
            />
            <Button
              variant="outline"
              className="secondary-button"
              type="submit"
            >
              Check invitation
            </Button>
          </form>
          <Button
            variant="outline"
            className="secondary-button"
            type="button"
            onClick={onCreateHousehold}
          >
            Create another household
          </Button>
          {joinError && (
            <p className="form-message error" role="alert">
              {joinError}
            </p>
          )}
        </Card>
      </div>
      <InstallApp />
    </div>
  );
}
