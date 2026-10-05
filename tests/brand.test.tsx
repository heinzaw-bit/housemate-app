// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Brand } from '../components/brand';
import { useLeaveGuard } from '../lib/pending-work';

const reload = vi.fn();
beforeEach(() => {
  reload.mockClear();
  vi.stubGlobal(
    'window',
    new Proxy(window, {
      get(target, key) {
        return key === 'location' ? { reload } : Reflect.get(target, key);
      },
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Draft({ active }: { active: boolean }) {
  useLeaveGuard(active);
  return null;
}

test('the workspace mascot refreshes on click, Enter and Space', async () => {
  const user = userEvent.setup();
  render(<Brand refreshable />);
  const button = screen.getByRole('button', { name: 'Refresh current page' });
  expect(button.getAttribute('type')).toBe('button');
  await user.click(button);
  await user.keyboard('{Enter}');
  await user.keyboard(' ');
  expect(reload).toHaveBeenCalledTimes(3);
});

test('open drafts block mascot refresh until the work is closed', async () => {
  const user = userEvent.setup();
  const view = render(
    <>
      <Brand refreshable />
      <Draft active />
    </>,
  );
  const button = screen.getByRole('button', {
    name: 'Refresh current page',
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(button.title).toContain('Finish or discard');
  await user.click(button);
  expect(reload).not.toHaveBeenCalled();
  view.rerender(
    <>
      <Brand refreshable />
      <Draft active={false} />
    </>,
  );
  expect(button.disabled).toBe(false);
  await user.click(button);
  expect(reload).toHaveBeenCalledTimes(1);
});

test('brand marks outside the workspace remain decorative', () => {
  render(<Brand compact />);
  expect(screen.queryByRole('button')).toBeNull();
});
