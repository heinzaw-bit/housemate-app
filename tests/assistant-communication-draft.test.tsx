// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AssistantDraftReview } from '../components/assistant-draft-review';
import {
  ApiRequestError,
  type AssistantActionDraft,
  type AssistantAnswer,
  type Household,
} from '../lib/api';
import { hasPendingWork, useLeaveGuard } from '../lib/pending-work';

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
const published = vi.fn();
beforeEach(() => {
  published.mockReset();
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

const mealDraft: AssistantActionDraft = {
  kind: 'meal',
  householdId: 'home',
  timezone: 'Asia/Bangkok',
  generatedAt: '2026-10-01T00:00:00Z',
  fields: {
    mealType: 'dinner',
    question: 'Who is joining dinner?',
    startsAtLocal: '2026-10-02T19:00',
    responseDeadlineLocal: '',
  },
  members: [
    { id: 'one', displayName: 'Aye' },
    { id: 'two', displayName: 'Hein' },
  ],
  recipientIds: ['one', 'two'],
  unresolvedFields: ['When should responses close?'],
  notes: ['Unsaved draft.'],
};
const announcementDraft: AssistantActionDraft = {
  ...mealDraft,
  kind: 'announcement',
  unresolvedFields: [],
  fields: {
    title: 'Dinner is ready',
    body: 'Dinner is ready. Come to the kitchen.',
    priority: 'normal',
    requiresAcknowledgement: false,
    expiresAtLocal: null,
  },
};
function DraftHarness({ draft }: { draft: AssistantActionDraft }) {
  const [notice, setNotice] = useState('');
  useLeaveGuard(!notice);
  if (notice) return <p>{notice}</p>;
  return (
    <AssistantDraftReview
      draft={draft}
      household={household}
      token="token"
      onCancel={() => setNotice('Cancelled')}
      onPublished={(kind, id, title) => {
        published(kind, id, title);
        setNotice('Saved');
      }}
      onAccessLost={(message) => setNotice(message)}
    />
  );
}
async function requestDraft(draft: AssistantActionDraft, _text?: string) {
  const user = userEvent.setup();
  const view = render(<DraftHarness draft={draft} />);
  await screen.findByRole('heading', {
    name: draft.kind === 'meal' ? 'Draft meal check' : 'Draft announcement',
  });
  return { user, view };
}
function setDeadline(value = '2026-10-02T18:00') {
  fireEvent.change(screen.getByLabelText('Responses close (Asia/Bangkok)'), {
    target: { value },
  });
}

test('retained meal editor validates, reviews and only publishes after confirmation', async () => {
  const { user } = await requestDraft(mealDraft);
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(hasPendingWork()).toBe(true);
  const accessibility = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(accessibility.violations).toEqual([]);
  setDeadline('2026-10-02T20:00');
  await user.click(screen.getByRole('button', { name: 'Review meal check' }));
  expect(screen.getByRole('alert').textContent).toContain('before the meal');
  setDeadline();
  await user.click(screen.getByRole('checkbox', { name: 'Hein' }));
  await user.click(screen.getByRole('button', { name: 'Review meal check' }));
  expect(screen.getByText('Recipients (1): Aye')).toBeTruthy();
  expect(mocks.meal).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Edit draft' }));
  expect(
    screen.getByLabelText('Responses close (Asia/Bangkok)'),
  ).toHaveProperty('value', '2026-10-02T18:00');
  await user.click(screen.getByRole('button', { name: 'Review meal check' }));
  await user.click(screen.getByRole('button', { name: 'Confirm and publish' }));
  await screen.findByText('Saved');
  expect(published).toHaveBeenCalledWith(
    'meal',
    'meal-record',
    'Who is joining dinner?',
  );
  expect(mocks.meal).toHaveBeenCalledTimes(1);
  expect(mocks.meal.mock.calls[0]).toEqual([
    'token',
    'home',
    {
      ...mealDraft.fields,
      responseDeadlineLocal: '2026-10-02T18:00',
      participantIds: ['one'],
      cookingRoles: [],
      idempotencyKey: expect.any(String),
    },
  ]);
  expect(hasPendingWork()).toBe(false);
});

test('targeted announcements require recipients and cancel never publishes', async () => {
  const { user } = await requestDraft({
    ...announcementDraft,
    recipientIds: [],
  });
  await user.click(screen.getByRole('button', { name: 'Review announcement' }));
  expect(screen.getByRole('alert').textContent).toContain(
    'Choose at least one',
  );
  await user.click(screen.getByRole('checkbox', { name: 'Aye' }));
  await user.click(screen.getByRole('button', { name: 'Review announcement' }));
  expect(screen.getByText('Recipients (1): Aye')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Cancel draft' }));
  expect(mocks.announcement).not.toHaveBeenCalled();
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(hasPendingWork()).toBe(false);
});

test('interrupted announcement confirmation freezes and retries exactly the original payload and key', async () => {
  mocks.announcement.mockRejectedValueOnce(
    new ApiRequestError(0, 'NETWORK_ERROR', 'Connection interrupted.'),
  );
  const { user } = await requestDraft(
    announcementDraft,
    'Announce dinner is ready',
  );
  await user.click(
    screen.getByRole('checkbox', { name: 'Ask recipients to acknowledge' }),
  );
  await user.selectOptions(screen.getByLabelText('Priority'), 'important');
  await user.click(screen.getByRole('button', { name: 'Review announcement' }));
  await user.click(screen.getByRole('button', { name: 'Confirm and publish' }));
  await screen.findByRole('alert');
  expect(mocks.announcement).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Edit draft' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.getByRole('button', { name: 'Cancel draft' })).toHaveProperty(
    'disabled',
    true,
  );
  const first = mocks.announcement.mock.calls[0];
  mocks.announcement.mockRejectedValueOnce(
    new ApiRequestError(400, 'INVALID_RECIPIENTS', 'Audience changed.'),
  );
  await user.click(screen.getByRole('button', { name: 'Retry publication' }));
  await screen.findByText('Audience changed.');
  expect(screen.getByRole('button', { name: 'Edit draft' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(mocks.announcement.mock.calls[1]).toEqual(first);
  await user.click(screen.getByRole('button', { name: 'Retry publication' }));
  await screen.findByText('Saved');
  expect(published).toHaveBeenCalledWith(
    'announcement',
    'announcement-record',
    'Dinner is ready',
  );
  expect(mocks.announcement.mock.calls[2]).toEqual(first);
  expect(first[2]).toMatchObject({
    priority: 'important',
    requiresAcknowledgement: true,
    recipientIds: ['one', 'two'],
  });
});

test('definitive validation failure permits corrections but lost access clears private draft', async () => {
  mocks.meal.mockRejectedValueOnce(
    new ApiRequestError(400, 'INVALID_TIME', 'Deadline must be future.'),
  );
  const { user } = await requestDraft(mealDraft);
  setDeadline();
  await user.click(screen.getByRole('button', { name: 'Review meal check' }));
  await user.click(screen.getByRole('button', { name: 'Confirm and publish' }));
  await screen.findByRole('alert');
  expect(
    screen.getByRole('heading', { name: 'Draft meal check' }),
  ).toBeTruthy();
  const firstKey = mocks.meal.mock.calls[0][2].idempotencyKey;
  setDeadline('2026-10-02T17:00');
  mocks.meal.mockRejectedValueOnce(
    new ApiRequestError(404, 'NOT_FOUND', 'Household not found.'),
  );
  await user.click(screen.getByRole('button', { name: 'Review meal check' }));
  await user.click(screen.getByRole('button', { name: 'Confirm and publish' }));
  await screen.findByText('Household not found.');
  expect(mocks.meal.mock.calls[1][2].idempotencyKey).not.toBe(firstKey);
  expect(screen.queryByText('Who is joining dinner?')).toBeNull();
  expect(
    screen.queryByRole('heading', { name: 'Draft meal check' }),
  ).toBeNull();
  expect(hasPendingWork()).toBe(false);
});
