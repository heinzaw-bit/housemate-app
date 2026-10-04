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

test('quick questions remain usable without AI setup and show a fresh balance without route actions', async () => {
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
  expect(screen.queryByRole('link', { name: 'View balance' })).toBeNull();
  expect(screen.getByText(/Ask again to refresh/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Calculate a split' })).toBeNull();
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
  expect(screen.queryByText(/By asking a general question/)).toBeNull();
  expect(screen.queryByText(/How answers work/)).toBeNull();
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
    screen
      .getByRole('link', { name: 'Record 5 Needed Open record' })
      .getAttribute('href'),
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

test('Board shortcut follows the chat and keeps the selected household', async () => {
  mocks.ask.mockResolvedValue({
    ...answer,
    topic: 'board',
    text: 'Your Board updates',
    sources: [
      {
        label: 'Announcements',
        href: '/house?view=announcements&household=home',
      },
    ],
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
          name: 'Board updates: What’s new on the Board?',
        }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  await user.click(
    screen.getByRole('button', {
      name: 'Board updates: What’s new on the Board?',
    }),
  );
  await screen.findByText('Your Board updates');
  expect(
    screen
      .getByRole('link', { name: 'View announcements' })
      .getAttribute('href'),
  ).toBe('/house?view=announcements&household=home');
  expect(screen.queryByRole('button', { name: /Meal plans/ })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Plan a meal' })).toBeNull();
  expect(mocks.ask.mock.calls[0]?.[2]).toEqual({ topic: 'board' });
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

for (const topic of [
  'general',
  'board',
  'announcements',
  'greeting',
  'about',
] as const) {
  test(`Assistant renders ${topic} replies outside the composer with source links intact`, async () => {
    mocks.config.mockResolvedValue({
      naturalLanguageEnabled: true,
      chatEnabled: true,
    });
    mocks.ask.mockResolvedValue({
      ...answer,
      topic,
      text:
        topic === 'general'
          ? '<script>do not execute</script> Helpful general advice.'
          : 'A new kind of answer.',
      sources: [],
    });
    const user = userEvent.setup();
    const view = render(
      <AssistantWorkspace household={household} token="token" />,
    );
    const input = screen.getByRole('textbox');
    await waitFor(() => expect(input).toHaveProperty('disabled', false));
    await user.type(input, 'Hello');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const latest = await screen.findByRole('region', { name: 'Latest answer' });
    expect(
      screen.getByRole('region', { name: 'Ask HouseMate' }).contains(latest),
    ).toBe(false);
    expect(within(latest).getByRole('heading')).toBeTruthy();
    expect(view.container.querySelector('script')).toBeNull();
    if (topic === 'general')
      expect(screen.getByText(/General AI answer/)).toBeTruthy();
    expect(mocks.draft).not.toHaveBeenCalled();
  });
}

test('new server capability enables local chat without implying Gemini is configured', async () => {
  mocks.config.mockResolvedValue({
    naturalLanguageEnabled: false,
    chatEnabled: true,
  });
  mocks.ask.mockResolvedValue({
    ...answer,
    topic: 'greeting',
    text: 'Hi! I’m HouseMate.',
  });
  const user = userEvent.setup();
  render(<AssistantWorkspace household={household} token="token" />);
  const input = screen.getByRole('textbox');
  await waitFor(() => expect(input).toHaveProperty('disabled', false));
  expect(screen.queryByText(/By asking a general question/)).toBeNull();
  await user.type(input, 'Hello');
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  await screen.findByText('I’m HouseMate.');
  expect(mocks.draft).not.toHaveBeenCalled();
});
test('clarification choices stay read-only and ask a fresh household question', async () => {
  mocks.ask
    .mockResolvedValueOnce({
      ...answer,
      kind: 'clarification',
      topic: 'unsupported',
      text: 'Would you like Board updates or your balance?',
      choices: [
        { label: 'Board updates', topic: 'board' },
        { label: 'My balance', topic: 'balance' },
      ],
    })
    .mockResolvedValueOnce({
      ...answer,
      topic: 'board',
      text: 'Here are your Board updates.',
    });
  const user = userEvent.setup();
  render(<AssistantWorkspace household={household} token="token" />);
  const input = screen.getByRole('textbox');
  await waitFor(() => expect(input).toHaveProperty('disabled', false));
  await user.type(input, 'What is due?');
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  const choices = await screen.findByRole('group', {
    name: 'Choose what to check',
  });
  await user.click(
    within(choices).getByRole('button', { name: 'Board updates' }),
  );
  await screen.findByText('Here are your Board updates.');
  expect(mocks.ask.mock.calls[1][2]).toEqual({ topic: 'board' });
  expect(mocks.draft).not.toHaveBeenCalled();
});

test('short follow-ups send only a topic and lose it when answers or household are cleared', async () => {
  mocks.ask.mockResolvedValue({
    ...answer,
    topic: 'events',
    text: 'Upcoming events.',
  });
  const user = userEvent.setup();
  const view = render(
    <AssistantWorkspace household={household} token="token" />,
  );
  const input = screen.getByRole('textbox');
  await waitFor(() => expect(input).toHaveProperty('disabled', false));
  await user.type(input, 'What events are there?');
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  await screen.findByText('Upcoming events.');
  await user.type(input, 'What about today?');
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
  expect(mocks.ask.mock.calls[1][2]).toEqual({
    message: 'What about today?',
    privacyAcknowledged: true,
    context: { topic: 'events' },
  });
  await screen.findByText('Earlier answers (1)');
  await user.click(screen.getByRole('button', { name: 'Clear answers' }));
  await user.type(input, 'Hello');
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(3));
  expect(mocks.ask.mock.calls[2][2]).not.toHaveProperty('context');
  view.rerender(
    <AssistantWorkspace
      household={{ ...household, id: 'other-home' }}
      token="token"
    />,
  );
  await waitFor(() => expect(input).toHaveProperty('value', ''));
  expect(screen.queryByRole('article')).toBeNull();
});

test('general replies render escaped paragraphs and bullets without factual checked labels', async () => {
  mocks.ask.mockResolvedValue({
    ...answer,
    topic: 'general',
    text: 'Keep it simple.\n\n- Store dry rice in a sealed container.\n- Keep it away from moisture.',
    sources: [],
  });
  const user = userEvent.setup();
  const view = render(
    <AssistantWorkspace household={household} token="token" />,
  );
  await user.click(
    screen.getByRole('button', { name: 'Catch me up: What needs attention?' }),
  );
  await screen.findByText('Keep it simple.');
  expect(
    screen.getByText('Store dry rice in a sealed container.').closest('li'),
  ).toBeTruthy();
  expect(view.container.textContent).not.toContain('Checked');
  expect(screen.getByText(/General AI answer/)).toBeTruthy();
});
