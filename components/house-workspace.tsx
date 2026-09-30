'use client';

import { Plus, RefreshCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ApiRequestError,
  getHouseActions,
  type HouseActions,
  type Household,
  respondToMeal,
} from '@/lib/api';
import { WorkspaceLoading } from './workspace-loading';

const AnnouncementWorkspace = dynamic(
  () =>
    import('./announcement-workspace').then(
      (module) => module.AnnouncementWorkspace,
    ),
  { loading: WorkspaceLoading },
);
const ChoreWorkspace = dynamic(
  () => import('./chore-workspace').then((module) => module.ChoreWorkspace),
  { loading: WorkspaceLoading },
);
const EventWorkspace = dynamic(
  () => import('./event-workspace').then((module) => module.EventWorkspace),
  { loading: WorkspaceLoading },
);
const MealWorkspace = dynamic(
  () => import('./meal-workspace').then((module) => module.MealWorkspace),
  { loading: WorkspaceLoading },
);
const PollWorkspace = dynamic(
  () => import('./poll-workspace').then((module) => module.PollWorkspace),
  { loading: WorkspaceLoading },
);
const ShoppingWorkspace = dynamic(
  () =>
    import('./shopping-workspace').then((module) => module.ShoppingWorkspace),
  { loading: WorkspaceLoading },
);

type HouseView =
  | 'chores'
  | 'shopping'
  | 'meals'
  | 'events'
  | 'announcements'
  | 'polls';
const recordKeys: Record<HouseView, string> = {
  chores: 'chore',
  shopping: 'item',
  meals: 'meal',
  events: 'event',
  announcements: 'announcement',
  polls: 'poll',
};

function routeState(): { view: HouseView; focusId: string; add: boolean } {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'announcements' || params.has('announcement'))
    return {
      view: 'announcements',
      focusId: params.get('announcement') ?? '',
      add: params.get('add') === '1',
    };
  if (view === 'polls' || params.has('poll'))
    return {
      view: 'polls',
      focusId: params.get('poll') ?? '',
      add: params.get('add') === '1',
    };
  if (view === 'shopping' || params.get('shopping') === '1')
    return {
      view: 'shopping',
      focusId: params.get('item') ?? '',
      add: params.get('add') === '1',
    };
  if (view === 'meals' || params.has('meal'))
    return {
      view: 'meals',
      focusId: params.get('meal') ?? '',
      add: params.get('add') === '1',
    };
  if (view === 'events' || params.has('event'))
    return {
      view: 'events',
      focusId: params.get('event') ?? '',
      add: params.get('add') === '1',
    };
  return {
    view: 'chores',
    focusId: params.get('chore') ?? '',
    add: params.get('add') === '1',
  };
}

function dateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

export function HouseWorkspace({
  household,
  token,
}: {
  household: Household;
  token: string;
}) {
  const [view, setView] = useState<HouseView>('chores');
  const [focusId, setFocusId] = useState('');
  const [focusSignal, setFocusSignal] = useState(0);
  const [mealRefreshSignal, setMealRefreshSignal] = useState(0);
  const [createRequest, setCreateRequest] = useState<{
    view: HouseView;
    id: number;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [actions, setActions] = useState<HouseActions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [respondingId, setRespondingId] = useState('');
  const requestNumber = useRef(0);
  const createNumber = useRef(0);
  const addContainer = useRef<HTMLDivElement>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);

  const refreshActions = useCallback(async () => {
    const request = ++requestNumber.current;
    setLoading(true);
    setError('');
    try {
      const next = await getHouseActions(token, household.id);
      if (request === requestNumber.current) setActions(next);
    } catch (failure) {
      if (request !== requestNumber.current) return;
      if (
        failure instanceof ApiRequestError &&
        [401, 403, 404].includes(failure.status)
      )
        setActions(null);
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not load your house actions.',
      );
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, [household.id, token]);

  useEffect(() => {
    const syncRoute = () => {
      const next = routeState();
      setView(next.view);
      setFocusId(next.focusId);
      if (next.focusId) setFocusSignal((current) => current + 1);
      if (next.add)
        setCreateRequest({ view: next.view, id: ++createNumber.current });
      else setCreateRequest(null);
    };
    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);
  useEffect(() => {
    void refreshActions();
    const onFocus = () => {
      if (document.visibilityState === 'visible' && navigator.onLine)
        void refreshActions();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine)
        void refreshActions();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(onFocus, 60_000);
    return () => {
      requestNumber.current += 1;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [refreshActions]);
  useEffect(() => {
    if (!addOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!addContainer.current?.contains(event.target as Node))
        setAddOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAddOpen(false);
        addTrigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [addOpen]);

  function select(next: HouseView, id = '', create = false) {
    setView(next);
    setFocusId(id);
    if (id) setFocusSignal((current) => current + 1);
    setAddOpen(false);
    if (create) setCreateRequest({ view: next, id: ++createNumber.current });
    else setCreateRequest(null);
    const url = new URL(window.location.href);
    for (const key of [
      'shopping',
      'chores',
      'meal',
      'event',
      'announcement',
      'poll',
      'chore',
      'item',
      'add',
      'view',
    ])
      url.searchParams.delete(key);
    url.searchParams.set('view', next);
    if (id) url.searchParams.set(recordKeys[next], id);
    if (create) url.searchParams.set('add', '1');
    window.history.pushState(null, '', url);
  }

  async function answer(
    mealId: string,
    response: 'joining' | 'not_joining' | 'maybe',
  ) {
    setRespondingId(mealId);
    setError('');
    try {
      await respondToMeal(token, household.id, mealId, response);
      setMealRefreshSignal((current) => current + 1);
      await refreshActions();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not save your response.',
      );
    } finally {
      setRespondingId('');
    }
  }

  const meal = actions?.mealResponses[0];
  const swap = actions?.swapRequests[0];
  const chore = actions?.chores[0];
  const shopping = actions?.shopping[0];
  const announcement = actions?.announcements?.[0];
  const poll = actions?.polls?.[0];
  const hasActions = !!(
    meal ||
    swap ||
    chore ||
    shopping ||
    announcement ||
    poll
  );
  return (
    <div>
      <div className="content-inner space-y-5 pt-5">
        <div className="page-heading-row">
          <div>
            <span className="eyebrow">SHARED PLANS, CLEAR NEXT STEPS</span>
            <h1>House</h1>
            <p>Keep daily work moving in {household.name}.</p>
          </div>
          <div className="relative" ref={addContainer}>
            <Button
              ref={addTrigger}
              aria-expanded={addOpen}
              aria-controls="house-add-options"
              onClick={() => setAddOpen((open) => !open)}
            >
              <Plus size={16} aria-hidden="true" /> Add…
            </Button>
            {addOpen && (
              <fieldset
                id="house-add-options"
                aria-label="Add to House"
                className="absolute right-0 z-10 mt-2 grid min-w-44 gap-1 rounded-xl border bg-background p-2 shadow-lg"
              >
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => select('chores', '', true)}
                >
                  Chore
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => select('shopping', '', true)}
                >
                  Shopping item
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => select('meals', '', true)}
                >
                  Meal check
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => select('events', '', true)}
                >
                  Event
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => select('announcements', '', true)}
                >
                  Announcement
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => select('polls', '', true)}
                >
                  Poll
                </Button>
              </fieldset>
            )}
          </div>
        </div>
        <section aria-labelledby="house-actions-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="house-actions-title" className="text-lg font-semibold">
                Your next actions
              </h2>
              <p className="text-sm text-muted-foreground">
                A preview of items that need you.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void refreshActions()}
            >
              <RefreshCw size={15} aria-hidden="true" /> Refresh
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error} {actions ? 'This preview may be out of date.' : ''}
            </p>
          )}
          {loading && !actions ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading your next actions…
            </p>
          ) : !actions ? (
            <p className="text-sm text-muted-foreground">
              Your next actions are unavailable.
            </p>
          ) : !hasActions ? (
            <Card className="gap-0">
              <CardContent className="text-sm">
                Nothing needs your response right now. Check the sections below
                for household plans.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {announcement && (
                <Card className="gap-2 border-primary/30 bg-primary/5">
                  <CardContent className="space-y-2">
                    <p
                      className={`text-xs font-semibold uppercase tracking-wide ${announcement.priority === 'urgent' ? 'text-destructive' : 'text-primary'}`}
                    >
                      {announcement.priority} announcement
                    </p>
                    <p className="font-medium">{announcement.title}</p>
                    <p className="text-sm text-muted-foreground">
                      Your acknowledgement is requested
                      {announcement.expiresAt
                        ? ` · Expires ${dateTime(announcement.expiresAt, household.timezone)}`
                        : ''}
                      .
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => select('announcements', announcement.id)}
                    >
                      Read announcement
                    </Button>
                  </CardContent>
                </Card>
              )}
              {poll && (
                <Card className="gap-2 border-primary/30 bg-primary/5">
                  <CardContent className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Your vote needed
                    </p>
                    <p className="font-medium">{poll.question}</p>
                    <p className="text-sm text-muted-foreground">
                      Closes {dateTime(poll.deadline, household.timezone)}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => select('polls', poll.id)}
                    >
                      Open poll
                    </Button>
                  </CardContent>
                </Card>
              )}
              {swap && (
                <Card className="gap-2 border-primary/30 bg-primary/5">
                  <CardContent className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Swap request
                    </p>
                    <p className="font-medium">{swap.title}</p>
                    <p className="text-sm text-muted-foreground">
                      Due {dateTime(swap.dueAt, household.timezone)}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => select('chores', swap.id)}
                    >
                      Review swap
                    </Button>
                  </CardContent>
                </Card>
              )}
              {meal && (
                <Card className="gap-2 border-primary/30 bg-primary/5">
                  <CardContent className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Meal reply needed
                    </p>
                    <p className="font-medium">{meal.title}</p>
                    <p className="text-sm text-muted-foreground">
                      Answer by{' '}
                      {dateTime(meal.responseDeadline, household.timezone)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={!!respondingId}
                        onClick={() => void answer(meal.id, 'joining')}
                      >
                        Joining
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!respondingId}
                        onClick={() => void answer(meal.id, 'maybe')}
                      >
                        Maybe
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!respondingId}
                        onClick={() => void answer(meal.id, 'not_joining')}
                      >
                        Can’t join
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="link"
                      onClick={() => select('meals', meal.id)}
                    >
                      View meal details
                    </Button>
                  </CardContent>
                </Card>
              )}
              {chore && (
                <Card className="gap-2">
                  <CardContent className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Your chore
                    </p>
                    <p className="font-medium">{chore.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(chore.dueAt).getTime() < Date.now()
                        ? 'Overdue'
                        : 'Due'}{' '}
                      · {dateTime(chore.dueAt, household.timezone)}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => select('chores', chore.id)}
                    >
                      Open chore
                    </Button>
                  </CardContent>
                </Card>
              )}
              {shopping && (
                <Card className="gap-2">
                  <CardContent className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Assigned shopping
                    </p>
                    <p className="font-medium">{shopping.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {shopping.quantity === null
                        ? 'Quantity not set'
                        : `${shopping.quantity} ${shopping.unit ?? ''}`}{' '}
                      · {shopping.priority} priority
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => select('shopping', shopping.id)}
                    >
                      Open item
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </section>
        <nav
          aria-label="House sections"
          className="flex flex-wrap gap-2 border-b pb-4"
        >
          {(
            [
              'chores',
              'shopping',
              'meals',
              'events',
              'announcements',
              'polls',
            ] as const
          ).map((section) => (
            <Button
              key={section}
              variant={view === section ? 'default' : 'outline'}
              aria-current={view === section ? 'page' : undefined}
              onClick={() => select(section)}
            >
              {section[0].toUpperCase() + section.slice(1)}
            </Button>
          ))}
        </nav>
      </div>
      {view === 'chores' ? (
        <ChoreWorkspace
          household={household}
          token={token}
          focusedId={focusId}
          focusSignal={focusSignal}
          createRequest={
            createRequest?.view === 'chores' ? createRequest.id : 0
          }
          onHouseChanged={refreshActions}
        />
      ) : view === 'shopping' ? (
        <ShoppingWorkspace
          household={household}
          token={token}
          focusedId={focusId}
          focusSignal={focusSignal}
          createRequest={
            createRequest?.view === 'shopping' ? createRequest.id : 0
          }
          onHouseChanged={refreshActions}
        />
      ) : view === 'meals' ? (
        <MealWorkspace
          household={household}
          token={token}
          focusedId={focusId}
          focusSignal={focusSignal}
          refreshSignal={mealRefreshSignal}
          createRequest={createRequest?.view === 'meals' ? createRequest.id : 0}
          onHouseChanged={refreshActions}
        />
      ) : view === 'events' ? (
        <EventWorkspace
          household={household}
          token={token}
          focusedId={focusId}
          focusSignal={focusSignal}
          createRequest={
            createRequest?.view === 'events' ? createRequest.id : 0
          }
        />
      ) : view === 'announcements' ? (
        <AnnouncementWorkspace
          household={household}
          token={token}
          focusedId={focusId}
          focusSignal={focusSignal}
          createRequest={
            createRequest?.view === 'announcements' ? createRequest.id : 0
          }
          onHouseChanged={refreshActions}
        />
      ) : (
        <PollWorkspace
          household={household}
          token={token}
          focusedId={focusId}
          focusSignal={focusSignal}
          createRequest={createRequest?.view === 'polls' ? createRequest.id : 0}
          onHouseChanged={refreshActions}
        />
      )}
    </div>
  );
}
