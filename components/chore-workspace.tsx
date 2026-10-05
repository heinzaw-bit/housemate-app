'use client';

import { ClipboardList, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
import { SavedDraftNotice, useSavedDraft } from './saved-draft';

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
  const [chores, setChores] = useState<Chore[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<
    'swaps' | 'assigned' | 'upcoming' | 'overdue' | 'closed'
  >('assigned');
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  useLeaveGuard(formOpen);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [dueAtLocal, setDueAtLocal] = useState(() =>
    tomorrow(household.timezone),
  );
  const [assigneeId, setAssigneeId] = useState('');
  const [skipReason, setSkipReason] = useState('');
  const [swapTargetId, setSwapTargetId] = useState('');
  const [reassignId, setReassignId] = useState('');
  const selected = chores.find((chore) => chore.id === selectedId) ?? null;

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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    setLoadFailed(false);
    try {
      const [nextChores, nextMembers] = await Promise.all([
        getChores(token, household.id),
        getMembers(token, household.id),
      ]);
      setChores((current) => [
        ...nextChores,
        ...current.filter(
          (chore) =>
            chore.id === focusedId &&
            !nextChores.some((next) => next.id === chore.id),
        ),
      ]);
      setMembers(nextMembers);
      setHasMore(nextChores.length === 50);
      setSelectedId((current) =>
        current &&
        (current === focusedId ||
          nextChores.some((chore) => chore.id === current))
          ? current
          : (nextChores.find(
              (chore) =>
                chore.status === 'open' &&
                chore.assigneeMemberId === chore.viewerMemberId,
            )?.id ?? ''),
      );
      setAssigneeId((current) => current || nextMembers[0]?.id || '');
    } catch (failure) {
      setChores([]);
      setMembers([]);
      setLoadFailed(true);
      setError(errorText(failure));
    } finally {
      setLoading(false);
    }
  }, [household.id, token, focusedId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (createRequest) setFormOpen(true);
  }, [createRequest]);
  useEffect(() => {
    if (!focusedId || !focusSignal) return;
    let active = true;
    void getChore(token, household.id, focusedId).then(
      (chore) => {
        if (!active) return;
        setChores((current) => [
          chore,
          ...current.filter((item) => item.id !== chore.id),
        ]);
        setSelectedId(chore.id);
        setFilter(
          chore.pendingSwap?.canRespond
            ? 'swaps'
            : chore.status !== 'open'
              ? 'closed'
              : chore.assigneeMemberId === chore.viewerMemberId
                ? 'assigned'
                : new Date(chore.dueAt).getTime() < Date.now()
                  ? 'overdue'
                  : 'upcoming',
        );
        setDetailOpen(true);
      },
      (failure) => {
        if (active) setError(errorText(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [focusedId, focusSignal, household.id, token]);

  function replaceChore(chore: Chore) {
    setChores((current) =>
      current.map((item) => (item.id === chore.id ? chore : item)),
    );
  }
  async function runAction(action: () => Promise<Chore>, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await action();
      replaceChore(updated);
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
          replaceChore(await getChore(token, household.id, selected.id));
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
      setChores((current) => [created, ...current]);
      savedDraft.clear();
      setSelectedId(created.id);
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
  async function loadMore() {
    setLoadingMore(true);
    setError('');
    try {
      const next = await getChores(token, household.id, 50, chores.length);
      setChores((current) => [
        ...current,
        ...next.filter((item) => !current.some((old) => old.id === item.id)),
      ]);
      setHasMore(next.length === 50);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setLoadingMore(false);
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
        resumeDisabled={loading || loadFailed}
      />
      <div>
        <h2 className="text-xl font-semibold">Chores</h2>
        <p className="text-sm text-muted-foreground">
          Your assignments, swap requests, and household work.
        </p>
      </div>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <SuccessNotice key={notice} className="form-message success">
          {notice}
        </SuccessNotice>
      )}
      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle>New chore</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void submit(event)}
              className="grid gap-4 sm:grid-cols-2"
            >
              <label htmlFor="chore-title" className="space-y-1 sm:col-span-2">
                <span>Chore name</span>
                <Input
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
              <Button type="submit" disabled={busy || loading}>
                {busy ? 'Saving…' : 'Create chore'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  savedDraft.clear();
                  setFormOpen(false);
                }}
              >
                Close
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Filter chores</legend>
          {(
            ['swaps', 'assigned', 'overdue', 'upcoming', 'closed'] as const
          ).map((key) => (
            <Button
              key={key}
              variant={filter === key ? 'default' : 'outline'}
              aria-pressed={filter === key}
              onClick={() => {
                setFilter(key);
                setSelectedId(groups[key][0]?.id ?? '');
                setDetailOpen(false);
              }}
            >
              {key === 'swaps'
                ? 'Swap requests'
                : key === 'assigned'
                  ? 'Assigned to me'
                  : key === 'closed'
                    ? 'History'
                    : key[0].toUpperCase() + key.slice(1)}
            </Button>
          ))}
        </fieldset>
        <Button
          variant="outline"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </Button>
      </div>
      {loading ? (
        <p role="status">Loading chores…</p>
      ) : loadFailed ? null : visible.length === 0 ? (
        <Card className="p-6 text-center">
          <ClipboardList className="mx-auto mb-2" aria-hidden="true" />
          <p>
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
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div className={`space-y-2 ${detailOpen ? 'max-lg:hidden' : ''}`}>
            {visible.map((chore) => (
              <button
                key={chore.id}
                type="button"
                onClick={() => {
                  setSelectedId(chore.id);
                  setDetailOpen(true);
                  setError('');
                  setNotice('');
                }}
                className={`w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/40 ${selectedId === chore.id ? 'border-primary bg-muted/30' : ''}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <strong>{chore.title}</strong>
                  <Badge variant="outline">{chore.status}</Badge>
                </span>
                <span className="mt-2 block text-sm text-muted-foreground">
                  {chore.assigneeDisplayName} · Due {dueLabel(chore)}
                </span>
                {chore.pendingSwap && (
                  <span className="mt-1 block text-sm">
                    Swap requested with {chore.pendingSwap.targetDisplayName}
                  </span>
                )}
              </button>
            ))}
          </div>
          {selected && (
            <Card className={detailOpen ? '' : 'max-lg:hidden'}>
              <CardHeader>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-2 self-start lg:hidden"
                  onClick={() => setDetailOpen(false)}
                >
                  Back to chores
                </Button>
                <CardTitle>{selected.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  Assigned to <strong>{selected.assigneeDisplayName}</strong>
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
                          disabled={busy}
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
                          disabled={busy || !skipReason.trim()}
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
                          {selected.pendingSwap.requestedByDisplayName} asked{' '}
                          {selected.pendingSwap.targetDisplayName} to take this
                          chore.
                        </p>
                        {selected.pendingSwap.canRespond && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={busy}
                              onClick={() => answerSwap('accepted')}
                            >
                              Accept swap
                            </Button>
                            <Button
                              variant="outline"
                              disabled={busy}
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
                          disabled={busy || !swapTargetId}
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
                          disabled={busy || !reassignId}
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
                    {selected.status === 'completed' ? 'Completed' : 'Skipped'}{' '}
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
      {hasMore && !loadFailed && (
        <Button
          variant="outline"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className={detailOpen ? 'max-lg:hidden' : ''}
        >
          {loadingMore ? 'Loading…' : 'Load more chores'}
        </Button>
      )}
    </div>
  );
}
