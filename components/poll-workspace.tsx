'use client';

import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  createPoll,
  getPoll,
  getPolls,
  type Household,
  type Poll,
  type PollScope,
  voteInPoll,
} from '@/lib/api';
import { useLeaveGuard } from '@/lib/pending-work';
import { useHouseRecords } from '@/lib/use-house-records';
import {
  CommunicationBrowser,
  CommunicationRecipients,
  householdLocalTime,
  householdTime,
  useCommunicationMembers,
  usePublicationKey,
} from './communication-parts';

const scopes = [
  { value: 'open', label: 'Open polls' },
  { value: 'needs_vote', label: 'Needs your vote' },
  { value: 'closed', label: 'Closed polls' },
];
function emptyOptions() {
  return [
    { key: crypto.randomUUID(), label: '' },
    { key: crypto.randomUUID(), label: '' },
  ];
}

function PollVoteEditor({
  poll,
  token,
  householdId,
  onSaved,
  onRefresh,
}: {
  poll: Poll;
  token: string;
  householdId: string;
  onSaved: (updated: Poll) => void;
  onRefresh: () => void;
}) {
  const [optionIds, setOptionIds] = useState(poll.myOptionIds);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useLeaveGuard(dirty || saving);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!dirty) setOptionIds(poll.myOptionIds);
  }, [poll.myOptionIds, dirty]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const updated = await voteInPoll(token, householdId, poll.id, optionIds);
      setOptionIds(updated.myOptionIds);
      setDirty(false);
      onSaved(updated);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not save your vote.',
      );
      onRefresh();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-3">
      {poll.myOptionIds.length > 0 && (
        <p className="rounded-xl bg-primary/10 p-3 text-primary">
          Your saved {poll.allowMultiple ? 'choices' : 'vote'}:{' '}
          {poll.options
            .filter((option) => poll.myOptionIds.includes(option.id))
            .map((option) => option.label)
            .join(', ')}
        </p>
      )}
      {poll.canVote ? (
        <form onSubmit={(event) => void submit(event)} className="space-y-3">
          <fieldset disabled={saving} className="space-y-2">
            <legend className="mb-2 font-medium">
              {poll.allowMultiple
                ? 'Choose one or more options'
                : 'Choose one option'}
            </legend>
            {poll.options.map((option) => (
              <label
                key={option.id}
                className="flex items-center gap-3 rounded-xl border p-3"
              >
                <input
                  type={poll.allowMultiple ? 'checkbox' : 'radio'}
                  name={`poll-${poll.id}`}
                  checked={optionIds.includes(option.id)}
                  onChange={() => {
                    setOptionIds((old) =>
                      poll.allowMultiple
                        ? old.includes(option.id)
                          ? old.filter((id) => id !== option.id)
                          : [...old, option.id]
                        : [option.id],
                    );
                    setDirty(true);
                    setError('');
                  }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          {dirty && (
            <p className="text-xs text-muted-foreground">
              These choices have not been saved yet.
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={
                saving ||
                !dirty ||
                (!optionIds.length && !poll.myOptionIds.length)
              }
            >
              {saving
                ? 'Saving…'
                : !optionIds.length
                  ? 'Withdraw vote'
                  : poll.myOptionIds.length
                    ? 'Update vote'
                    : 'Save vote'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={saving || !optionIds.length}
              onClick={() => {
                setOptionIds([]);
                setDirty(true);
              }}
            >
              Clear selection
            </Button>
            {dirty && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setOptionIds(poll.myOptionIds);
                  setDirty(false);
                  setError('');
                }}
              >
                Discard changes
              </Button>
            )}
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground">
          {poll.closed
            ? 'The deadline has passed. Voting is closed.'
            : 'You are not selected to vote in this poll.'}
        </p>
      )}
      {!poll.canVote && error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function PollWorkspace({
  household,
  token,
  focusedId = '',
  focusSignal = 0,
  createRequest = 0,
  onHouseChanged,
}: {
  household: Household;
  token: string;
  focusedId?: string;
  focusSignal?: number;
  createRequest?: number;
  onHouseChanged: () => void;
}) {
  const [scope, setScope] = useState<PollScope>('open');
  const browser = useHouseRecords<Poll, PollScope>({
    token,
    householdId: household.id,
    scope,
    loadPage: getPolls,
    getRecord: getPoll,
    focusedId,
    focusSignal,
  });
  const audience = useCommunicationMembers(token, household.id);
  const [formOpen, setFormOpen] = useState(false);
  useLeaveGuard(formOpen);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(emptyOptions);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [deadlineLocal, setDeadlineLocal] = useState(() =>
    householdLocalTime(household.timezone, 24),
  );
  const [voterIds, setVoterIds] = useState<string[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const publicationKey = usePublicationKey();
  const chosenVoters = voterIds ?? audience.members.map((member) => member.id);
  useEffect(() => {
    if (createRequest) setFormOpen(true);
  }, [createRequest]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const labels = options.map((option) => option.label.trim());
    if (
      !question.trim() ||
      !chosenVoters.length ||
      labels.some((label) => !label) ||
      new Set(labels.map((label) => label.toLowerCase())).size !== labels.length
    ) {
      setFormError(
        'Enter a question, at least two different choices, and select eligible voters.',
      );
      return;
    }
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    setSaving(true);
    try {
      const draft = {
        question: question.trim(),
        options: labels,
        allowMultiple,
        deadlineLocal,
        voterIds: [...chosenVoters].sort(),
      };
      const created = await createPoll(token, household.id, {
        ...draft,
        idempotencyKey: publicationKey.forDraft(draft),
      });
      browser.accept(created);
      setScope('open');
      setFormOpen(false);
      setReviewing(false);
      setQuestion('');
      setOptions(emptyOptions());
      setAllowMultiple(false);
      setDeadlineLocal(householdLocalTime(household.timezone, 24));
      setVoterIds(null);
      publicationKey.reset();
      setNotice('Poll published. Selected members can now vote.');
      onHouseChanged();
      void browser.refresh(true);
    } catch (failure) {
      setFormError(
        failure instanceof Error
          ? failure.message
          : 'Could not publish this poll. Retry to check whether it was saved.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <CommunicationBrowser
      title="Polls"
      subtitle="Make decisions together and keep the results clear."
      createOpen={formOpen}
      onToggleCreate={() => setFormOpen((old) => !old)}
      form={
        <Card>
          <CardHeader>
            <CardTitle>{reviewing ? 'Review poll' : 'New poll'}</CardTitle>
            <p className="text-sm text-muted-foreground">
              The question, choices, voters, and deadline stay fixed after
              publishing. Members can change their own votes until the deadline.
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void submit(event)}
              className="space-y-4"
            >
              {audience.error && (
                <div role="alert" className="text-sm text-destructive">
                  {audience.error}{' '}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void audience.refresh()}
                  >
                    Retry members
                  </Button>
                </div>
              )}
              {formError && (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              )}
              {reviewing ? (
                <div className="space-y-3 rounded-xl bg-muted/50 p-4 text-sm">
                  <h3 className="font-heading text-lg">{question}</h3>
                  <p>
                    {allowMultiple
                      ? 'Multiple choices allowed'
                      : 'Single choice'}
                  </p>
                  <ul className="list-inside list-disc">
                    {options.map((option) => (
                      <li key={option.key}>{option.label}</li>
                    ))}
                  </ul>
                  <p>
                    <strong>Deadline:</strong> {deadlineLocal.replace('T', ' ')}{' '}
                    ({household.timezone})
                  </p>
                  <p>
                    <strong>Voters:</strong>{' '}
                    {audience.members
                      .filter((member) => chosenVoters.includes(member.id))
                      .map((member) => member.displayName)
                      .join(', ')}
                  </p>
                </div>
              ) : (
                <>
                  <label
                    htmlFor="poll-question"
                    className="block space-y-1.5 text-sm font-medium"
                  >
                    Question
                    <Input
                      id="poll-question"
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      maxLength={240}
                      required
                      disabled={saving}
                      placeholder="What should we cook this weekend?"
                    />
                  </label>
                  <fieldset disabled={saving} className="space-y-2">
                    <legend className="mb-2 text-sm font-medium">
                      Choices (2–10)
                    </legend>
                    {options.map((option, index) => (
                      <div key={option.key} className="flex items-center gap-2">
                        <label
                          htmlFor={`poll-option-${option.key}`}
                          className="sr-only"
                        >
                          Choice {index + 1}
                        </label>
                        <Input
                          id={`poll-option-${option.key}`}
                          value={option.label}
                          maxLength={100}
                          required
                          placeholder={`Choice ${index + 1}`}
                          onChange={(event) =>
                            setOptions((old) =>
                              old.map((choice) =>
                                choice.key === option.key
                                  ? { ...choice, label: event.target.value }
                                  : choice,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove choice ${index + 1}`}
                          disabled={options.length <= 2}
                          onClick={() =>
                            setOptions((old) =>
                              old.filter((choice) => choice.key !== option.key),
                            )
                          }
                        >
                          <X size={15} aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={options.length >= 10}
                      onClick={() =>
                        setOptions((old) => [
                          ...old,
                          { key: crypto.randomUUID(), label: '' },
                        ])
                      }
                    >
                      <Plus size={15} aria-hidden="true" /> Add choice
                    </Button>
                  </fieldset>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allowMultiple}
                      onChange={(event) =>
                        setAllowMultiple(event.target.checked)
                      }
                      disabled={saving}
                    />
                    Allow multiple choices
                  </label>
                  <label
                    htmlFor="poll-deadline"
                    className="block space-y-1.5 text-sm font-medium"
                  >
                    Voting deadline ({household.timezone})
                    <Input
                      id="poll-deadline"
                      type="datetime-local"
                      value={deadlineLocal}
                      onChange={(event) => setDeadlineLocal(event.target.value)}
                      required
                      disabled={saving}
                    />
                  </label>
                  <CommunicationRecipients
                    label="Eligible voters"
                    members={audience.members}
                    selectedIds={chosenVoters}
                    onChange={setVoterIds}
                    disabled={saving}
                  />
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {reviewing && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => setReviewing(false)}
                  >
                    Edit draft
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={saving || !audience.members.length}
                >
                  {saving
                    ? 'Publishing…'
                    : reviewing
                      ? 'Publish poll'
                      : 'Review poll'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      }
      scopes={scopes}
      scope={scope}
      onScope={(next) => {
        setScope(next as PollScope);
        browser.close();
      }}
      records={browser.records}
      selected={browser.selected}
      loading={browser.loading}
      detailLoading={browser.detailLoading}
      loadingMore={browser.loadingMore}
      hasMore={browser.hasMore}
      error={browser.error}
      updatedAt={browser.updatedAt}
      notice={notice}
      onOpen={(id) => void browser.open(id)}
      onClose={browser.close}
      onRefresh={() => void browser.refresh()}
      onMore={() => void browser.loadMore()}
      renderRow={(record) => (
        <>
          <strong className="block">{record.question}</strong>
          <span className="block text-sm text-muted-foreground">
            {record.closed ? 'Closed' : 'Closes'}{' '}
            {householdTime(record.deadline, household.timezone)}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {record.responseCount} responses ·{' '}
            {record.allowMultiple ? 'Multiple choice' : 'Single choice'}
            {record.myOptionIds.length
              ? ' · You voted'
              : record.canVote
                ? ' · Your vote needed'
                : ''}
          </span>
        </>
      )}
      renderDetail={(record) => (
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-heading text-xl">{record.question}</h3>
            <p className="text-muted-foreground">
              By {record.authorDisplayName} ·{' '}
              {record.allowMultiple ? 'Multiple choice' : 'Single choice'}
            </p>
            <p className="mt-2 font-medium">
              {record.closed ? 'Closed' : 'Closes'}{' '}
              {householdTime(record.deadline, record.timezone)}
            </p>
          </div>
          <PollVoteEditor
            key={record.id}
            poll={record}
            token={token}
            householdId={household.id}
            onSaved={(updated) => {
              browser.accept(updated);
              setNotice(
                updated.myOptionIds.length
                  ? 'Your vote was saved.'
                  : 'Your vote was withdrawn.',
              );
              onHouseChanged();
              void browser.refresh(true);
            }}
            onRefresh={() => void browser.refresh(true)}
          />
          <div className="space-y-3 border-t pt-4">
            <h4 className="font-medium">
              {record.closed ? 'Final results' : 'Current results'}
            </h4>
            <p className="text-muted-foreground">
              {record.responseCount} members responded · {record.voterCount}{' '}
              eligible at publication
              {record.activeVoterCount !== record.voterCount
                ? ` · ${record.activeVoterCount} still active`
                : ''}
            </p>
            {record.options.map((option) => (
              <div key={option.id} className="space-y-1">
                <p className="flex justify-between gap-3">
                  <span>{option.label}</span>
                  <strong>
                    {option.voteCount}{' '}
                    {option.voteCount === 1 ? 'vote' : 'votes'}
                  </strong>
                </p>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  aria-hidden="true"
                >
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${record.responseCount ? (option.voteCount / record.responseCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {record.allowMultiple && (
              <p className="text-xs text-muted-foreground">
                Members can select several choices, so option totals can exceed
                the number of respondents.
              </p>
            )}
          </div>
        </div>
      )}
    />
  );
}
