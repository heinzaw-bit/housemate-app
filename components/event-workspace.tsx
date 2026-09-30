'use client';

import { CalendarDays, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  createEvent,
  type EventDraft,
  type EventResponse,
  getEvent,
  getEvents,
  type Household,
  type HouseholdEvent,
  respondToEvent,
} from '@/lib/api';
import { useLeaveGuard } from '@/lib/pending-work';

function localAt(timezone: string, hoursAhead: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + hoursAhead * 3_600_000));
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

export function EventWorkspace({
  household,
  token,
  focusedId = '',
  focusSignal = 0,
  createRequest = 0,
}: {
  household: Household;
  token: string;
  focusedId?: string;
  focusSignal?: number;
  createRequest?: number;
}) {
  const [events, setEvents] = useState<HouseholdEvent[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  useLeaveGuard(formOpen);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    localAt(household.timezone, 24),
  );
  const [endsAtLocal, setEndsAtLocal] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const requestNumber = useRef(0);
  const selected = events.find((event) => event.id === selectedId) ?? null;

  useEffect(() => {
    const request = ++requestNumber.current;
    setLoading(true);
    setError('');
    void getEvents(token, household.id, scope)
      .then(
        (next) => {
          if (request !== requestNumber.current) return;
          setEvents(next);
          setOffset(next.length);
          setHasMore(next.length === 50);
          setSelectedId((old) =>
            next.some((event) => event.id === old) ? old : (next[0]?.id ?? ''),
          );
        },
        (failure) => {
          if (request === requestNumber.current) {
            setEvents([]);
            setError(message(failure));
          }
        },
      )
      .finally(() => {
        if (request === requestNumber.current) setLoading(false);
      });
    return () => {
      requestNumber.current += 1;
    };
  }, [token, household.id, scope]);

  useEffect(() => {
    if (createRequest) setFormOpen(true);
  }, [createRequest]);
  useEffect(() => {
    if (!focusedId || !focusSignal) return;
    let active = true;
    void getEvent(token, household.id, focusedId).then(
      (event) => {
        if (!active) return;
        setScope(
          new Date(event.startsAt).getTime() < Date.now() ? 'past' : 'upcoming',
        );
        setEvents((old) => [
          event,
          ...old.filter((item) => item.id !== event.id),
        ]);
        setSelectedId(event.id);
      },
      (failure) => {
        if (active) setError(message(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [focusedId, focusSignal, household.id, token]);

  async function refresh() {
    const request = ++requestNumber.current;
    setLoading(true);
    setError('');
    try {
      const next = await getEvents(token, household.id, scope);
      if (request !== requestNumber.current) return;
      setEvents(next);
      setOffset(next.length);
      setHasMore(next.length === 50);
      setSelectedId((old) =>
        next.some((event) => event.id === old) ? old : (next[0]?.id ?? ''),
      );
    } catch (failure) {
      if (request === requestNumber.current) setError(message(failure));
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }

  async function loadMore() {
    const request = requestNumber.current;
    setLoadingMore(true);
    setError('');
    try {
      const next = await getEvents(token, household.id, scope, 50, offset);
      if (request !== requestNumber.current) return;
      setEvents((old) => [
        ...old,
        ...next.filter((event) => !old.some((item) => item.id === event.id)),
      ]);
      setOffset((old) => old + next.length);
      setHasMore(next.length === 50);
    } catch (failure) {
      if (request === requestNumber.current) setError(message(failure));
    } finally {
      setLoadingMore(false);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (endsAtLocal && endsAtLocal <= startsAtLocal) {
      setError('End time must be after the start time.');
      return;
    }
    const draft: EventDraft = {
      title,
      description,
      location,
      startsAtLocal,
      endsAtLocal: endsAtLocal || null,
      idempotencyKey,
    };
    setSaving(true);
    try {
      const created = await createEvent(token, household.id, draft);
      setEvents((old) => [
        created,
        ...old.filter((item) => item.id !== created.id),
      ]);
      setSelectedId(created.id);
      setScope('upcoming');
      setFormOpen(false);
      setTitle('');
      setDescription('');
      setLocation('');
      setStartsAtLocal(localAt(household.timezone, 24));
      setEndsAtLocal('');
      setIdempotencyKey(crypto.randomUUID());
      setNotice('Event created. Members can now respond.');
    } catch (failure) {
      setError(message(failure));
    } finally {
      setSaving(false);
    }
  }

  async function answer(response: EventResponse) {
    if (!selected) return;
    setResponding(true);
    setError('');
    try {
      const updated = await respondToEvent(
        token,
        household.id,
        selected.id,
        response,
      );
      setEvents((old) =>
        old.map((event) => (event.id === updated.id ? updated : event)),
      );
      setNotice('Your attendance was saved.');
    } catch (failure) {
      setError(message(failure));
    } finally {
      setResponding(false);
    }
  }

  const myResponse = selected?.attendees.find(
    (attendee) => attendee.memberId === selected.viewerMemberId,
  )?.response;
  const expenseUrl = selected
    ? `/money?household=${encodeURIComponent(household.id)}&view=expenses&add=1&event=${encodeURIComponent(selected.id)}`
    : '';
  return (
    <section className="space-y-4" aria-label="Events">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl">Events</h2>
          <p className="text-sm text-muted-foreground">
            Plan together and see who is going.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setFormOpen((old) => !old)}>
            {formOpen ? 'Close form' : 'Create event'}
          </Button>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-primary/10 p-3 text-sm text-primary"
        >
          {notice}
        </p>
      )}
      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle>New event</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void save(event)} className="space-y-4">
              <label
                htmlFor="event-title"
                className="block space-y-1.5 text-sm font-medium"
              >
                Event title
                <Input
                  id="event-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={160}
                  required
                  disabled={saving}
                  placeholder="House dinner"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label
                  htmlFor="event-start"
                  className="block space-y-1.5 text-sm font-medium"
                >
                  Starts at ({household.timezone})
                  <Input
                    id="event-start"
                    type="datetime-local"
                    value={startsAtLocal}
                    onChange={(event) => setStartsAtLocal(event.target.value)}
                    required
                    disabled={saving}
                  />
                </label>
                <label
                  htmlFor="event-end"
                  className="block space-y-1.5 text-sm font-medium"
                >
                  Ends at (optional)
                  <Input
                    id="event-end"
                    type="datetime-local"
                    value={endsAtLocal}
                    onChange={(event) => setEndsAtLocal(event.target.value)}
                    disabled={saving}
                  />
                </label>
              </div>
              <label
                htmlFor="event-location"
                className="block space-y-1.5 text-sm font-medium"
              >
                Location (optional)
                <Input
                  id="event-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  maxLength={160}
                  disabled={saving}
                  placeholder="Kitchen or an address"
                />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                Details (optional)
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={1000}
                  disabled={saving}
                  rows={3}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 font-normal"
                />
              </label>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create event'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <fieldset className="flex gap-2">
        <legend className="sr-only">Event date filter</legend>
        <Button
          size="sm"
          variant={scope === 'upcoming' ? 'default' : 'outline'}
          aria-pressed={scope === 'upcoming'}
          onClick={() => setScope('upcoming')}
        >
          Upcoming
        </Button>
        <Button
          size="sm"
          variant={scope === 'past' ? 'default' : 'outline'}
          aria-pressed={scope === 'past'}
          onClick={() => setScope('past')}
        >
          Past
        </Button>
      </fieldset>
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading events…
        </p>
      )}
      {!loading && events.length === 0 && !error && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CalendarDays
              size={36}
              className="text-primary"
              aria-hidden="true"
            />
            <h3 className="font-heading text-lg">No {scope} events</h3>
            <p className="text-sm text-muted-foreground">
              Create an event to collect attendance from your household.
            </p>
          </CardContent>
        </Card>
      )}
      {events.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>
                {scope === 'upcoming' ? 'Coming up' : 'Past events'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {events.map((event) => (
                <button
                  type="button"
                  key={event.id}
                  onClick={() => setSelectedId(event.id)}
                  aria-current={selectedId === event.id ? 'true' : undefined}
                  className={`w-full rounded-xl border p-3 text-left hover:bg-muted/50 ${selectedId === event.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <strong className="block">{event.title}</strong>
                  <span className="text-sm text-muted-foreground">
                    {time(event.startsAt, household.timezone)} ·{' '}
                    {event.counts.going} going
                  </span>
                </button>
              ))}
              {hasMore && (
                <Button
                  variant="outline"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              )}
            </CardContent>
          </Card>
          {selected && (
            <Card>
              <CardHeader>
                <CardTitle>{selected.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p>
                  <strong>When:</strong>{' '}
                  {time(selected.startsAt, selected.timezone)}
                  {selected.endsAt
                    ? ` – ${time(selected.endsAt, selected.timezone)}`
                    : ''}
                </p>
                {selected.location && (
                  <p>
                    <strong>Where:</strong> {selected.location}
                  </p>
                )}
                {selected.description && (
                  <p className="whitespace-pre-wrap">{selected.description}</p>
                )}
                <p className="text-muted-foreground">
                  Created by {selected.creatorDisplayName}
                </p>
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="font-medium">Attendance</p>
                  <p className="text-muted-foreground">
                    {selected.counts.going} going · {selected.counts.maybe}{' '}
                    maybe · {selected.counts.notGoing} not going ·{' '}
                    {selected.counts.awaiting} awaiting
                  </p>
                </div>
                {selected.canRespond ? (
                  <fieldset className="space-y-2">
                    <legend className="font-medium">Your response</legend>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ['going', 'Going'],
                          ['maybe', 'Maybe'],
                          ['not_going', 'Not going'],
                        ] as const
                      ).map(([value, label]) => (
                        <Button
                          key={value}
                          size="sm"
                          variant={myResponse === value ? 'default' : 'outline'}
                          disabled={responding}
                          aria-pressed={myResponse === value}
                          onClick={() => void answer(value)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <p className="text-muted-foreground">
                    Attendance closed when this event started.
                  </p>
                )}
                <div>
                  <h4 className="font-medium">Household responses</h4>
                  <ul className="mt-2 divide-y divide-border">
                    {selected.attendees.map((person) => (
                      <li
                        key={person.memberId}
                        className="flex justify-between gap-3 py-2"
                      >
                        <span>{person.displayName}</span>
                        <span className="capitalize text-muted-foreground">
                          {person.response?.replace('_', ' ') ?? 'Awaiting'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href={expenseUrl}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  Add expense from event
                </Link>
                <p className="text-xs text-muted-foreground">
                  Going members will be suggested as participants. You can
                  change the payer, participants, and split before previewing.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
