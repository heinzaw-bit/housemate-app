// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NotificationPopups } from '../components/notification-popups';
import { SuccessNotice } from '../components/success-notice';
import type { NotificationItem } from '../lib/api';

const item: NotificationItem = {
  id: 'one',
  householdId: 'home',
  category: 'announcements',
  priority: 'normal',
  entityType: 'announcement',
  entityId: 'one',
  title: 'New announcement',
  body: 'Announcement added',
  createdAt: '2026-10-06T00:00:00Z',
  readAt: null,
  href: '/house?household=home&announcement=one',
};
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
test('dismissed popup becomes inert immediately, fades once, then is removed', async () => {
  const dismiss = vi.fn();
  render(<NotificationPopups items={[item]} dismiss={dismiss} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Dismiss New announcement' }),
  );
  expect(screen.queryByRole('article')).toBeNull();
  const leaving = document.querySelector('[data-leaving]');
  expect(leaving?.hasAttribute('inert')).toBe(true);
  expect(dismiss).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(160);
  });
  expect(dismiss).toHaveBeenCalledExactlyOnceWith('one');
});
test('reduce motion dismisses immediately without waiting for a visual exit', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
  const dismiss = vi.fn();
  render(<NotificationPopups items={[item]} dismiss={dismiss} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Dismiss New announcement' }),
  );
  expect(dismiss).toHaveBeenCalledExactlyOnceWith('one');
  expect(document.querySelector('[data-leaving]')).toBeNull();
});
test('changing account or household unmounts an exiting popup and cancels its delayed callback', async () => {
  const dismiss = vi.fn();
  const view = render(<NotificationPopups items={[item]} dismiss={dismiss} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Dismiss New announcement' }),
  );
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(160);
  });
  expect(dismiss).not.toHaveBeenCalled();
});
test('success feedback retains the confirmed status text with a decorative check', () => {
  render(<SuccessNotice>Attendance saved.</SuccessNotice>);
  expect(screen.getByRole('status').textContent).toBe('Attendance saved.');
  expect(
    document.querySelector('.motion-success-icon')?.getAttribute('aria-hidden'),
  ).toBe('true');
});
