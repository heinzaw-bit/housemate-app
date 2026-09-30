// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AccountMenu } from '../components/account-menu';

beforeEach(() => {
  // jsdom lacks PointerEvent, used by Base UI for pointer and keyboard activation.
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
const me = { id: 'member', displayName: 'Aye', email: 'aye@example.test' };
test('profile icon opens an accessible keyboard menu with current account and switching', async () => {
  const user = userEvent.setup();
  const onSwitchAccount = vi.fn().mockResolvedValue(undefined);
  render(
    <AccountMenu
      me={me}
      profileHref="/profile?household=home"
      onSwitchAccount={onSwitchAccount}
      onSignOut={vi.fn()}
      busy={false}
      error=""
    />,
  );
  const trigger = screen.getByRole('button', { name: 'Account menu for Aye' });
  trigger.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('menu')).toBeTruthy();
  expect(screen.getByText(me.email)).toBeTruthy();
  expect(
    screen.getByRole('menuitem', { name: 'Profile' }).getAttribute('href'),
  ).toBe('/profile?household=home');
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onSwitchAccount).toHaveBeenCalledTimes(1);
  await user.keyboard('{Escape}');
  expect(document.activeElement).toBe(trigger);
});
test('disabled Google setup and account errors are explained without enabling switching', async () => {
  const user = userEvent.setup();
  render(
    <AccountMenu
      me={me}
      profileHref="/profile"
      onSignOut={vi.fn()}
      busy={false}
      error="Finish your draft."
    />,
  );
  await user.click(
    screen.getByRole('button', { name: 'Account menu for Aye' }),
  );
  await screen.findByRole('menu');
  expect(
    screen
      .getByRole('menuitem', { name: 'Switch Google account' })
      .getAttribute('aria-disabled'),
  ).toBe('true');
  expect(screen.getByRole('alert').textContent).toBe('Finish your draft.');
});
