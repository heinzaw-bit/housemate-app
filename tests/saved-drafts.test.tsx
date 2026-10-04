// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  SavedDraftNotice,
  SavedDraftProvider,
  useSavedDraft,
} from '../components/saved-draft';
import {
  clearSavedDrafts,
  draftKey,
  draftLifetime,
  pruneSavedDrafts,
  syncDraftAccount,
} from '../lib/saved-drafts';

const key = draftKey('account', 'home', 'test');
const submit = vi.fn();
function Form() {
  const [title, setTitle] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const draft = useSavedDraft({
    kind: 'test',
    enabled: open,
    value: { title },
    restore(value) {
      setTitle(value.title);
      setOpen(true);
    },
  });
  return (
    <>
      <SavedDraftNotice draft={draft} />
      <button type="button" onClick={() => setOpen(true)}>
        New draft
      </button>
      {open && (
        <>
          <input
            aria-label="Draft title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              try {
                submit({ title }, draft.confirmationKey({ title }));
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => {
              draft.clear();
              setOpen(false);
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              draft.clear();
              setOpen(false);
            }}
          >
            Saved successfully
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function mount(
  account = 'account',
  home = 'home',
  context = 'THB:Asia/Bangkok',
) {
  return render(
    <SavedDraftProvider
      account={account}
      household={home}
      households={['home', 'other']}
      context={context}
    >
      <Form />
    </SavedDraftProvider>,
  );
}
function entry(
  value = { title: 'Dinner' },
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    version: 1,
    accountId: 'account',
    householdId: 'home',
    kind: 'test',
    context: 'THB:Asia/Bangkok',
    savedAt: Date.now(),
    value,
    attempt: null,
    ...extra,
  });
}
beforeEach(() => {
  localStorage.clear();
  submit.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('edits survive a remount and wait for explicit resume and confirmation', async () => {
  const user = userEvent.setup();
  const first = mount();
  await user.click(screen.getByText('New draft'));
  await user.type(screen.getByLabelText('Draft title'), 'Dinner supplies');
  expect(JSON.parse(localStorage.getItem(key) ?? '{}').value.title).toBe(
    'Dinner supplies',
  );
  first.unmount();
  mount();
  expect(screen.queryByLabelText('Draft title')).toBeNull();
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByText('Resume draft'));
  expect((screen.getByLabelText('Draft title') as HTMLInputElement).value).toBe(
    'Dinner supplies',
  );
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByText('Confirm'));
  expect(submit).toHaveBeenCalledTimes(1);
});
test('cancel and a completed save remove the entry without recreating it during unmount', async () => {
  const user = userEvent.setup();
  let form = mount();
  await user.click(screen.getByText('New draft'));
  await user.type(screen.getByLabelText('Draft title'), 'Rent');
  await user.click(screen.getByText('Cancel'));
  form.unmount();
  expect(localStorage.getItem(key)).toBeNull();
  form = mount();
  await user.click(screen.getByText('New draft'));
  await user.type(screen.getByLabelText('Draft title'), 'Rent');
  await user.click(screen.getByText('Saved successfully'));
  form.unmount();
  expect(localStorage.getItem(key)).toBeNull();
});
test('discarding a saved draft does not restore it or call a write', async () => {
  localStorage.setItem(key, entry());
  const form = mount();
  await userEvent.setup().click(screen.getByText('Discard saved draft'));
  form.unmount();
  expect(localStorage.getItem(key)).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});
test('interrupted confirmations recover original values and reuse the same retry key', async () => {
  const user = userEvent.setup();
  const first = mount();
  await user.click(screen.getByText('New draft'));
  await user.type(screen.getByLabelText('Draft title'), 'Rent');
  await user.click(screen.getByText('Confirm'));
  const original = submit.mock.calls[0][1];
  await user.type(screen.getByLabelText('Draft title'), ' changed');
  await user.click(screen.getByText('Confirm'));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert').textContent).toContain(
    'earlier confirmation',
  );
  first.unmount();
  mount();
  await user.click(screen.getByText('Resume draft'));
  expect((screen.getByLabelText('Draft title') as HTMLInputElement).value).toBe(
    'Rent',
  );
  await user.click(screen.getByText('Confirm'));
  expect(submit.mock.calls[1][1]).toBe(original);
});
test.each([
  ['expired', { savedAt: Date.now() - draftLifetime - 1 }],
  ['future date', { savedAt: Date.now() + 120000 }],
  ['wrong owner', { accountId: 'someone' }],
  ['wrong household', { householdId: 'elsewhere' }],
  ['old schema', { version: 0 }],
  ['changed timezone', { context: 'THB:UTC' }],
  ['invalid field', { value: { title: 12 } }],
])('rejects %s entries without restoring them', (_name, extra) => {
  localStorage.setItem(key, entry({ title: 'Private' }, extra));
  mount();
  expect(screen.queryByText('Resume draft')).toBeNull();
  expect(localStorage.getItem(key)).toBeNull();
});
test('malformed JSON is removed and does not prevent new drafts', async () => {
  localStorage.setItem(key, '{broken');
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByText('New draft'));
  await user.type(screen.getByLabelText('Draft title'), 'New');
  expect(JSON.parse(localStorage.getItem(key) ?? '{}').value.title).toBe('New');
});
test('prunes departed households and other accounts while retaining authorized drafts', () => {
  localStorage.setItem(key, entry());
  localStorage.setItem(
    draftKey('account', 'gone', 'test'),
    entry({ title: 'Private' }, { householdId: 'gone' }),
  );
  localStorage.setItem(
    draftKey('other', 'home', 'test'),
    entry({ title: 'Private' }, { accountId: 'other' }),
  );
  pruneSavedDrafts('account', ['home']);
  expect(localStorage.length).toBe(1);
  expect(localStorage.getItem(key)).not.toBeNull();
});
test('account changes and sign-out clear stored drafts and prevent old cleanup from recreating them', async () => {
  syncDraftAccount('account');
  const user = userEvent.setup();
  const form = mount();
  await user.click(screen.getByText('New draft'));
  await user.type(screen.getByLabelText('Draft title'), 'Private');
  act(() => syncDraftAccount('new-account'));
  form.unmount();
  expect(localStorage.getItem(key)).toBeNull();
  act(() => syncDraftAccount(null));
  expect(localStorage.length).toBe(0);
});
test('refresh under the same account retains recovery data', () => {
  syncDraftAccount('account');
  localStorage.setItem(key, entry());
  syncDraftAccount('account');
  expect(localStorage.getItem(key)).not.toBeNull();
});
test('another tab cannot silently replace an active draft or be overwritten by discard', async () => {
  const user = userEvent.setup();
  const form = mount();
  await user.click(screen.getByText('New draft'));
  await user.type(screen.getByLabelText('Draft title'), 'First');
  const second = entry({ title: 'Second tab' });
  localStorage.setItem(key, second);
  await user.type(screen.getByLabelText('Draft title'), ' edit');
  expect(screen.getByRole('status').textContent).toContain('Another tab');
  await user.click(screen.getByText('Confirm'));
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByText('Cancel'));
  form.unmount();
  expect(localStorage.getItem(key)).toBe(second);
});
test('storage failure is visible and never breaks normal editing', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  });
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByText('New draft'));
  await user.type(screen.getByLabelText('Draft title'), 'Works');
  expect((screen.getByLabelText('Draft title') as HTMLInputElement).value).toBe(
    'Works',
  );
  expect(screen.getByRole('status').textContent).toContain('Could not save');
});
test('pagehide flushes the latest value without publishing', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByText('New draft'));
  fireEvent.change(screen.getByLabelText('Draft title'), {
    target: { value: 'Latest' },
  });
  fireEvent(window, new Event('pagehide'));
  expect(JSON.parse(localStorage.getItem(key) ?? '{}').value.title).toBe(
    'Latest',
  );
  expect(submit).not.toHaveBeenCalled();
});
test('clearing drafts explicitly cannot be undone by an old tab', async () => {
  const user = userEvent.setup();
  const form = mount();
  await user.click(screen.getByText('New draft'));
  await user.type(screen.getByLabelText('Draft title'), 'Private');
  act(() => clearSavedDrafts());
  fireEvent(window, new Event('pagehide'));
  form.unmount();
  expect(localStorage.getItem(key)).toBeNull();
});

test('household changes never expose the previous household draft and returning offers recovery', async () => {
  const user = userEvent.setup();
  const first = mount();
  await user.click(screen.getByText('New draft'));
  await user.type(screen.getByLabelText('Draft title'), 'First home');
  first.rerender(
    <SavedDraftProvider
      account="account"
      household="other"
      households={['home', 'other']}
      context="THB:Asia/Bangkok"
    >
      <Form />
    </SavedDraftProvider>,
  );
  expect(screen.queryByLabelText('Draft title')).toBeNull();
  expect(screen.queryByText('Resume draft')).toBeNull();
  first.rerender(
    <SavedDraftProvider
      account="account"
      household="home"
      households={['home', 'other']}
      context="THB:Asia/Bangkok"
    >
      <Form />
    </SavedDraftProvider>,
  );
  await user.click(screen.getByText('Resume draft'));
  expect((screen.getByLabelText('Draft title') as HTMLInputElement).value).toBe(
    'First home',
  );
});

test('resume and discard are keyboard accessible and recovery leaves focus on its status', async () => {
  localStorage.setItem(key, entry());
  mount();
  const user = userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByText('Resume draft'));
  await user.keyboard('{Enter}');
  expect(document.activeElement?.textContent).toContain('Draft restored');
  expect(submit).not.toHaveBeenCalled();
});
