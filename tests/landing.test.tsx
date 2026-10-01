// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { LandingPage } from '../components/landing-page';

afterEach(cleanup);
beforeEach(() => window.history.replaceState(null, '', '/'));
test('landing actions reach sign-in and every internal anchor exists', async () => {
  document.documentElement.lang = 'en';
  document.title = 'HouseMate';
  const { container } = render(<LandingPage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'House life,in sync.',
  );
  expect(
    screen
      .getAllByRole('link', { name: /Get started|Create your household/ })
      .every((link) => link.getAttribute('href') === '/sign-in'),
  ).toBe(true);
  for (const link of container.querySelectorAll('a[href^="#"]')) {
    const id = link.getAttribute('href')?.slice(1);
    expect(container.querySelector(`[id="${id}"]`)).toBeTruthy();
  }
  expect(screen.getAllByText('Example data').length).toBeGreaterThan(0);
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
test('product previews support keyboard interaction and native FAQ controls expand', async () => {
  const user = userEvent.setup();
  render(<LandingPage />);
  await user.click(screen.getByRole('link', { name: 'Tour' }));
  const house = screen.getByRole('button', { name: 'House' });
  house.focus();
  await user.keyboard('{Enter}');
  expect(house.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('Make everyday teamwork easier.')).toBeTruthy();
  expect(screen.queryByText('Review expense')).toBeNull();
  await user.click(screen.getByRole('link', { name: 'FAQ' }));
  const faq = screen.getByText('How do repayments work?');
  faq.focus();
  expect(document.activeElement).toBe(faq);
  // jsdom does not synthesize native summary activation from Enter.
  await user.click(faq);
  expect(faq.closest('details')?.open).toBe(true);
  await user.click(screen.getByRole('link', { name: 'Tour' }));
  expect(
    screen.getByRole('button', { name: 'House' }).getAttribute('aria-pressed'),
  ).toBe('true');
});

test('one section is visible at a time and keyboard navigation moves focus with progress', async () => {
  const user = userEvent.setup();
  const { container } = render(<LandingPage />);
  const visiblePanels = () =>
    container.querySelectorAll('.landing-panel:not([hidden])');
  expect(visiblePanels()).toHaveLength(1);
  expect(visiblePanels()[0].id).toBe('overview');
  expect(
    screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen.queryByRole('heading', { name: /Less to keep track/ }),
  ).toBeNull();
  const next = screen.getByRole('button', { name: 'Next' });
  next.focus();
  await user.keyboard('{Enter}');
  expect(visiblePanels()).toHaveLength(1);
  expect(visiblePanels()[0].id).toBe('features');
  expect(window.location.hash).toBe('#features');
  expect(screen.getByRole('heading', { name: /Less to keep track/ })).toBe(
    document.activeElement,
  );
  expect(
    screen.getByRole('link', { name: 'Features' }).getAttribute('aria-current'),
  ).toBe('step');
  expect(screen.getByText('02 / 06')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Previous' }));
  expect(visiblePanels()[0].id).toBe('overview');
});

test('section deep links and browser history keep the correct panel accessible', async () => {
  window.history.replaceState(
    { nextState: 'retained' },
    '',
    '/?source=invite#tour',
  );
  const user = userEvent.setup();
  const { container } = render(<LandingPage />);
  expect(
    screen.getByRole('heading', { name: /Clear at a glance/ }),
  ).toBeTruthy();
  await user.click(screen.getByRole('link', { name: 'Privacy overview' }));
  expect(window.location.search).toBe('?source=invite');
  expect(window.history.state).toEqual({ nextState: 'retained' });
  expect(
    screen.getByRole('heading', { name: 'Shared with the right people.' }),
  ).toBe(document.activeElement);
  act(() => window.history.back());
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: /Clear at a glance/ }),
    ).toBeTruthy(),
  );
  act(() => window.history.forward());
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Shared with the right people.' }),
    ).toBeTruthy(),
  );
  await user.click(screen.getByRole('link', { name: 'FAQ' }));
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  expect(
    screen
      .getAllByRole('link', { name: 'Get started' })
      .every((link) => link.getAttribute('href') === '/sign-in'),
  ).toBe(true);
  expect(
    screen
      .getByRole('link', { name: 'Create your household' })
      .getAttribute('href'),
  ).toBe('/sign-in');
  await user.click(screen.getByRole('link', { name: 'Skip to main content' }));
  expect(document.activeElement).toBe(screen.getByRole('main'));
  expect(
    screen.getByRole('heading', { name: 'Make yourself comfortable.' }),
  ).toBeTruthy();
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
