// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemberSettings } from '../components/member-settings';
import type { Household } from '../lib/api';
import * as api from '../lib/api';
import { hasPendingWork } from '../lib/pending-work';

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  getMembers: vi.fn(),
  getInvites: vi.fn(),
  updateMe: vi.fn(),
  updateHousehold: vi.fn(),
  updateMemberRole: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
}));
vi.mock('../components/install-app', () => ({
  InstallApp: () => (
    <section aria-label="Install HouseMate">Installation help</section>
  ),
}));
const me = { id: 'me', displayName: 'Aye', email: 'aye@example.test' };
const home: Household = {
  id: 'home',
  name: 'Our home',
  role: 'owner',
  defaultCurrency: 'THB',
  timezone: 'Asia/Bangkok',
  currencyEditable: false,
  createdAt: '2026-01-01T00:00:00Z',
};
const member = {
  id: 'other',
  displayName: 'Hein',
  role: 'member' as const,
  email: 'hidden@example.test',
  joinedAt: '2026-01-01T00:00:00Z',
};
function props() {
  return {
    me,
    household: home,
    token: 'token',
    onMeUpdated: vi.fn(),
    onHouseholdUpdated: vi.fn(),
    onSwitchAccount: vi.fn(),
    onSignOut: vi.fn(),
    signingOut: false,
    signOutError: '',
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/profile?household=home');
  vi.mocked(api.getMembers).mockResolvedValue([member]);
  vi.mocked(api.getInvites).mockResolvedValue([]);
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerType = 'mouse';
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('tabs show one section, hide account email by default, support keyboard and link notification settings to this household', async () => {
  const user = userEvent.setup();
  render(<MemberSettings {...props()} />);
  const profile = screen.getByRole('tab', { name: 'My profile' });
  expect(profile.getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByRole('textbox', { name: 'Display name' })).toBeNull();
  expect(
    screen.getByText(me.email).closest('details')?.hasAttribute('open'),
  ).toBe(false);
  profile.focus();
  await user.keyboard('{ArrowRight}{Enter}');
  expect(
    screen
      .getByRole('tab', { name: 'Household' })
      .getAttribute('aria-selected'),
  ).toBe('true');
  await screen.findByText('Hein');
  expect(screen.queryByText(member.email)).toBeNull();
  await user.click(screen.getByRole('tab', { name: 'Preferences' }));
  expect(
    screen.getByRole('link', { name: 'Settings' }).getAttribute('href'),
  ).toBe('/notifications?household=home&view=settings');
  expect(
    screen.getByRole('region', { name: 'Install HouseMate' }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Invite someone' })).toBeNull();
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(result.violations).toEqual([]);
});

test('editing requires changes, blocks section/account changes, cancels without a write and saves only on submission', async () => {
  const user = userEvent.setup();
  const p = props();
  render(
    <>
      <MemberSettings {...p} />
      <a href="/money?household=home">Money navigation</a>
    </>,
  );
  const edit = screen.getByRole('button', { name: 'Edit' });
  await user.click(edit);
  const input = screen.getByRole('textbox', { name: 'Display name' });
  expect(document.activeElement).toBe(input);
  expect(
    (screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.clear(input);
  await user.type(input, 'Aye New');
  expect(hasPendingWork()).toBe(true);
  await user.click(screen.getByRole('link', { name: 'Money navigation' }));
  expect(screen.getByRole('alert').textContent).toContain(
    'before leaving Profile',
  );
  await user.click(screen.getByRole('tab', { name: 'Household' }));
  expect(screen.getByRole('alert').textContent).toContain('Save or cancel');
  expect(screen.getByRole('textbox', { name: 'Display name' })).toBe(input);
  expect(
    (
      screen.getByRole('button', {
        name: 'Switch Google account',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(api.updateMe).not.toHaveBeenCalled();
  expect(hasPendingWork()).toBe(false);
  expect(document.activeElement).toBe(edit);
  await user.click(edit);
  const next = screen.getByRole('textbox', { name: 'Display name' });
  expect((next as HTMLInputElement).value).toBe('Aye');
  await user.clear(next);
  await user.type(next, ' Aye New ');
  vi.mocked(api.updateMe).mockResolvedValue({ ...me, displayName: 'Aye New' });
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(p.onMeUpdated).toHaveBeenCalledWith({
      ...me,
      displayName: 'Aye New',
    }),
  );
  expect(api.updateMe).toHaveBeenCalledExactlyOnceWith('token', 'Aye New');
  expect(hasPendingWork()).toBe(false);
});

test('failed saves keep the draft and prevent duplicate submissions while saving', async () => {
  const user = userEvent.setup();
  render(<MemberSettings {...props()} />);
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Display name' }),
    ' New',
  );
  let reject!: (cause: Error) => void;
  vi.mocked(api.updateMe).mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(
    (screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (
      screen.getByRole('button', {
        name: 'Cancel',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await act(async () => reject(new Error('offline')));
  await screen.findByText('Could not save your profile.');
  expect(
    (screen.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement)
      .value,
  ).toBe('Aye New');
  expect(hasPendingWork()).toBe(true);
  expect(api.updateMe).toHaveBeenCalledTimes(1);
});

test('settings deep links and same-route menu requests open Household; timezone search preserves currency restrictions and saves via API', async () => {
  window.history.replaceState(
    null,
    '',
    '/profile?household=home#household-settings',
  );
  const user = userEvent.setup();
  const p = props();
  const view = render(<MemberSettings {...p} />);
  await screen.findByText('You own this household.');
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  const currency = screen.getByRole('combobox', {
    name: 'Currency',
  }) as HTMLSelectElement;
  expect(currency.disabled).toBe(true);
  await user.type(
    screen.getByRole('searchbox', { name: 'Find a timezone' }),
    'Tokyo',
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Timezone' }),
    'Asia/Tokyo',
  );
  vi.mocked(api.updateHousehold).mockResolvedValue({
    ...home,
    timezone: 'Asia/Tokyo',
  });
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(p.onHouseholdUpdated).toHaveBeenCalled());
  expect(api.updateHousehold).toHaveBeenCalledExactlyOnceWith('token', 'home', {
    name: 'Our home',
    timezone: 'Asia/Tokyo',
  });
  await user.click(screen.getByRole('tab', { name: 'My profile' }));
  view.rerender(<MemberSettings {...p} settingsRequest={1} />);
  expect(
    screen
      .getByRole('tab', { name: 'Household' })
      .getAttribute('aria-selected'),
  ).toBe('true');
});

test('members see readable settings; admins can edit details but cannot change roles or currency', async () => {
  const user = userEvent.setup();
  const p = props();
  const view = render(
    <MemberSettings {...p} household={{ ...home, role: 'member' }} />,
  );
  await user.click(screen.getByRole('tab', { name: 'Household' }));
  await screen.findByText('Hein');
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(api.getInvites).not.toHaveBeenCalled();
  view.rerender(
    <MemberSettings
      {...p}
      household={{ ...home, role: 'admin', currencyEditable: true }}
    />,
  );
  await screen.findByRole('button', { name: 'Invite someone' });
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  expect(
    (screen.getByRole('combobox', { name: 'Currency' }) as HTMLSelectElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByRole('combobox', { name: 'Role for Hein' })).toBeNull();
});

test('role selection prepares a review, cancel does not write, and explicit confirmation updates the role', async () => {
  const user = userEvent.setup();
  render(<MemberSettings {...props()} />);
  await user.click(screen.getByRole('tab', { name: 'Household' }));
  const select = await screen.findByRole('combobox', { name: 'Role for Hein' });
  await user.selectOptions(select, 'admin');
  expect(api.updateMemberRole).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Confirm role change' }),
  );
  expect(hasPendingWork()).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Cancel role change' }));
  expect(api.updateMemberRole).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(select);
  await user.selectOptions(select, 'admin');
  vi.mocked(api.updateMemberRole).mockResolvedValue({
    ...member,
    role: 'admin',
  });
  await user.click(screen.getByRole('button', { name: 'Confirm role change' }));
  await screen.findByText('Hein is now admin.');
  expect(api.updateMemberRole).toHaveBeenCalledExactlyOnceWith(
    'token',
    'home',
    'other',
    'admin',
  );
  expect(hasPendingWork()).toBe(false);
});

test('invitations separate active links from history; creation and revocation remain explicit', async () => {
  const active = {
    id: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z',
    redeemedAt: null,
    revokedAt: null,
  };
  vi.mocked(api.getInvites).mockResolvedValue([
    active,
    { ...active, id: 'used', redeemedAt: '2026-02-01T00:00:00Z' },
  ]);
  const user = userEvent.setup();
  render(<MemberSettings {...props()} />);
  await user.click(screen.getByRole('tab', { name: 'Household' }));
  await screen.findByText('Active invitations (1)');
  expect(screen.getByText('Used').closest('ul')?.hidden).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Show history (1)' }));
  expect(screen.getByText('Used').closest('ul')?.hidden).toBe(false);
  expect(api.createInvite).not.toHaveBeenCalled();
  vi.mocked(api.createInvite).mockResolvedValue({
    ...active,
    id: 'new',
    token: 'private-invite-code',
  });
  await user.click(screen.getByRole('button', { name: 'Invite someone' }));
  await screen.findByRole('textbox', { name: 'New invite link' });
  expect(api.createInvite).toHaveBeenCalledExactlyOnceWith('token', 'home');
  vi.mocked(api.revokeInvite).mockResolvedValue(undefined);
  await user.click(screen.getAllByRole('button', { name: 'Revoke' })[1]);
  await screen.findByText('Invitation revoked.');
  expect(api.revokeInvite).toHaveBeenCalledExactlyOnceWith(
    'token',
    'home',
    'active',
  );
});

test('preview uses the same layout without reading or mutating household records', async () => {
  const user = userEvent.setup();
  const p = props();
  render(<MemberSettings {...p} preview />);
  expect(
    (screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.click(screen.getByRole('tab', { name: 'Household' }));
  expect(screen.queryByRole('button', { name: 'Invite someone' })).toBeNull();
  expect(api.getMembers).not.toHaveBeenCalled();
  expect(api.getInvites).not.toHaveBeenCalled();
  await user.click(screen.getByRole('tab', { name: 'My profile' }));
  await user.click(screen.getByRole('button', { name: 'Exit preview' }));
  expect(p.onSignOut).toHaveBeenCalledTimes(1);
});
