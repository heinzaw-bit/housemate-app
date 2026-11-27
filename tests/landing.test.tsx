// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LandingPage } from '../components/landing-page';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => window.history.replaceState(null, '', '/'));
test('landing actions reach sign-in and every internal anchor exists', async () => {
  document.documentElement.lang = 'en';
  document.title = 'HouseMate';
  const { container } = render(<LandingPage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'Share a home. Stay in sync.',
  );
  const entryLinks = screen.getAllByRole('link', {
    name: /Set up a household|^Sign in$/,
  });
  expect(entryLinks).toHaveLength(4);
  expect(
    entryLinks.every((link) => link.getAttribute('href') === '/sign-in'),
  ).toBe(true);
  expect(screen.getByText('Have an invitation?')).toBeTruthy();
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
  const house = screen.getByRole('button', { name: 'Board' });
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
    screen.getByRole('button', { name: 'Board' }).getAttribute('aria-pressed'),
  ).toBe('true');
});

function scrollingEnvironment(reduced = false) {
  let callback: IntersectionObserverCallback = () => {};
  let motionChange = () => {};
  const observer = {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
  const motion = {
    matches: reduced,
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      motionChange = listener;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => motion),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = observer.observe;
      unobserve = observer.unobserve;
      disconnect = observer.disconnect;
      constructor(listener: IntersectionObserverCallback) {
        callback = listener;
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return new DOMRect(0, this.id === 'overview' ? 50 : 1000, 360, 600);
    },
  );
  return {
    observer,
    motion,
    enter(section: Element, isIntersecting = true) {
      act(() =>
        callback(
          [{ target: section, isIntersecting } as IntersectionObserverEntry],
          observer as unknown as IntersectionObserver,
        ),
      );
    },
    reduceMotion() {
      motion.matches = true;
      act(() => motionChange());
    },
  };
}

test('natural scroll reveals upcoming sections once without hiding content or changing history', () => {
  const env = scrollingEnvironment();
  window.history.replaceState({ retained: true }, '', '/?source=invite#tour');
  const { container, unmount } = render(<LandingPage />);
  const sections = container.querySelectorAll<HTMLElement>('.landing-panel');
  expect(sections).toHaveLength(6);
  expect(container.querySelector('[hidden]')).toBeNull();
  expect(screen.queryByRole('button', { name: /Next|Previous/ })).toBeNull();
  expect(screen.queryByText('01 / 06')).toBeNull();
  expect(sections[0].dataset.reveal).toBe('visible');
  const features = container.querySelector<HTMLElement>('#features');
  if (!features) throw new Error('Features section missing');
  expect(features.dataset.reveal).toBe('pending');
  env.enter(features, false);
  expect(features.dataset.reveal).toBe('pending');
  env.enter(features);
  expect(features.dataset.reveal).toBe('visible');
  expect(env.observer.unobserve).toHaveBeenCalledWith(features);
  env.enter(features, false);
  expect(features.dataset.reveal).toBe('visible');
  expect(window.location.search).toBe('?source=invite');
  expect(window.location.hash).toBe('#tour');
  expect(window.history.state).toEqual({ retained: true });
  unmount();
  expect(env.observer.disconnect).toHaveBeenCalled();
  expect(env.motion.removeEventListener).toHaveBeenCalled();
});

test('keyboard focus and changes to reduced motion reveal content immediately', () => {
  const env = scrollingEnvironment();
  const { container } = render(<LandingPage />);
  const tour = container.querySelector<HTMLElement>('#tour');
  if (!tour) throw new Error('Tour section missing');
  expect(tour.dataset.reveal).toBe('pending');
  act(() => screen.getByRole('button', { name: 'Board' }).focus());
  expect(tour.dataset.reveal).toBe('visible');
  expect(screen.getByRole('button', { name: 'Board' })).toBe(
    document.activeElement,
  );
  env.reduceMotion();
  expect(container.querySelector('[data-reveal="pending"]')).toBeNull();
  expect(env.observer.disconnect).toHaveBeenCalled();
});

test.each(['reduced motion', 'unsupported observer', 'failed observer'])(
  'all sections remain readable with %s',
  (mode) => {
    const env = scrollingEnvironment(mode === 'reduced motion');
    if (mode === 'unsupported observer')
      vi.stubGlobal('IntersectionObserver', undefined);
    if (mode === 'failed observer')
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor() {
            throw new Error('Unavailable');
          }
        },
      );
    const { container } = render(<LandingPage />);
    expect(container.querySelectorAll('.landing-panel')).toHaveLength(6);
    expect(
      container.querySelector('[hidden], [data-reveal="pending"]'),
    ).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Common questions' }),
    ).toBeTruthy();
    expect(env.observer.observe).not.toHaveBeenCalled();
  },
);
