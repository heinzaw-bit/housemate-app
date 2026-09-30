// @vitest-environment jsdom
import { runInNewContext } from 'node:vm';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ThemeToggle } from '../components/theme-toggle';
import { themeInitScript, themeStorageKey } from '../lib/theme';
import { ThemeProvider } from '../lib/theme-context';

let systemDark = false;
let mediaChange: () => void;
beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  systemDark = false;
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return systemDark;
    },
    addEventListener: (_: string, listener: () => void) => {
      mediaChange = listener;
    },
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const mount = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );

test('theme bootstrap applies saved dark preference before hydration', () => {
  localStorage.setItem(themeStorageKey, 'dark');
  runInNewContext(themeInitScript, { localStorage, window, document });
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(document.documentElement.style.colorScheme).toBe('dark');
});
test('toggle follows system initially, saves override and survives remount', () => {
  systemDark = true;
  const view = mount();
  expect(
    screen
      .getByRole('button', { name: 'Switch to light mode' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
  expect(localStorage.getItem(themeStorageKey)).toBe('light');
  expect(document.documentElement.classList.contains('dark')).toBe(false);
  view.unmount();
  mount();
  expect(
    screen.getByRole('button', { name: 'Switch to dark mode' }),
  ).toBeTruthy();
  act(() => mediaChange());
  expect(document.documentElement.classList.contains('dark')).toBe(false);
});
test('system and cross-tab preference changes synchronize while retaining explicit choice', () => {
  mount();
  systemDark = true;
  act(() => mediaChange());
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  localStorage.setItem(themeStorageKey, 'light');
  fireEvent(window, new StorageEvent('storage', { key: themeStorageKey }));
  expect(document.documentElement.classList.contains('dark')).toBe(false);
  localStorage.clear();
  fireEvent(window, new StorageEvent('storage', { key: null }));
  expect(document.documentElement.classList.contains('dark')).toBe(true);
});
test('blocked storage does not break initialization or the toggle', () => {
  systemDark = true;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  runInNewContext(themeInitScript, { localStorage, window, document });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
  expect(document.documentElement.classList.contains('dark')).toBe(false);
});
