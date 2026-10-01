// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AssistantWorkspace } from '../components/assistant-workspace';
import {
  ApiRequestError,
  type AssistantAnswer,
  type Household,
} from '../lib/api';
import { hasPendingWork } from '../lib/pending-work';

const mocks = vi.hoisted(() => ({ config: vi.fn(), ask: vi.fn() }));
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getAssistantConfig: mocks.config,
  askAssistant: mocks.ask,
}));
const household = {
  id: 'home',
  name: 'Our home',
  timezone: 'Asia/Bangkok',
  defaultCurrency: 'THB',
  role: 'member',
} as Household;
const answer: AssistantAnswer = {
  kind: 'answer',
  topic: 'balance',
  text: 'You owe THB 1.01.',
  generatedAt: '2026-10-01T00:00:00Z',
  timezone: 'Asia/Bangkok',
  rows: [],
  sources: [{ label: 'Balances', href: '/money?view=balances&household=home' }],
  partial: false,
};
beforeEach(() => {
  mocks.config.mockReset().mockResolvedValue({ naturalLanguageEnabled: true });
  mocks.ask.mockReset().mockResolvedValue(answer);
});
afterEach(() => {
  cleanup();
});

test('quick questions remain usable without AI setup and show fresh, linked sources', async () => {
  mocks.config.mockResolvedValue({ naturalLanguageEnabled: false });
  const user = userEvent.setup();
  render(<AssistantWorkspace household={household} token="token" />);
  await screen.findByText(/once AI setup is complete/);
  expect(
    screen.getByRole('textbox', { name: 'Ask your own question' }),
  ).toHaveProperty('disabled', true);
  await user.click(screen.getByRole('button', { name: 'How much do I owe?' }));
  await screen.findByText('You owe THB 1.01.');
  expect(mocks.ask).toHaveBeenCalledWith(
    'token',
    'home',
    { topic: 'balance' },
    expect.any(AbortSignal),
  );
  expect(
    screen.getByRole('link', { name: 'Balances' }).getAttribute('href'),
  ).toBe('/money?view=balances&household=home');
  expect(screen.getByText(/Ask again to refresh/)).toBeTruthy();
});

test('typed questions guard unsent work, expose limits, and clear only after success', async () => {
  const user = userEvent.setup();
  render(<AssistantWorkspace household={household} token="token" />);
  const input = screen.getByRole('textbox', { name: 'Ask your own question' });
  await waitFor(() => expect(input).toHaveProperty('disabled', false));
  await user.type(input, 'How much do I owe?');
  expect(hasPendingWork()).toBe(true);
  expect(screen.getByRole('button', { name: 'Ask' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(mocks.ask).not.toHaveBeenCalled();
  await user.click(screen.getByRole('checkbox'));
  mocks.ask.mockRejectedValueOnce(
    new ApiRequestError(
      429,
      'AI_LIMIT_REACHED',
      'Limit reached. Use a quick question.',
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  await screen.findByRole('alert');
  expect(input).toHaveProperty('value', 'How much do I owe?');
  expect(mocks.ask).toHaveBeenCalledTimes(1);
  expect(mocks.ask.mock.calls[0]?.[2]).toEqual({
    message: 'How much do I owe?',
    privacyAcknowledged: true,
  });
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  await screen.findByText('You owe THB 1.01.');
  expect(input).toHaveProperty('value', '');
  expect(hasPendingWork()).toBe(false);
});

test('cancelling and switching households cannot show a late answer', async () => {
  let resolve: (result: AssistantAnswer) => void = () => {};
  mocks.ask.mockImplementationOnce(
    () =>
      new Promise<AssistantAnswer>((done) => {
        resolve = done;
      }),
  );
  const user = userEvent.setup();
  const view = render(
    <AssistantWorkspace household={household} token="token" />,
  );
  await user.click(screen.getByRole('button', { name: 'How much do I owe?' }));
  const signal = mocks.ask.mock.calls[0]?.[3] as AbortSignal;
  view.rerender(
    <AssistantWorkspace
      household={{ ...household, id: 'other', name: 'Other home' }}
      token="token"
    />,
  );
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolve(answer);
  });
  expect(screen.queryByText('You owe THB 1.01.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Cancel question' })).toBeNull();
  expect(hasPendingWork()).toBe(false);
});

test('lost membership clears earlier answers rather than retaining private records', async () => {
  const user = userEvent.setup();
  render(<AssistantWorkspace household={household} token="token" />);
  await user.click(screen.getByRole('button', { name: 'How much do I owe?' }));
  await screen.findByText('You owe THB 1.01.');
  mocks.ask.mockRejectedValueOnce(
    new ApiRequestError(404, 'NOT_FOUND', 'Household not found.'),
  );
  await user.click(
    screen.getByRole('button', { name: 'What chores are open?' }),
  );
  await screen.findByRole('alert');
  expect(screen.queryByText('You owe THB 1.01.')).toBeNull();
});

test('untrusted household text is rendered as text and truncated answers link to the full list', async () => {
  mocks.ask.mockResolvedValue({
    ...answer,
    partial: true,
    rows: [
      {
        label: '<script>alert(1)</script>',
        detail: 'Needed',
        href: '/house?view=shopping&item=item&household=home',
      },
    ],
  });
  const user = userEvent.setup();
  const view = render(
    <AssistantWorkspace household={household} token="token" />,
  );
  await user.click(
    screen.getByRole('button', { name: 'What do we need to buy?' }),
  );
  await screen.findByText('<script>alert(1)</script>');
  expect(view.container.querySelector('script')).toBeNull();
  expect(screen.getByText(/limited set of records/)).toBeTruthy();
});

test('switching household resets consent and unsent private input', async () => {
  const user = userEvent.setup();
  const view = render(
    <AssistantWorkspace household={household} token="token" />,
  );
  const input = screen.getByRole('textbox', { name: 'Ask your own question' });
  await waitFor(() => expect(input).toHaveProperty('disabled', false));
  await user.type(input, 'How much do I owe?');
  await user.click(screen.getByRole('checkbox'));
  view.rerender(
    <AssistantWorkspace
      household={{ ...household, id: 'other' }}
      token="token"
    />,
  );
  expect(input).toHaveProperty('value', '');
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  expect(mocks.ask).not.toHaveBeenCalled();
});
