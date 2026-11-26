'use client';

import {
  CalendarDays,
  ChefHat,
  ChevronRight,
  UtensilsCrossed,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SuccessNotice } from '@/components/success-notice';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  createMeal,
  getMeal,
  getMeals,
  getMembers,
  type Household,
  type HouseholdMember,
  type MealDraft,
  type MealResponse,
  type MealRole,
  respondToMeal,
  setMealCookingRoles,
} from '@/lib/api';
import { useLeaveGuard } from '@/lib/pending-work';
import { useHouseRecords } from '@/lib/use-house-records';
import { RecordRefreshButton } from './communication-parts';
import { SavedDraftNotice, useSavedDraft } from './saved-draft';
import { WorkspaceLoading } from './workspace-loading';

function localNow(timezone: string, hoursAhead: number): string {
  const date = new Date(Date.now() + hoursAhead * 3_600_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}
function time(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}
function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

export function MealWorkspace({
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
  const [memberError, setMemberError] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(true);
  const membersRequest = useRef(0);
  const [filter, setFilter] = useState<'reply' | 'upcoming' | 'past'>(
    'upcoming',
  );
  const browser = useHouseRecords({
    token,
    householdId: household.id,
    scope: filter,
    loadPage: getMeals,
    getRecord: getMeal,
    focusedId,
    focusSignal,
  });
  const { records: meals, selected, open, close } = browser;
  const formRef = useRef<HTMLFormElement>(null);
  const handledCreate = useRef(0);
  const detailRef = useRef<HTMLDivElement>(null);
  const activeRow = useRef<HTMLButtonElement | null>(null);
  const filterRef = useRef<HTMLFieldSetElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingRoles, setEditingRoles] = useState(false);
  useLeaveGuard(showForm || editingRoles || saving);
  const [mealType, setMealType] = useState<MealDraft['mealType']>('dinner');
  const [question, setQuestion] = useState('Who is joining?');
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    localNow(household.timezone, 24),
  );
  const [responseDeadlineLocal, setResponseDeadlineLocal] = useState(() =>
    localNow(household.timezone, 20),
  );
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [draftRoles, setDraftRoles] = useState<MealRole[]>([]);
  const [roleMemberId, setRoleMemberId] = useState('');
  const [roleLabel, setRoleLabel] = useState('Cook');
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [roles, setRoles] = useState<MealRole[]>([]);
  const [detailRoleMemberId, setDetailRoleMemberId] = useState('');
  const [detailRoleLabel, setDetailRoleLabel] = useState('Cook');
  const selectedId = selected?.id;

  const savedDraft = useSavedDraft({
    kind: 'meal',
    enabled: showForm,
    value: {
      mealType,
      question,
      startsAtLocal,
      responseDeadlineLocal,
      participantIds,
      draftRoles,
      roleMemberId,
      roleLabel,
      idempotencyKey,
    },
    restore(snapshot) {
      setMealType(snapshot.mealType);
      setQuestion(snapshot.question);
      setStartsAtLocal(snapshot.startsAtLocal);
      setResponseDeadlineLocal(snapshot.responseDeadlineLocal);
      setParticipantIds(snapshot.participantIds);
      setDraftRoles(snapshot.draftRoles);
      setRoleMemberId(snapshot.roleMemberId);
      setRoleLabel(snapshot.roleLabel);
      setIdempotencyKey(snapshot.idempotencyKey);
      setShowForm(true);
    },
  });

  const loadMembers = useCallback(async () => {
    const request = ++membersRequest.current;
    setLoadingMembers(true);
    setMemberError('');
    try {
      const next = await getMembers(token, household.id);
      if (request !== membersRequest.current) return;
      setMembers(next);
      setParticipantIds((current) =>
        current.length
          ? current.filter((id) => next.some((member) => member.id === id))
          : next.map((member) => member.id),
      );
    } catch (failure) {
      if (request !== membersRequest.current) return;
      setMembers([]);
      setMemberError(message(failure));
    } finally {
      if (request === membersRequest.current) setLoadingMembers(false);
    }
  }, [token, household.id]);

  useEffect(() => {
    void loadMembers();
    return () => {
      membersRequest.current += 1;
    };
  }, [loadMembers]);

  useEffect(() => {
    if (!createRequest || createRequest === handledCreate.current) return;
    handledCreate.current = createRequest;
    if (editingRoles) {
      setError('Save or cancel the cooking roles before starting a new meal.');
      return;
    }
    setError('');
    if (!showForm) {
      setStartsAtLocal(localNow(household.timezone, 24));
      setResponseDeadlineLocal(localNow(household.timezone, 20));
    }
    setShowForm(true);
  }, [createRequest, editingRoles, household.timezone, showForm]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A new header request refocuses the current draft.
  useEffect(() => {
    if (!showForm) return;
    const form = formRef.current;
    form
      ?.querySelector<HTMLInputElement>('input[name="question"]')
      ?.focus({ preventScroll: true });
    form?.scrollIntoView({ block: 'start' });
  }, [createRequest, showForm]);

  useEffect(() => {
    setEditingRoles(false);
    if (selectedId && window.matchMedia('(max-width: 1023px)').matches) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [selectedId]);

  function closeDetail() {
    close();
    requestAnimationFrame(() => {
      const row = activeRow.current;
      const activeFilter = filterRef.current?.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      );
      (row?.isConnected ? row : activeFilter)?.focus();
    });
  }

  function resetForm() {
    setMealType('dinner');
    setQuestion('Who is joining?');
    setStartsAtLocal(localNow(household.timezone, 24));
    setResponseDeadlineLocal(localNow(household.timezone, 20));
    setParticipantIds(members.map((member) => member.id));
    setDraftRoles([]);
    setRoleMemberId('');
    setRoleLabel('Cook');
    setIdempotencyKey(crypto.randomUUID());
    setError('');
    setShowForm(false);
  }

  function editRoles() {
    if (!selected) return;
    setRoles(
      selected.cookingRoles.map(({ memberId, role }) => ({ memberId, role })),
    );
    setDetailRoleMemberId('');
    setDetailRoleLabel('Cook');
    setEditingRoles(true);
  }

  function toggleParticipant(id: string) {
    setParticipantIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    setDraftRoles((current) => current.filter((role) => role.memberId !== id));
  }
  function addRole(
    list: MealRole[],
    setList: (value: MealRole[]) => void,
    memberId: string,
    label: string,
  ) {
    const role = label.trim();
    if (!memberId || !role || role.length > 60) {
      setError('Choose a member and enter a role up to 60 characters.');
      return;
    }
    if (
      list.some(
        (item) =>
          item.memberId === memberId &&
          item.role.toLowerCase() === role.toLowerCase(),
      )
    ) {
      setError('That member already has this role.');
      return;
    }
    setError('');
    setList([...list, { memberId, role }]);
  }
  async function submitMeal(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!participantIds.length) {
      setError('Choose at least one participant.');
      return;
    }
    setSaving(true);
    try {
      const fields = {
        mealType,
        question,
        startsAtLocal,
        responseDeadlineLocal,
        participantIds,
        cookingRoles: draftRoles,
      };
      const meal = await createMeal(token, household.id, {
        ...fields,
        idempotencyKey: savedDraft.confirmationKey(fields, idempotencyKey),
      });
      savedDraft.clear();
      resetForm();
      browser.accept(meal);
      setNotice('Meal check published.');
      void browser.refresh(true);
      onHouseChanged();
    } catch (failure) {
      savedDraft.reject(failure);
      setError(message(failure));
    } finally {
      setSaving(false);
    }
  }
  async function answer(response: MealResponse) {
    if (!selected) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      browser.accept(
        await respondToMeal(token, household.id, selected.id, response),
      );
      setNotice('Your response was saved.');
      if (filter === 'reply') void browser.refresh(true);
      onHouseChanged();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setSaving(false);
    }
  }
  async function saveRoles() {
    if (!selected) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      browser.accept(
        await setMealCookingRoles(token, household.id, selected.id, roles),
      );
      setEditingRoles(false);
      setNotice('Cooking roles updated.');
    } catch (failure) {
      setError(message(failure));
    } finally {
      setSaving(false);
    }
  }
  const roleName = (id: string) =>
    members.find((member) => member.id === id)?.displayName ?? 'Member';
  const myResponse = selected?.participants.find(
    (person) => person.memberId === selected.viewerMemberId,
  )?.response;

  return (
    <div className="content-inner space-y-6">
      <SavedDraftNotice
        draft={savedDraft}
        disabled={saving}
        resumeDisabled={loadingMembers || !members.length}
      />
      {(browser.error || error) && (
        <p className="form-message error" role="alert">
          {error || browser.error}
        </p>
      )}
      {notice && (
        <SuccessNotice key={notice} className="form-message">
          {notice}
        </SuccessNotice>
      )}
      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>New meal check</CardTitle>
            <p className="text-sm text-muted-foreground">
              Times use {household.timezone}, your household timezone.
            </p>
          </CardHeader>
          <CardContent>
            <form
              id="new-meal"
              ref={formRef}
              onSubmit={submitMeal}
              className="scroll-mt-6 space-y-5"
            >
              <fieldset className="min-w-0 space-y-5" disabled={saving}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium">
                    Meal type
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={mealType}
                      onChange={(event) =>
                        setMealType(event.target.value as MealDraft['mealType'])
                      }
                    >
                      <option value="breakfast">Breakfast</option>
                      <option value="lunch">Lunch</option>
                      <option value="dinner">Dinner</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Question
                    <input
                      className="h-10 rounded-md border bg-background px-3"
                      name="question"
                      required
                      maxLength={240}
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Meal date and time · {household.timezone}
                    <input
                      className="h-10 rounded-md border bg-background px-3"
                      type="datetime-local"
                      required
                      value={startsAtLocal}
                      onChange={(event) => setStartsAtLocal(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Response deadline · {household.timezone}
                    <input
                      className="h-10 rounded-md border bg-background px-3"
                      type="datetime-local"
                      required
                      value={responseDeadlineLocal}
                      onChange={(event) =>
                        setResponseDeadlineLocal(event.target.value)
                      }
                    />
                  </label>
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">
                    Who can answer?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {members.map((member) => (
                      <label
                        key={member.id}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={participantIds.includes(member.id)}
                          onChange={() => toggleParticipant(member.id)}
                        />
                        {member.displayName}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <details className="space-y-3 rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Cooking roles (optional)
                    {draftRoles.length ? ` · ${draftRoles.length}` : ''}
                  </summary>
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="Member to assign"
                      className="h-10 rounded-md border bg-background px-3"
                      value={roleMemberId}
                      onChange={(event) => setRoleMemberId(event.target.value)}
                    >
                      <option value="">Choose member</option>
                      {members
                        .filter((member) => participantIds.includes(member.id))
                        .map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName}
                          </option>
                        ))}
                    </select>
                    <input
                      aria-label="Cooking role"
                      className="h-10 rounded-md border bg-background px-3"
                      maxLength={60}
                      value={roleLabel}
                      onChange={(event) => setRoleLabel(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        addRole(
                          draftRoles,
                          setDraftRoles,
                          roleMemberId,
                          roleLabel,
                        )
                      }
                    >
                      Add role
                    </Button>
                  </div>
                  {draftRoles.map((role, index) => (
                    <div
                      key={`${role.memberId}:${role.role}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <ChefHat size={15} />
                      {roleName(role.memberId)} · {role.role}
                      <button
                        type="button"
                        className="text-primary underline"
                        onClick={() =>
                          setDraftRoles(
                            draftRoles.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </details>
              </fieldset>
              {loadingMembers && <p role="status">Loading members…</p>}
              {memberError && (
                <p className="text-sm text-destructive" role="alert">
                  {memberError}{' '}
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => void loadMembers()}
                  >
                    Retry members
                  </Button>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  aria-label="Cancel meal draft"
                  onClick={() => {
                    savedDraft.clear();
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving || loadingMembers || !!memberError}
                >
                  {saving ? 'Publishing…' : 'Publish meal check'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <fieldset className="board-record-filters min-w-0" ref={filterRef}>
              <legend className="sr-only">Filter meal checks</legend>
              {(
                [
                  ['upcoming', 'Upcoming'],
                  ['reply', 'Reply needed'],
                  ['past', 'Past'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  disabled={saving || editingRoles}
                  variant={filter === key ? 'default' : 'outline'}
                  aria-pressed={filter === key}
                  onClick={() => {
                    activeRow.current = null;
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
              label="meals"
              loading={browser.loading || saving || editingRoles}
              onRefresh={() => void browser.refresh()}
            />
          </div>
          {browser.detailLoading && (
            <p role="status" className="text-sm text-muted-foreground">
              Opening meal…
            </p>
          )}
          {browser.loading && meals.length === 0 && !selected && (
            <WorkspaceLoading />
          )}
          {!browser.loading &&
            meals.length === 0 &&
            !selected &&
            !browser.error && (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                  <UtensilsCrossed
                    size={32}
                    className="text-primary"
                    aria-hidden="true"
                  />
                  <h3 className="font-heading text-lg">
                    {filter === 'reply'
                      ? 'No meals need your reply'
                      : filter === 'past'
                        ? 'No past meals'
                        : 'No upcoming meals'}
                  </h3>
                  {filter === 'upcoming' && (
                    <p className="text-sm text-muted-foreground">
                      Use New meal to ask who’s joining.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          {(meals.length > 0 || selected) && (
            <div
              className={
                selected && meals.length
                  ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]'
                  : 'space-y-4'
              }
            >
              {meals.length > 0 && (
                <Card className={selected ? 'max-lg:hidden' : undefined}>
                  <CardContent className="space-y-2">
                    {meals.map((meal) => {
                      const needsReply =
                        meal.canRespond &&
                        meal.participants.some(
                          (person) =>
                            person.memberId === meal.viewerMemberId &&
                            person.response === null,
                        );
                      return (
                        <button
                          key={meal.id}
                          type="button"
                          disabled={
                            saving || editingRoles || browser.detailLoading
                          }
                          aria-current={
                            selectedId === meal.id ? 'true' : undefined
                          }
                          onClick={(event) => {
                            activeRow.current = event.currentTarget;
                            setError('');
                            setNotice('');
                            void open(meal.id);
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:bg-muted/40 ${selectedId === meal.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                        >
                          <span className="design-item-icon green shrink-0">
                            <UtensilsCrossed size={18} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1 space-y-1">
                            <strong className="block break-words">
                              {meal.question}
                            </strong>
                            <span className="block text-xs text-muted-foreground">
                              <span className="capitalize">
                                {meal.mealType}
                              </span>{' '}
                              ·{' '}
                              <time dateTime={meal.startsAt}>
                                {time(meal.startsAt, meal.timezone)}
                              </time>
                            </span>
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span>{meal.counts.joining} joining</span>
                              {needsReply && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                                  Reply needed
                                </span>
                              )}
                            </span>
                          </span>
                          <ChevronRight
                            size={16}
                            className="shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                    {browser.hasMore && (
                      <Button
                        variant="outline"
                        onClick={() => void browser.loadMore()}
                        disabled={
                          browser.loadingMore || browser.loading || editingRoles
                        }
                      >
                        {browser.loadingMore ? 'Loading…' : 'Load more meals'}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
              {selected && (
                <Card ref={detailRef} tabIndex={-1} className="scroll-mt-6">
                  <CardHeader>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mb-2 self-start"
                      disabled={saving || editingRoles}
                      onClick={closeDetail}
                    >
                      Back to meals
                    </Button>
                    <span className="eyebrow">
                      {selected.mealType.toUpperCase()}
                    </span>
                    <CardTitle>{selected.question}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      <CalendarDays
                        size={15}
                        className="mr-1 inline"
                        aria-hidden="true"
                      />
                      {time(selected.startsAt, selected.timezone)} ·{' '}
                      {selected.timezone}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Answer by{' '}
                      {time(selected.responseDeadline, selected.timezone)} ·
                      Created by {selected.creatorDisplayName}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="rounded-xl bg-muted/40 p-4">
                      <h3 className="mb-2 font-semibold">Responses</h3>
                      <p className="text-sm">
                        {selected.counts.joining} joining ·{' '}
                        {selected.counts.notJoining} not joining ·{' '}
                        {selected.counts.maybe} maybe ·{' '}
                        {selected.counts.awaiting} waiting
                      </p>
                      <ul className="mt-3 divide-y text-sm">
                        {selected.participants.map((person) => (
                          <li
                            key={person.memberId}
                            className="flex justify-between gap-2 py-2"
                          >
                            <span>{person.displayName}</span>
                            <span className="text-muted-foreground">
                              {person.response?.replace('_', ' ') ??
                                'Awaiting answer'}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {selected.canRespond ? (
                        <fieldset
                          className="mt-3 flex flex-wrap gap-2"
                          disabled={saving || editingRoles}
                        >
                          <legend className="mb-2 text-sm font-medium">
                            Your reply
                          </legend>
                          {(
                            [
                              ['joining', 'Joining'],
                              ['not_joining', 'Not joining'],
                              ['maybe', 'Maybe'],
                            ] as const
                          ).map(([value, label]) => (
                            <Button
                              key={value}
                              type="button"
                              variant={
                                myResponse === value ? 'default' : 'outline'
                              }
                              aria-pressed={myResponse === value}
                              onClick={() => void answer(value)}
                            >
                              {label}
                            </Button>
                          ))}
                        </fieldset>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                          {new Date(selected.responseDeadline).getTime() <=
                          Date.now()
                            ? 'Responses are closed.'
                            : 'You are not selected to answer this meal check.'}
                        </p>
                      )}
                    </div>
                    <div className="space-y-3 border-t pt-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold">Cooking roles</h3>
                        {!editingRoles && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={saving || browser.detailLoading}
                            onClick={editRoles}
                          >
                            Edit cooking roles
                          </Button>
                        )}
                      </div>
                      {!editingRoles &&
                        (selected.cookingRoles.length ? (
                          <ul className="space-y-1 text-sm">
                            {selected.cookingRoles.map((role) => (
                              <li key={`${role.memberId}:${role.role}`}>
                                <ChefHat
                                  size={15}
                                  className="mr-2 inline"
                                  aria-hidden="true"
                                />
                                {role.displayName} · {role.role}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No cooking roles assigned yet.
                          </p>
                        ))}
                      {editingRoles && (
                        <fieldset
                          className="min-w-0 space-y-3"
                          disabled={saving}
                        >
                          <legend className="sr-only">
                            Edit cooking roles
                          </legend>
                          <div className="flex flex-wrap gap-2">
                            <select
                              aria-label="Member for cooking role"
                              className="h-10 rounded-md border bg-background px-3"
                              value={detailRoleMemberId}
                              onChange={(event) =>
                                setDetailRoleMemberId(event.target.value)
                              }
                            >
                              <option value="">Choose member</option>
                              {selected.participants.map((person) => (
                                <option
                                  key={person.memberId}
                                  value={person.memberId}
                                >
                                  {person.displayName}
                                </option>
                              ))}
                            </select>
                            <input
                              aria-label="Role name"
                              className="h-10 rounded-md border bg-background px-3"
                              maxLength={60}
                              value={detailRoleLabel}
                              onChange={(event) =>
                                setDetailRoleLabel(event.target.value)
                              }
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                addRole(
                                  roles,
                                  setRoles,
                                  detailRoleMemberId,
                                  detailRoleLabel,
                                )
                              }
                            >
                              Add role
                            </Button>
                          </div>
                          {roles.map((role, index) => (
                            <div
                              key={`${role.memberId}:${role.role}`}
                              className="flex items-center gap-2 text-sm"
                            >
                              {roleName(role.memberId)} · {role.role}
                              <button
                                type="button"
                                className="text-primary underline"
                                onClick={() =>
                                  setRoles(roles.filter((_, i) => i !== index))
                                }
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setEditingRoles(false);
                                setError('');
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={() => void saveRoles()}
                            >
                              {saving ? 'Saving…' : 'Save cooking roles'}
                            </Button>
                          </div>
                        </fieldset>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
