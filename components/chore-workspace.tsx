'use client';

import { ClipboardList } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SuccessNotice } from '@/components/success-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ApiRequestError,
  type Chore,
  type ChoreDraft,
  completeChore,
  createChore,
  getChore,
  getChores,
  getMembers,
  type Household,
  type HouseholdMember,
  reassignChore,
  requestChoreSwap,
  respondToChoreSwap,
  skipChore,
} from '@/lib/api';
import { useLeaveGuard } from '@/lib/pending-work';
import { useHouseRecords } from '@/lib/use-house-records';
import { RecordRefreshButton } from './communication-parts';
import { HouseTaskRow, useHouseTaskFocus } from './house-task-list';
import { SavedDraftNotice, useSavedDraft } from './saved-draft';
import { WorkspaceLoading } from './workspace-loading';

function tomorrow(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + 24 * 3_600_000));
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}
function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Could not update this chore.';
}
function dueLabel(chore: Chore): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: chore.timezone,
  }).format(new Date(chore.dueAt));
}
const fieldClass =
  'w-full rounded-2xl border border-transparent bg-input/50 px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

function loadPage(
  token: string,
  householdId: string,
  _scope: 'all',
  limit: number,
  offset: number,
) {
  return getChores(token, householdId, limit, offset);
}

export function ChoreWorkspace({
  household,
  token,
  focusedId = '',
  focusSignal = 0,
  createRequest = 0,
  onHouseChanged = () => {},
}: {
  household: Household;
  token: string;
  focusedId?: string;
  focusSignal?: number;
  createRequest?: number;
  onHouseChanged?: () => void;
}) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [filter, setFilter] = useState<
    'swaps' | 'assigned' | 'upcoming' | 'overdue' | 'closed'
  >('assigned');
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [memberError, setMemberError] = useState('');
  const memberRequest = useRef(0);
  const handledCreate = useRef(0);
  const handledLink = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  useLeaveGuard(formOpen || busy);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [dueAtLocal, setDueAtLocal] = useState(() =>
    tomorrow(household.timezone),
  );
  const [assigneeId, setAssigneeId] = useState('');
  const [skipReason, setSkipReason] = useState('');
  const [swapTargetId, setSwapTargetId] = useState('');
  const [reassignId, setReassignId] = useState('');
  const browser = useHouseRecords({
    token,
    householdId: household.id,
    scope: 'all',
    loadPage,
    getRecord: getChore,
    focusedId,
    focusSignal,
    pauseRefresh: formOpen || busy,
  });
  const {
    records: chores,
    selected,
    loading,
    hasMore,
    loadingMore,
    open,
    close,
    accept,
  } = browser;
  const focus = useHouseTaskFocus(formOpen, createRequest, selected?.id);
  const selectedId = selected?.id;

  const savedDraft = useSavedDraft({
    kind: 'chore',
    enabled: formOpen,
    value: { title, note, dueAtLocal, assigneeId },
    restore(snapshot) {
      setTitle(snapshot.title);
      setNote(snapshot.note);
      setDueAtLocal(snapshot.dueAtLocal);
      setAssigneeId(snapshot.assigneeId);
      setFormOpen(true);
    },
  });

  const loadMembers = useCallback(async () => {
    const request = ++memberRequest.current;
    setLoadingMembers(true);
    setMemberError('');
    try {
      const next = await getMembers(token, household.id);
      if (request !== memberRequest.current) return;
      setMembers(next);
      setAssigneeId((current) => current || next[0]?.id || '');
    } catch (failure) {
      if (request !== memberRequest.current) return;
      setMembers([]);
      setMemberError(errorText(failure));
    } finally {
      if (request === memberRequest.current) setLoadingMembers(false);
    }
  }, [token, household.id]);

  useEffect(() => {
    void loadMembers();
    return () => {
      memberRequest.current += 1;
    };
  }, [loadMembers]);

  useEffect(() => {
    if (!createRequest || createRequest === handledCreate.current) return;
    handledCreate.current = createRequest;
    if (busy || formOpen) return;
    setTitle('');
    setNote('');
    setDueAtLocal(tomorrow(household.timezone));
    setAssigneeId(members[0]?.id ?? '');
    setError('');
    setNotice('');
    setFormOpen(true);
  }, [createRequest, busy, formOpen, household.timezone, members]);

  useEffect(() => {
    if (
      !focusSignal ||
      handledLink.current === focusSignal ||
      selected?.id !== focusedId ||
      !selected
    )
      return;
    handledLink.current = focusSignal;
    setFilter(
      selected.pendingSwap?.canRespond
        ? 'swaps'
        : selected.status !== 'open'
          ? 'closed'
          : selected.assigneeMemberId === selected.viewerMemberId
            ? 'assigned'
            : new Date(selected.dueAt).getTime() < Date.now()
              ? 'overdue'
              : 'upcoming',
    );
  }, [focusedId, focusSignal, selected]);

  async function runAction(action: () => Promise<Chore>, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await action();
      accept(updated);
      onHouseChanged();
      if (updated.status !== 'open') setFilter('closed');
      else if (
        filter === 'assigned' &&
        updated.assigneeMemberId !== updated.viewerMemberId
      )
        setFilter(
          new Date(updated.dueAt).getTime() < Date.now()
            ? 'overdue'
            : 'upcoming',
        );
      setNotice(success);
      setSkipReason('');
      setSwapTargetId('');
      setReassignId('');
    } catch (failure) {
      if (
        failure instanceof ApiRequestError &&
        failure.code === 'STALE_CHORE' &&
        selected
      ) {
        try {
          accept(await getChore(token, household.id, selected.id));
        } catch {
          /* Keep the original error. */
        }
      }
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!assigneeId) {
      setError('Choose an assignee.');
      return;
    }
    const draft: ChoreDraft = {
      title: title.trim(),
      note: note.trim() || null,
      dueAtLocal,
      assigneeMemberId: assigneeId,
    };
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await createChore(
        token,
        household.id,
        draft,
        savedDraft.confirmationKey(draft),
      );
      accept(created);
      void browser.refresh(true);
      savedDraft.clear();
      setFilter('upcoming');
      setTitle('');
      setNote('');
      setDueAtLocal(tomorrow(household.timezone));
      setFormOpen(false);
      setNotice('Chore created.');
      onHouseChanged();
    } catch (failure) {
      savedDraft.reject(failure);
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  function answerSwap(decision: 'accepted' | 'declined') {
    if (!selected?.pendingSwap) return;
    const { id, revision, pendingSwap } = selected;
    void runAction(
      () =>
        respondToChoreSwap(
          token,
          household.id,
          id,
          pendingSwap.id,
          revision,
          decision,
        ),
      decision === 'accepted'
        ? 'Swap accepted. This chore is assigned to you.'
        : 'Swap declined.',
    );
  }

  const now = Date.now();
  const groups = {
    swaps: chores.filter(
      (chore) => chore.status === 'open' && chore.pendingSwap?.canRespond,
    ),
    assigned: chores.filter(
      (chore) =>
        chore.status === 'open' &&
        chore.assigneeMemberId === chore.viewerMemberId,
    ),
    upcoming: chores.filter(
      (chore) =>
        chore.status === 'open' && new Date(chore.dueAt).getTime() >= now,
    ),
    overdue: chores.filter(
      (chore) =>
        chore.status === 'open' && new Date(chore.dueAt).getTime() < now,
    ),
    closed: chores.filter((chore) => chore.status !== 'open'),
  };
  const visible = groups[filter];
  const otherMembers = members.filter(
    (member) => member.id !== selected?.assigneeMemberId,
  );
  return (
    <div className="content-inner space-y-6">
      <SavedDraftNotice
        draft={savedDraft}
        disabled={busy}
        resumeDisabled={loadingMembers || !members.length}
      />
      {(error || browser.error) && (
        <p role="alert" className="form-message error">
          {error || browser.error}
        </p>
      )}
      {memberError && (
        <p role="alert" className="form-message error">
          {memberError}{' '}
          <Button
            type="button"
            variant="link"
            disabled={loadingMembers}
            onClick={() => void loadMembers()}
          >
            Retry members
          </Button>
        </p>
      )}
      {notice && (
        <SuccessNotice key={notice} className="form-message success">
          {notice}
        </SuccessNotice>
      )}
      {formOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>New chore</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void submit(event)}
              className="scroll-mt-6 space-y-4"
            >
              <fieldset
                disabled={busy}
                className="grid min-w-0 gap-4 sm:grid-cols-2"
              >
                <label
                  htmlFor="chore-title"
                  className="space-y-1 sm:col-span-2"
                >
                  <span>Chore name</span>
                  <Input
                    ref={focus.name}
                    id="chore-title"
                    required
                    maxLength={160}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label htmlFor="chore-due" className="space-y-1">
                  <span>Due date and time · {household.timezone}</span>
                  <Input
                    id="chore-due"
                    type="datetime-local"
                    required
                    value={dueAtLocal}
                    onChange={(event) => setDueAtLocal(event.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span>Assign to</span>
                  <select
                    className={fieldClass}
                    required
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  >
                    <option value="">Choose a member</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span>Note (optional)</span>
                  <textarea
                    className={`${fieldClass} min-h-24`}
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={busy || loadingMembers || !members.length}
                >
                  {busy ? 'Saving…' : 'Create chore'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    savedDraft.clear();
                    setFormOpen(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <fieldset
              className="board-record-filters min-w-0"
              ref={focus.filters}
            >
              <legend className="sr-only">Filter chores</legend>
              {(
                [
                  ['assigned', 'Assigned to me'],
                  ['upcoming', 'Upcoming'],
                  ['overdue', 'Overdue'],
                  ['swaps', 'Swap requests'],
                  ['closed', 'History'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  disabled={busy}
                  variant={filter === key ? 'default' : 'outline'}
                  aria-pressed={filter === key}
                  onClick={() => {
                    focus.row.current = null;
                    setError('');
                    setNotice('');
                    close();
                    setFilter(key);
                  }}
                >
                  {label}
                </Button>
              ))}
            </fieldset>
            <RecordRefreshButton
              label="chores"
              loading={loading || busy}
              onRefresh={() => {
                setError('');
                void browser.refresh();
                void loadMembers();
              }}
            />
          </div>
          {browser.detailLoading && (
            <p role="status" className="text-sm text-muted-foreground">
              Opening chore…
            </p>
          )}
          {loading && visible.length === 0 && !selected && <WorkspaceLoading />}
          {!loading && visible.length === 0 && !selected && !browser.error && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <ClipboardList
                  size={32}
                  className="text-primary"
                  aria-hidden="true"
                />
                <p className="font-heading text-lg">
                  {filter === 'swaps'
                    ? 'No swap requests waiting for you.'
                    : filter === 'assigned'
                      ? 'No open chores assigned to you.'
                      : filter === 'upcoming'
                        ? 'No upcoming chores.'
                        : filter === 'overdue'
                          ? 'Nothing overdue.'
                          : 'No completed or skipped chores yet.'}
                </p>
              </CardContent>
            </Card>
          )}
          {(visible.length > 0 || selected) && (
            <div
              className={
                selected && visible.length
                  ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]'
                  : 'space-y-4'
              }
            >
              {visible.length > 0 && (
                <Card className={selected ? 'max-lg:hidden' : undefined}>
                  <CardContent className="space-y-2">
                    {visible.map((chore) => (
                      <HouseTaskRow
                        key={chore.id}
                        title={chore.title}
                        status={chore.status}
                        icon={ClipboardList}
                        tone="blue"
                        active={selectedId === chore.id}
                        disabled={busy}
                        onClick={(event) => {
                          focus.row.current = event.currentTarget;
                          setError('');
                          setNotice('');
                          setSkipReason('');
                          setSwapTargetId('');
                          setReassignId('');
                          void open(chore.id);
                        }}
                      >
                        {chore.assigneeDisplayName} · Due{' '}
                        <time dateTime={chore.dueAt}>{dueLabel(chore)}</time>
                        {chore.pendingSwap?.canRespond
                          ? ' · Swap reply needed'
                          : chore.pendingSwap
                            ? ' · Swap requested'
                            : ''}
                      </HouseTaskRow>
                    ))}
                  </CardContent>
                </Card>
              )}
              {selected && (
                <Card ref={focus.detail} tabIndex={-1} className="scroll-mt-6">
                  <CardHeader>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mb-2 self-start"
                      disabled={busy}
                      onClick={() => focus.back(close)}
                    >
                      Back to chores
                    </Button>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{selected.title}</CardTitle>
                      <Badge variant="outline" className="capitalize">
                        {selected.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p>
                      Assigned to{' '}
                      <strong>{selected.assigneeDisplayName}</strong>
                    </p>
                    <p>
                      Due {dueLabel(selected)} · {selected.timezone}
                    </p>
                    {selected.note && (
                      <p className="whitespace-pre-wrap">{selected.note}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Created by {selected.createdByDisplayName}
                    </p>
                    {selected.status === 'open' && (
                      <>
                        {selected.canComplete && (
                          <div className="space-y-3 border-t pt-4">
                            <Button
                              disabled={busy || browser.detailLoading}
                              onClick={() =>
                                void runAction(
                                  () =>
                                    completeChore(
                                      token,
                                      household.id,
                                      selected.id,
                                      selected.revision,
                                    ),
                                  'Chore completed.',
                                )
                              }
                            >
                              Mark complete
                            </Button>
                            <label className="block space-y-1">
                              <span>Reason to skip</span>
                              <textarea
                                className={`${fieldClass} min-h-20`}
                                maxLength={500}
                                value={skipReason}
                                onChange={(event) =>
                                  setSkipReason(event.target.value)
                                }
                              />
                            </label>
                            <Button
                              variant="outline"
                              disabled={
                                busy ||
                                browser.detailLoading ||
                                !skipReason.trim()
                              }
                              onClick={() =>
                                void runAction(
                                  () =>
                                    skipChore(
                                      token,
                                      household.id,
                                      selected.id,
                                      selected.revision,
                                      skipReason,
                                    ),
                                  'Chore skipped.',
                                )
                              }
                            >
                              Skip chore
                            </Button>
                          </div>
                        )}
                        {selected.pendingSwap && (
                          <div className="space-y-2 border-t pt-4">
                            <p>
                              {selected.pendingSwap.requestedByDisplayName}{' '}
                              asked {selected.pendingSwap.targetDisplayName} to
                              take this chore.
                            </p>
                            {selected.pendingSwap.canRespond && (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  disabled={busy || browser.detailLoading}
                                  onClick={() => answerSwap('accepted')}
                                >
                                  Accept swap
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={busy || browser.detailLoading}
                                  onClick={() => answerSwap('declined')}
                                >
                                  Decline
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                        {selected.canRequestSwap && (
                          <div className="space-y-2 border-t pt-4">
                            <label className="block space-y-1">
                              <span>Ask someone to take this chore</span>
                              <select
                                className={fieldClass}
                                value={swapTargetId}
                                onChange={(event) =>
                                  setSwapTargetId(event.target.value)
                                }
                              >
                                <option value="">Choose a member</option>
                                {otherMembers.map((member) => (
                                  <option key={member.id} value={member.id}>
                                    {member.displayName}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <Button
                              variant="outline"
                              disabled={
                                busy || browser.detailLoading || !swapTargetId
                              }
                              onClick={() =>
                                void runAction(
                                  () =>
                                    requestChoreSwap(
                                      token,
                                      household.id,
                                      selected.id,
                                      selected.revision,
                                      swapTargetId,
                                    ),
                                  'Swap request sent.',
                                )
                              }
                            >
                              Request swap
                            </Button>
                          </div>
                        )}
                        {selected.canManage && (
                          <div className="space-y-2 border-t pt-4">
                            <label className="block space-y-1">
                              <span>Reassign as owner or admin</span>
                              <select
                                className={fieldClass}
                                value={reassignId}
                                onChange={(event) =>
                                  setReassignId(event.target.value)
                                }
                              >
                                <option value="">Choose a member</option>
                                {otherMembers.map((member) => (
                                  <option key={member.id} value={member.id}>
                                    {member.displayName}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <Button
                              variant="outline"
                              disabled={
                                busy || browser.detailLoading || !reassignId
                              }
                              onClick={() =>
                                void runAction(
                                  () =>
                                    reassignChore(
                                      token,
                                      household.id,
                                      selected.id,
                                      reassignId,
                                      selected.revision,
                                    ),
                                  'Chore reassigned.',
                                )
                              }
                            >
                              Reassign
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                    {selected.status !== 'open' && (
                      <p className="border-t pt-4">
                        {selected.status === 'completed'
                          ? 'Completed'
                          : 'Skipped'}{' '}
                        by {selected.closedByDisplayName}
                        {selected.closedAt
                          ? ` on ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: selected.timezone }).format(new Date(selected.closedAt))}`
                          : ''}
                        .
                        {selected.skipReason && (
                          <span className="mt-2 block">
                            Reason: {selected.skipReason}
                          </span>
                        )}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          {hasMore && !loading && (
            <Button
              variant="outline"
              onClick={() => void browser.loadMore()}
              disabled={loadingMore || busy}
              className={selected ? 'max-lg:hidden' : undefined}
            >
              {loadingMore ? 'Loading…' : 'Load more chores'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
