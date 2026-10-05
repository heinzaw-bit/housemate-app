'use client';

import {
  CalendarDays,
  ChefHat,
  RefreshCw,
  UtensilsCrossed,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  type Meal,
  type MealDraft,
  type MealResponse,
  type MealRole,
  respondToMeal,
  setMealCookingRoles,
} from '@/lib/api';
import { useLeaveGuard } from '@/lib/pending-work';
import { SavedDraftNotice, useSavedDraft } from './saved-draft';

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
  refreshSignal = 0,
  onHouseChanged = () => {},
}: {
  household: Household;
  token: string;
  focusedId?: string;
  focusSignal?: number;
  createRequest?: number;
  refreshSignal?: number;
  onHouseChanged?: () => void;
}) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<'reply' | 'upcoming' | 'past'>(
    'upcoming',
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [rawOffset, setRawOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestNumber = useRef(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  useLeaveGuard(showForm);
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
  const selected = meals.find((meal) => meal.id === selectedId) ?? null;

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

  async function refresh() {
    const request = ++requestNumber.current;
    setLoading(true);
    setError('');
    try {
      const [nextMeals, nextMembers] = await Promise.all([
        getMeals(token, household.id, filter),
        getMembers(token, household.id),
      ]);
      if (request !== requestNumber.current) return;
      setMeals((current) => [
        ...nextMeals,
        ...current.filter((item) => {
          if (
            item.id !== focusedId ||
            nextMeals.some((next) => next.id === item.id)
          )
            return false;
          const starts = new Date(item.startsAt).getTime();
          return filter === 'upcoming'
            ? starts >= Date.now()
            : filter === 'past' && starts < Date.now();
        }),
      ]);
      setRawOffset(nextMeals.length);
      setHasMore(nextMeals.length === 50);
      setMembers(nextMembers);
      setSelectedId((current) =>
        current && nextMeals.some((item) => item.id === current)
          ? current
          : focusedId && filter !== 'reply'
            ? focusedId
            : (nextMeals[0]?.id ?? ''),
      );
      setParticipantIds((current) =>
        current.length ? current : nextMembers.map((member) => member.id),
      );
    } catch (failure) {
      if (request !== requestNumber.current) return;
      setMeals([]);
      setMembers([]);
      setError(message(failure));
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is recreated each render; these inputs select the page to fetch.
  useEffect(() => {
    void refresh();
    return () => {
      requestNumber.current += 1;
    };
  }, [token, household.id, filter]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A successful reply requests one fresh list read.
  useEffect(() => {
    if (refreshSignal) void refresh();
  }, [refreshSignal]);
  useEffect(() => {
    if (createRequest) setShowForm(true);
  }, [createRequest]);
  useEffect(() => {
    if (!focusedId || !focusSignal) return;
    let active = true;
    void getMeal(token, household.id, focusedId).then(
      (meal) => {
        if (!active) return;
        setMeals((current) => [
          meal,
          ...current.filter((item) => item.id !== meal.id),
        ]);
        setSelectedId(meal.id);
        setFilter(
          new Date(meal.startsAt).getTime() < Date.now() ? 'past' : 'upcoming',
        );
        setDetailOpen(true);
      },
      (failure) => {
        if (active) setError(message(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [focusedId, focusSignal, household.id, token]);
  useEffect(() => {
    setRoles(
      selected?.cookingRoles.map(({ memberId, role }) => ({
        memberId,
        role,
      })) ?? [],
    );
  }, [selected?.cookingRoles]);

  function updateMeal(meal: Meal) {
    setMeals((current) =>
      current.map((item) => (item.id === meal.id ? meal : item)),
    );
  }
  async function loadMore() {
    const request = requestNumber.current;
    setLoadingMore(true);
    setError('');
    try {
      const next = await getMeals(token, household.id, filter, 50, rawOffset);
      if (request !== requestNumber.current) return;
      setMeals((current) => [
        ...current,
        ...next.filter((meal) => !current.some((old) => old.id === meal.id)),
      ]);
      setRawOffset((current) => current + next.length);
      setHasMore(next.length === 50);
    } catch (failure) {
      if (request === requestNumber.current) setError(message(failure));
    } finally {
      setLoadingMore(false);
    }
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
      setMeals((current) => [
        meal,
        ...current.filter((item) => item.id !== meal.id),
      ]);
      setSelectedId(meal.id);
      setShowForm(false);
      setNotice('Meal check published.');
      setFilter('upcoming');
      onHouseChanged();
      setIdempotencyKey(crypto.randomUUID());
      setDraftRoles([]);
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
      updateMeal(
        await respondToMeal(token, household.id, selected.id, response),
      );
      setNotice('Your response was saved.');
      if (filter === 'reply') void refresh();
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
      updateMeal(
        await setMealCookingRoles(token, household.id, selected.id, roles),
      );
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
  const now = Date.now();
  const visible = meals;

  return (
    <div className="content-inner space-y-6">
      <SavedDraftNotice
        draft={savedDraft}
        disabled={saving}
        resumeDisabled={loading || !members.length}
      />
      <div>
        <h2 className="text-xl font-semibold">Meals</h2>
        <p className="text-sm text-muted-foreground">
          Reply to meal checks and see who is cooking.
        </p>
      </div>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <SuccessNotice key={notice} className="form-message">
          {notice}
        </SuccessNotice>
      )}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create a meal check</CardTitle>
            <p className="text-sm text-muted-foreground">
              Times use {household.timezone}, your household timezone.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitMeal} className="space-y-5">
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
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Cooking roles (optional)
                </h3>
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
                        setDraftRoles(draftRoles.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <Button type="submit" disabled={saving || loading}>
                {saving ? 'Publishing…' : 'Publish meal check'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  savedDraft.clear();
                  setShowForm(false);
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
          <legend className="sr-only">Filter meal checks</legend>
          {(['reply', 'upcoming', 'past'] as const).map((key) => (
            <Button
              key={key}
              variant={filter === key ? 'default' : 'outline'}
              aria-pressed={filter === key}
              onClick={() => {
                setFilter(key);
                setSelectedId('');
                setDetailOpen(false);
              }}
            >
              {key === 'reply'
                ? 'Reply needed'
                : key === 'past'
                  ? 'Past'
                  : 'Upcoming'}
            </Button>
          ))}
        </fieldset>
        <Button
          variant="outline"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw size={16} /> Refresh
        </Button>
      </div>
      {loading ? (
        <p role="status">Loading meals…</p>
      ) : visible.length === 0 ? (
        <Card className="p-6 text-center">
          <UtensilsCrossed className="mx-auto mb-2" />
          <p>
            {filter === 'reply'
              ? 'No meal checks need your reply.'
              : filter === 'past'
                ? 'No past meal checks.'
                : 'No upcoming meal checks.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className={`space-y-2 ${detailOpen ? 'max-lg:hidden' : ''}`}>
            {visible.map((meal) => (
              <button
                key={meal.id}
                type="button"
                onClick={() => {
                  setSelectedId(meal.id);
                  setDetailOpen(true);
                  setError('');
                  setNotice('');
                }}
                className={`w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/40 ${selectedId === meal.id ? 'border-primary bg-muted/30' : ''}`}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {meal.mealType}
                </span>
                <strong className="mt-1 block">{meal.question}</strong>
                <span className="mt-2 block text-sm text-muted-foreground">
                  {time(meal.startsAt, meal.timezone)}
                </span>
                {new Date(meal.responseDeadline).getTime() > now && (
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Answer by {time(meal.responseDeadline, meal.timezone)}
                  </span>
                )}
                <span className="mt-1 block text-sm">
                  {meal.counts.joining} joining · {meal.counts.maybe} maybe
                </span>
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
                  Back to meals
                </Button>
                <span className="eyebrow">
                  {selected.mealType.toUpperCase()}
                </span>
                <CardTitle>{selected.question}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  <CalendarDays size={15} className="mr-1 inline" />
                  {time(selected.startsAt, selected.timezone)} ·{' '}
                  {selected.timezone}
                </p>
                <p className="text-sm text-muted-foreground">
                  Answer by {time(selected.responseDeadline, selected.timezone)}{' '}
                  · Created by {selected.creatorDisplayName}
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="mb-2 font-semibold">Responses</h3>
                  <p className="text-sm">
                    {selected.counts.joining} joining ·{' '}
                    {selected.counts.notJoining} not joining ·{' '}
                    {selected.counts.maybe} maybe · {selected.counts.awaiting}{' '}
                    waiting
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
                    <div className="mt-3 flex flex-wrap gap-2">
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
                          variant={myResponse === value ? 'default' : 'outline'}
                          aria-pressed={myResponse === value}
                          disabled={saving}
                          onClick={() => void answer(value)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
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
                  <h3 className="font-semibold">Who is cooking?</h3>
                  {selected.cookingRoles.length ? (
                    <ul className="space-y-1 text-sm">
                      {selected.cookingRoles.map((role) => (
                        <li key={`${role.memberId}:${role.role}`}>
                          <ChefHat size={15} className="mr-2 inline" />
                          {role.displayName} · {role.role}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No cooking roles assigned yet.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Any active member can update the cooking plan. Choose from
                    selected participants.
                  </p>
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
                        <option key={person.memberId} value={person.memberId}>
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
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveRoles()}
                  >
                    {saving ? 'Saving…' : 'Save cooking roles'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {hasMore && !loading && (
        <Button
          variant="outline"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className={detailOpen ? 'max-lg:hidden' : ''}
        >
          {loadingMore ? 'Loading…' : 'Load more meal checks'}
        </Button>
      )}
    </div>
  );
}
