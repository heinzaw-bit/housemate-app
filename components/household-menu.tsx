'use client';

import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { Check, ChevronDown, Link2, Plus, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Household } from '@/lib/api';
import { parseInviteInput } from '@/lib/invites';
import { hasPendingWork, useLeaveGuard } from '@/lib/pending-work';
import styles from './household-menu.module.css';

export function HouseholdMenu({
  household,
  households,
  onSelectHousehold,
  onCreateHousehold,
  onJoinInvite,
  settingsHref,
  onOpenSettings,
  busy = false,
  preview = false,
  mobile = false,
}: {
  household: Household;
  households: Household[];
  onSelectHousehold: (id: string) => void;
  onCreateHousehold?: () => void;
  onJoinInvite?: (token: string) => void;
  settingsHref: string;
  onOpenSettings?: () => void;
  busy?: boolean;
  preview?: boolean;
  mobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const id = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  useLeaveGuard(joinOpen && !!invite.trim());

  function canNavigate() {
    if (hasPendingWork()) {
      setError(
        'Finish or discard your open draft before changing households or opening household settings.',
      );
      return false;
    }
    setError('');
    return true;
  }
  function select(id: string) {
    if (id === household.id) {
      setOpen(false);
      return;
    }
    if (busy || !households.some((item) => item.id === id) || !canNavigate())
      return;
    setOpen(false);
    onSelectHousehold(id);
  }
  function create() {
    if (busy || preview || !onCreateHousehold || !canNavigate()) return;
    setOpen(false);
    onCreateHousehold();
  }
  function join() {
    if (busy || preview || !onJoinInvite || !canNavigate()) return;
    setInvite('');
    setOpen(false);
    setJoinOpen(true);
  }
  function toggle(next: boolean) {
    setOpen(next);
    setError('');
  }
  const card = (
    <>
      <span className={styles.monogram} aria-hidden="true">
        {household.name.charAt(0).toUpperCase()}
      </span>
      <span className={styles.identity}>
        <span className={styles.label}>YOUR HOUSEHOLD</span>
        <strong>{household.name}</strong>
      </span>
      <ChevronDown size={17} className={styles.chevron} aria-hidden="true" />
    </>
  );

  return (
    <>
      {mobile ? (
        <Dialog.Root open={open} onOpenChange={toggle}>
          <Dialog.Trigger
            ref={trigger}
            className={styles.trigger}
            aria-label={`Household menu: ${household.name}`}
            disabled={busy}
          >
            {card}
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop className={styles.backdrop} />
            <Dialog.Popup
              className={`${styles.sheet} ${styles.surface}`}
              finalFocus={joinOpen ? false : trigger}
            >
              <div className={styles.heading}>
                <Dialog.Title>Your households</Dialog.Title>
                <Dialog.Close
                  className={styles.close}
                  aria-label="Close household menu"
                >
                  <X size={20} />
                </Dialog.Close>
              </div>
              <Dialog.Description className={styles.description}>
                Switch households or manage your household space.
              </Dialog.Description>
              <div className={styles.list}>
                {households.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={styles.item}
                    aria-pressed={item.id === household.id}
                    disabled={busy}
                    onClick={() => select(item.id)}
                  >
                    <span className={styles.itemName}>{item.name}</span>
                    {item.id === household.id && (
                      <Check size={18} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.item}
                  disabled={busy || preview || !onCreateHousehold}
                  onClick={create}
                >
                  <Plus size={18} aria-hidden="true" />
                  Create household
                </button>
                <button
                  type="button"
                  className={styles.item}
                  disabled={busy || preview || !onJoinInvite}
                  onClick={join}
                >
                  <Link2 size={18} aria-hidden="true" />
                  Join with invite
                </button>
                <Link
                  className={styles.item}
                  href={settingsHref}
                  onClick={(event) => {
                    if (busy || !canNavigate()) event.preventDefault();
                    else {
                      setOpen(false);
                      onOpenSettings?.();
                    }
                  }}
                >
                  <Settings size={18} aria-hidden="true" />
                  Household settings
                </Link>
              </div>
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              {preview && (
                <p className={styles.description}>
                  Create and join are available in the signed-in app.
                </p>
              )}
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      ) : (
        <Menu.Root open={open} onOpenChange={toggle}>
          <Menu.Trigger
            ref={trigger}
            className={styles.trigger}
            aria-label={`Household menu: ${household.name}`}
            disabled={busy}
          >
            {card}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              sideOffset={8}
              align="start"
              className={styles.positioner}
            >
              <Menu.Popup
                className={`${styles.menu} ${styles.surface}`}
                aria-label="Your households"
                finalFocus={joinOpen ? false : trigger}
              >
                <p className={styles.menuTitle}>Your households</p>
                <Menu.RadioGroup value={household.id}>
                  {households.map((item) => (
                    <Menu.RadioItem
                      key={item.id}
                      value={item.id}
                      label={item.name}
                      className={styles.item}
                      closeOnClick={false}
                      disabled={busy}
                      onClick={() => select(item.id)}
                    >
                      <span className={styles.itemName}>{item.name}</span>
                      {item.id === household.id && (
                        <Check size={18} aria-hidden="true" />
                      )}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
                <Menu.Separator className={styles.separator} />
                <Menu.Item
                  className={styles.item}
                  disabled={busy || preview || !onCreateHousehold}
                  closeOnClick={false}
                  onClick={create}
                >
                  <Plus size={18} aria-hidden="true" />
                  Create household
                </Menu.Item>
                <Menu.Item
                  className={styles.item}
                  disabled={busy || preview || !onJoinInvite}
                  closeOnClick={false}
                  onClick={join}
                >
                  <Link2 size={18} aria-hidden="true" />
                  Join with invite
                </Menu.Item>
                <Menu.LinkItem
                  className={styles.item}
                  render={<Link href={settingsHref} />}
                  aria-disabled={busy || undefined}
                  closeOnClick={false}
                  onClick={(event) => {
                    if (busy || !canNavigate()) event.preventDefault();
                    else {
                      setOpen(false);
                      onOpenSettings?.();
                    }
                  }}
                >
                  <Settings size={18} aria-hidden="true" />
                  Household settings
                </Menu.LinkItem>
                {error && (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                )}
                {preview && (
                  <p className={styles.description}>
                    Create and join are available in the signed-in app.
                  </p>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      )}
      <Dialog.Root
        open={joinOpen}
        onOpenChange={(next) => {
          setJoinOpen(next);
          setError('');
          if (!next) setInvite('');
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup
            className={`${styles.join} ${styles.surface}`}
            finalFocus={trigger}
          >
            <div className={styles.heading}>
              <Dialog.Title>Join a household</Dialog.Title>
              <Dialog.Close
                className={styles.close}
                aria-label="Close invitation form"
              >
                <X size={20} />
              </Dialog.Close>
            </div>
            <Dialog.Description className={styles.description}>
              Paste a HouseMate invitation link or code. You’ll review the
              invitation before joining.
            </Dialog.Description>
            <form
              className={styles.joinForm}
              onSubmit={(event) => {
                event.preventDefault();
                if (busy || preview || !onJoinInvite) return;
                const parsed = parseInviteInput(invite, window.location.origin);
                if (!parsed) {
                  setError('Paste a valid HouseMate invitation link or code.');
                  return;
                }
                // The modal was opened only after checking existing drafts. This is
                // its own unsaved input; the normal invitation flow confirms joining.
                setJoinOpen(false);
                setInvite('');
                setError('');
                onJoinInvite(parsed);
              }}
            >
              <label htmlFor={`${id}-invite`}>Invitation link or code</label>
              <Input
                id={`${id}-invite`}
                value={invite}
                onChange={(event) => setInvite(event.target.value)}
                autoComplete="off"
                maxLength={2000}
                required
              />
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              <div className={styles.formActions}>
                <Button type="submit" disabled={busy}>
                  Check invitation
                </Button>
                <Dialog.Close
                  render={<Button type="button" variant="outline" />}
                >
                  Cancel
                </Dialog.Close>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
