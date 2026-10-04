'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Household } from '@/lib/api';
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
  if (view === 'chores' || params.has('chore') || params.get('chores') === '1')
    return {
      view: 'chores',
      focusId: params.get('chore') ?? '',
      add: params.get('add') === '1',
    };
  return { view: 'announcements', focusId: '', add: params.get('add') === '1' };
}

export function HouseWorkspace({
  household,
  token,
}: {
  household: Household;
  token: string;
}) {
  const [view, setView] = useState<HouseView>('announcements');
  const [focusId, setFocusId] = useState('');
  const [focusSignal, setFocusSignal] = useState(0);
  const [createRequest, setCreateRequest] = useState<{
    view: HouseView;
    id: number;
  } | null>(null);
  const createNumber = useRef(0);
  useEffect(() => {
    const syncRoute = () => {
      const next = routeState();
      setView(next.view);
      setFocusId(next.focusId);
      if (next.focusId) setFocusSignal((current) => current + 1);
      setCreateRequest(
        next.add ? { view: next.view, id: ++createNumber.current } : null,
      );
    };
    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  function select(next: 'announcements' | 'events') {
    setView(next);
    setFocusId('');
    setCreateRequest(null);
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
    window.history.pushState(null, '', url);
  }
  const props = {
    household,
    token,
    focusedId: focusId,
    focusSignal,
    createRequest: createRequest?.view === view ? createRequest.id : 0,
  };
  const legacy = view !== 'announcements' && view !== 'events';
  return (
    <div className="space-y-5 pb-6">
      <div className="content-inner space-y-5 pt-5">
        <div className="page-heading-row">
          <div>
            <span className="eyebrow">SHARED UPDATES, PLANS TOGETHER</span>
            <h1>Board</h1>
            <p>Share announcements, plan events, and see who’s joining.</p>
          </div>
        </div>
        <nav aria-label="Board sections" className="flex gap-6 border-b">
          {(['announcements', 'events'] as const).map((section) => (
            <button
              type="button"
              key={section}
              aria-current={view === section ? 'page' : undefined}
              onClick={() => select(section)}
              className={
                'min-h-11 border-b-2 px-1 pb-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring ' +
                (view === section
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground')
              }
            >
              {section === 'announcements' ? 'Announcements' : 'Events'}
            </button>
          ))}
        </nav>
        {legacy && (
          <Button variant="ghost" onClick={() => select('announcements')}>
            Back to announcements
          </Button>
        )}
      </div>
      {view === 'announcements' ? (
        <AnnouncementWorkspace {...props} compact />
      ) : view === 'events' ? (
        <div className="content-inner">
          <EventWorkspace {...props} compact />
        </div>
      ) : view === 'chores' ? (
        <ChoreWorkspace {...props} />
      ) : view === 'shopping' ? (
        <ShoppingWorkspace {...props} />
      ) : view === 'meals' ? (
        <MealWorkspace {...props} />
      ) : (
        <PollWorkspace {...props} onHouseChanged={() => {}} />
      )}
    </div>
  );
}
