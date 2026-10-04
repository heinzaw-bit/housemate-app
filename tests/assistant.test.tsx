// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AssistantWorkspace } from '../components/assistant-workspace';
import {
  ApiRequestError,
  type AssistantAnswer,
  type Household,
} from '../lib/api';
import { hasPendingWork } from '../lib/pending-work';

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  ask: vi.fn(),
  draft: vi.fn(),
  meal: vi.fn(),
  announcement: vi.fn(),
}));
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getAssistantConfig: mocks.config,
  askAssistant: mocks.ask,
  prepareAssistantDraft: mocks.draft,
  createMeal: mocks.meal,
  createAnnouncement: mocks.announcement,
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
  mocks.draft.mockReset().mockResolvedValue({ draft: null });
  mocks.meal.mockReset().mockResolvedValue({ id: 'meal-record' });
  mocks.announcement
    .mockReset()
    .mockResolvedValue({ id: 'announcement-record' });
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
  await user.click(
    screen.getByRole('button', { name: 'My balance: How much do I owe?' }),
  );
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
  expect(
    screen
      .getByRole('link', { name: 'Calculate a split' })
      .getAttribute('href'),
  ).toBe('/money?household=home&view=expenses&add=1');
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
    false,
  );
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getByText(/By asking a general question/)).toBeTruthy();
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

test('answers separate the exact money summary from context and preserve clarification input', async () => {
  mocks.ask.mockResolvedValueOnce({
    ...answer,
    text: 'You owe THB 1.01. Unpaid provider bills are excluded. Recorded transfers are manual.',
  });
  const user = userEvent.setup();
  const view = render(
    <AssistantWorkspace household={household} token="token" />,
  );
  await user.click(
    screen.getByRole('button', { name: 'My balance: How much do I owe?' }),
  );
  await screen.findByRole('heading', { name: 'Your balance' });
  expect(screen.getByText('You owe THB 1.01.')).toBeTruthy();
  expect(
    screen.getByText(
      'Unpaid provider bills are excluded. Recorded transfers are manual.',
    ),
  ).toBeTruthy();
  expect(view.container.querySelector('article')?.textContent).toContain(
    'THB 1.01.',
  );
  mocks.ask.mockResolvedValueOnce({
    ...answer,
    kind: 'clarification',
    topic: 'unsupported',
    text: 'Which record do you mean?',
  });
  const input = screen.getByRole('textbox', { name: 'Ask your own question' });
  await user.type(input, 'Tell me about that');
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  await screen.findByRole('heading', { name: 'Let’s clarify' });
  expect(input).toHaveProperty('value', 'Tell me about that');
  expect(document.activeElement).toBe(input);
  expect(hasPendingWork()).toBe(true);
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
  await user.click(
    screen.getByRole('button', { name: 'My balance: How much do I owe?' }),
  );
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
  await user.click(
    screen.getByRole('button', { name: 'My balance: How much do I owe?' }),
  );
  await screen.findByText('You owe THB 1.01.');
  mocks.ask.mockRejectedValueOnce(
    new ApiRequestError(404, 'NOT_FOUND', 'Household not found.'),
  );
  await user.click(
    screen.getByRole('button', { name: 'Catch me up: What needs attention?' }),
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
    screen.getByRole('button', {
      name: 'Catch me up: What needs attention?',
    }),
  );
  await screen.findByText('<script>alert(1)</script>');
  expect(view.container.querySelector('script')).toBeNull();
  expect(screen.getByText(/limited set of records/)).toBeTruthy();
});

test('switching household resets unsent private input without sending it', async () => {
  const user = userEvent.setup();
  const view = render(
    <AssistantWorkspace household={household} token="token" />,
  );
  const input = screen.getByRole('textbox', { name: 'Ask your own question' });
  await waitFor(() => expect(input).toHaveProperty('disabled', false));
  await user.type(input, 'How much do I owe?');
  view.rerender(
    <AssistantWorkspace
      household={{ ...household, id: 'other' }}
      token="token"
    />,
  );
  expect(input).toHaveProperty('value', '');
  expect(screen.queryByRole('checkbox')).toBeNull();
  await waitFor(() => expect(input).toHaveProperty('disabled', false));
  await user.type(input, 'How much do I owe?');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(mocks.ask).not.toHaveBeenCalled();
});

test('keyboard submission has no separate checkbox and cancellation ignores a late reply', async () => {
  const user = userEvent.setup();
  let resolve: (result: AssistantAnswer) => void = () => {};
  mocks.ask.mockImplementationOnce(
    () =>
      new Promise<AssistantAnswer>((done) => {
        resolve = done;
      }),
  );
  render(<AssistantWorkspace household={household} token="token" />);
  const input = screen.getByRole('textbox', { name: 'Ask your own question' });
  await waitFor(() => expect(input).toHaveProperty('disabled', false));
  await user.type(input, 'Who is cooking today?');
  await user.keyboard('{Shift>}{Enter}{/Shift}');
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(input).toHaveProperty('value', 'Who is cooking today?\n');
  await user.keyboard('{Enter}');
  expect(mocks.ask).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('status', { name: 'Assistant is thinking' }),
  ).toBeTruthy();
  expect(screen.getByText('Looking that up…')).toBeTruthy();
  const composer = screen.getByRole('region', { name: 'Ask HouseMate' });
  const loading = screen.getByRole('status', { name: 'Assistant is thinking' });
  expect(composer.contains(loading)).toBe(true);
  expect(input.parentElement?.contains(loading)).toBe(true);
  expect(screen.queryByRole('region', { name: 'Latest answer' })).toBeNull();
  expect(screen.getByRole('textbox')).toHaveProperty('disabled', true);
  const signal = mocks.ask.mock.calls[0]?.[3] as AbortSignal;
  await user.click(screen.getByRole('button', { name: 'Cancel question' }));
  expect(signal.aborted).toBe(true);
  expect(input).toHaveProperty('value', 'Who is cooking today?\n');
  expect(
    screen.queryByRole('status', { name: 'Assistant is thinking' }),
  ).toBeNull();
  expect(document.activeElement).toBe(input);
  await act(async () => resolve(answer));
  expect(screen.queryByText('You owe THB 1.01.')).toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'Catch me up: What needs attention?' }),
  );
  await screen.findByText('You owe THB 1.01.');
  expect(
    composer.contains(screen.getByRole('region', { name: 'Latest answer' })),
  ).toBe(false);
  expect(input).toHaveProperty('value', 'Who is cooking today?\n');
});

test('record previews expand without losing any source links or making extra requests', async () => {
  mocks.ask.mockResolvedValue({
    ...answer,
    rows: Array.from({ length: 5 }, (_, i) => ({
      label: `Record ${i + 1}`,
      detail: 'Needed',
      href: `/house?view=shopping&item=${i + 1}&household=home`,
    })),
  });
  const user = userEvent.setup();
  render(<AssistantWorkspace household={household} token="token" />);
  await user.click(
    screen.getByRole('button', {
      name: 'Catch me up: What needs attention?',
    }),
  );
  await screen.findByText('Record 1');
  expect(screen.queryByText('Record 4')).toBeNull();
  const expand = screen.getByRole('button', { name: 'Show 2 more records' });
  expect(expand.getAttribute('aria-expanded')).toBe('false');
  await user.click(expand);
  expect(
    screen.getByRole('link', { name: 'Record 5 Needed' }).getAttribute('href'),
  ).toBe('/house?view=shopping&item=5&household=home');
  expect(expand.getAttribute('aria-expanded')).toBe('true');
  await user.click(screen.getByRole('button', { name: 'Show fewer records' }));
  expect(screen.queryByText('Record 4')).toBeNull();
  expect(mocks.ask).toHaveBeenCalledTimes(1);
});

test('latest answer stays below the composer, earlier replies expand, and clearing preserves input', async () => {
  mocks.ask
    .mockResolvedValueOnce({ ...answer, text: 'First answer' })
    .mockResolvedValueOnce({ ...answer, text: 'Second answer' });
  const user = userEvent.setup();
  render(<AssistantWorkspace household={household} token="token" />);
  await user.click(
    screen.getByRole('button', { name: 'My balance: How much do I owe?' }),
  );
  await screen.findByText('First answer');
  await user.click(
    screen.getByRole('button', { name: 'Catch me up: What needs attention?' }),
  );
  await screen.findByText('Second answer');
  const latest = screen.getByRole('region', { name: 'Latest answer' });
  expect(within(latest).getByRole('article').textContent).toContain(
    'Second answer',
  );
  const history = screen.getByText('Earlier answers (1)').closest('details');
  expect(history).toHaveProperty('open', false);
  await user.click(screen.getByText('Earlier answers (1)'));
  expect(history).toHaveProperty('open', true);
  expect(
    within(history as HTMLElement).getByRole('article').textContent,
  ).toContain('First answer');
  const input = screen.getByRole('textbox', { name: 'Ask your own question' });
  await user.type(input, 'What meals are coming up?');
  await user.click(screen.getByRole('button', { name: 'Clear answers' }));
  expect(screen.queryByRole('article')).toBeNull();
  expect(document.activeElement).toBe(input);
  expect(input).toHaveProperty('value', 'What meals are coming up?');
  expect(hasPendingWork()).toBe(true);
  expect(mocks.ask).toHaveBeenCalledTimes(2);
});

test('bill shortcut follows the chat and keeps the selected household', async () => {
  mocks.ask.mockResolvedValue({
    ...answer,
    topic: 'bills',
    text: 'Your upcoming bills',
    sources: [{ label: 'Bills', href: '/money?view=bills&household=home' }],
  });
  const user = userEvent.setup();
  const view = render(
    <AssistantWorkspace household={household} token="token" />,
  );
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(
    screen
      .getByRole('textbox', { name: 'Ask your own question' })
      .compareDocumentPosition(
        screen.getByRole('button', {
          name: 'Bills to watch: Which bills are due?',
        }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  await user.click(
    screen.getByRole('button', {
      name: 'Bills to watch: Which bills are due?',
    }),
  );
  await screen.findByText('Your upcoming bills');
  expect(screen.getByRole('link', { name: 'Bills' }).getAttribute('href')).toBe(
    '/money?view=bills&household=home',
  );
  expect(screen.queryByRole('button', { name: /Meal plans/ })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Plan a meal' })).toBeNull();
  expect(mocks.ask.mock.calls[0]?.[2]).toEqual({ topic: 'bills' });
  expect(view.container.querySelectorAll('textarea')).toHaveLength(1);
});

test('legacy action availability does not enable drafting or typed questions without AI', async () => {
  mocks.config.mockResolvedValue({
    naturalLanguageEnabled: false,
    actionDraftsEnabled: true,
  });
  render(<AssistantWorkspace household={household} token="token" />);
  await screen.findByText(/once AI setup is complete/);
  expect(screen.getByRole('textbox')).toHaveProperty('disabled', true);
  expect(screen.queryByText(/Draft commands/)).toBeNull();
  expect(mocks.draft).not.toHaveBeenCalled();
});
