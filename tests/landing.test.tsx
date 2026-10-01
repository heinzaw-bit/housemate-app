// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, expect, test } from 'vitest';
import { LandingPage } from '../components/landing-page';

afterEach(cleanup);
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
  const house = screen.getByRole('button', { name: 'House' });
  house.focus();
  await user.keyboard('{Enter}');
  expect(house.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('Make everyday teamwork easier.')).toBeTruthy();
  expect(screen.queryByText('Review expense')).toBeNull();
  const faq = screen.getByText('How do repayments work?');
  faq.focus();
  expect(document.activeElement).toBe(faq);
  // jsdom does not synthesize native summary activation from Enter.
  await user.click(faq);
  expect(faq.closest('details')?.open).toBe(true);
});
