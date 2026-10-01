// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseholdMenu } from '../components/household-menu';
import type { Household } from '../lib/api';
import { hasPendingWork, useLeaveGuard } from '../lib/pending-work';

const home = {
  id: 'home',
  name: 'SE',
  timezone: 'Asia/Bangkok',
  defaultCurrency: 'THB',
  role: 'member',
} as Household;
const other = { ...home, id: 'other', name: 'Family home' };
function props() {
  return {
    household: home,
    households: [home, other],
    onSelectHousehold: vi.fn(),
    onCreateHousehold: vi.fn(),
    onJoinInvite: vi.fn(),
    settingsHref: '/profile?household=home#household-settings',
  };
}
function Draft({ active }: { active: boolean }) {
  useLeaveGuard(active);
  return null;
}
beforeEach(() => {
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? 'mouse';
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('the whole card opens a keyboard household menu, marks current selection and switches only when chosen', async () => {
  const user = userEvent.setup();
  const p = props();
  render(<HouseholdMenu {...p} />);
  const trigger = screen.getByRole('button', { name: 'Household menu: SE' });
  trigger.focus();
  await user.keyboard('{Enter}');
  await screen.findByRole('menu');
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(
    screen
      .getByRole('menuitemradio', { name: 'SE' })
      .getAttribute('aria-checked'),
  ).toBe('true');
  expect(p.onSelectHousehold).not.toHaveBeenCalled();
  await user.keyboard('{ArrowDown}{Enter}');
  expect(p.onSelectHousehold).toHaveBeenCalledWith('other');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  expect(document.activeElement).toBe(trigger);
  await user.click(trigger);
  await screen.findByRole('menu');
  expect(
    screen
      .getByRole('menuitem', { name: 'Household settings' })
      .getAttribute('href'),
  ).toBe(p.settingsHref);
  await user.keyboard('{Escape}');
  expect(document.activeElement).toBe(trigger);
});

test('a single household still has useful actions, and opening the menu never creates a household', async () => {
  const user = userEvent.setup();
  const p = props();
  render(<HouseholdMenu {...p} households={[home]} />);
  await user.click(screen.getByRole('button', { name: 'Household menu: SE' }));
  await screen.findByRole('menu');
  expect(p.onCreateHousehold).not.toHaveBeenCalled();
  expect(
    screen.getByRole('menuitem', { name: 'Join with invite' }),
  ).toBeTruthy();
  await user.click(screen.getByRole('menuitem', { name: 'Create household' }));
  expect(p.onCreateHousehold).toHaveBeenCalledTimes(1);
  expect(p.onSelectHousehold).not.toHaveBeenCalled();
});

test('open drafts block household switching, creation, joining and settings without discarding state', async () => {
  const user = userEvent.setup();
  const p = props();
  const view = render(
    <>
      <Draft active />
      <HouseholdMenu {...p} />
    </>,
  );
  await user.click(screen.getByRole('button', { name: 'Household menu: SE' }));
  await screen.findByRole('menu');
  for (const name of [
    'Family home',
    'Create household',
    'Join with invite',
    'Household settings',
  ]) {
    await user.click(
      screen.getByRole(name === 'Family home' ? 'menuitemradio' : 'menuitem', {
        name,
      }),
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Finish or discard',
    );
  }
  expect(p.onSelectHousehold).not.toHaveBeenCalled();
  expect(p.onCreateHousehold).not.toHaveBeenCalled();
  expect(p.onJoinInvite).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  view.rerender(
    <>
      <Draft active={false} />
      <HouseholdMenu {...p} />
    </>,
  );
  await user.click(screen.getByRole('menuitemradio', { name: 'Family home' }));
  expect(p.onSelectHousehold).toHaveBeenCalledWith('other');
});

test('join validates the invite locally and opens the existing review flow without accepting membership', async () => {
  const user = userEvent.setup();
  const p = props();
  render(<HouseholdMenu {...p} />);
  const trigger = screen.getByRole('button', { name: 'Household menu: SE' });
  await user.click(trigger);
  await screen.findByRole('menu');
  await user.click(screen.getByRole('menuitem', { name: 'Join with invite' }));
  await screen.findByRole('dialog', { name: 'Join a household' });
  const input = screen.getByRole('textbox', {
    name: 'Invitation link or code',
  });
  await user.type(input, 'not-an-invite');
  expect(hasPendingWork()).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Check invitation' }));
  expect(screen.getByRole('alert').textContent).toContain('valid HouseMate');
  expect(p.onJoinInvite).not.toHaveBeenCalled();
  await user.clear(input);
  const invite = 'a'.repeat(43);
  await user.type(input, invite);
  await user.click(screen.getByRole('button', { name: 'Check invitation' }));
  expect(p.onJoinInvite).toHaveBeenCalledWith(invite);
  expect(p.onSelectHousehold).not.toHaveBeenCalled();
  expect(hasPendingWork()).toBe(false);
});

test('mobile opens an accessible sheet with the same actions and returns focus when closed', async () => {
  const user = userEvent.setup();
  const p = props();
  render(<HouseholdMenu {...p} mobile />);
  const trigger = screen.getByRole('button', { name: 'Household menu: SE' });
  await user.click(trigger);
  await screen.findByRole('dialog', { name: 'Your households' });
  expect(
    screen.getByRole('button', { name: 'SE' }).getAttribute('aria-pressed'),
  ).toBe('true');
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(result.violations).toEqual([]);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(trigger);
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Family home' }));
  expect(p.onSelectHousehold).toHaveBeenCalledWith('other');
});

test('preview keeps real create and join actions disabled', async () => {
  const user = userEvent.setup();
  const p = props();
  render(<HouseholdMenu {...p} preview />);
  await user.click(screen.getByRole('button', { name: 'Household menu: SE' }));
  await screen.findByRole('menu');
  expect(
    screen
      .getByRole('menuitem', { name: 'Create household' })
      .getAttribute('aria-disabled'),
  ).toBe('true');
  expect(
    screen
      .getByRole('menuitem', { name: 'Join with invite' })
      .getAttribute('aria-disabled'),
  ).toBe('true');
  expect(p.onCreateHousehold).not.toHaveBeenCalled();
  expect(p.onJoinInvite).not.toHaveBeenCalled();
});
