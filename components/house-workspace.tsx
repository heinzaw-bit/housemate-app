'use client';

import { Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Household } from '@/lib/api';
import { usePendingWork } from '@/lib/pending-work';
import { HouseTools, type HouseView } from './house-tools';
import { WorkspaceLoading } from './workspace-loading';

const AnnouncementWorkspace = dynamic(
  () =>
    import('./announcement-workspace').then(
      (module) => module.AnnouncementWorkspace,
    ),
  { loading: () => <WorkspaceLoading /> },
);
const ChoreWorkspace = dynamic(
  () => import('./chore-workspace').then((module) => module.ChoreWorkspace),
  { loading: () => <WorkspaceLoading /> },
);
const EventWorkspace = dynamic(
  () => import('./event-workspace').then((module) => module.EventWorkspace),
  { loading: () => <WorkspaceLoading /> },
);
const MealWorkspace = dynamic(
  () => import('./meal-workspace').then((module) => module.MealWorkspace),
  { loading: () => <WorkspaceLoading /> },
);
const PollWorkspace = dynamic(
  () => import('./poll-workspace').then((module) => module.PollWorkspace),
  { loading: () => <WorkspaceLoading /> },
);
const ShoppingWorkspace = dynamic(
  () =>
    import('./shopping-workspace').then((module) => module.ShoppingWorkspace),
  { loading: () => <WorkspaceLoading /> },
);

const createLabels: Partial<Record<HouseView, string>> = {
  meals: 'New meal',
  shopping: 'New item',
  chores: 'New chore',
  events: 'New event',
  announcements: 'New announcement',
  polls: 'New poll',
};

function routeState(query: string): {
  view: HouseView | null;
  focusId: string;
  add: boolean;
} {
  const params = new URLSearchParams(query);
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
  const add = params.get('add') === '1';
  return { view: add ? 'announcements' : null, focusId: '', add };
}

export function HouseWorkspace({
  household,
  token,
}: {
  household: Household;
  token: string;
}) {
  const pending = usePendingWork();
  const [view, setView] = useState<HouseView | null>(null);
  const [focusId, setFocusId] = useState('');
  const [focusSignal, setFocusSignal] = useState(0);
  const [createRequest, setCreateRequest] = useState<{
    view: HouseView;
    id: number;
  } | null>(null);
  const createNumber = useRef(0);
  const routeQuery = useSearchParams().toString();
  useEffect(() => {
    const syncRoute = () => {
      const next = routeState(routeQuery);
      setView(next.view);
      setFocusId(next.focusId);
      if (next.focusId) setFocusSignal((current) => current + 1);
      setCreateRequest(
        next.add && next.view
          ? { view: next.view, id: ++createNumber.current }
          : null,
      );
    };
    syncRoute();
  }, [routeQuery]);

  function select(next: HouseView) {
    if (pending) return;
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
  const createLabel = view && createLabels[view];
  return (
    <div className="space-y-5 pb-6">
      <div className="content-inner space-y-5 pt-5">
        <div className="page-heading-row">
          <div className="board-heading">
            <span className="eyebrow">OUR HOUSE</span>
            <div className="board-title-row">
              <h1>Board</h1>
              {view && createLabel && (
                <Button
                  type="button"
                  className="board-create-button"
                  aria-label={createLabel}
                  onClick={() =>
                    setCreateRequest({ view, id: ++createNumber.current })
                  }
                >
                  <Plus size={17} aria-hidden="true" />
                  <span className="board-create-short">New</span>
                  <span className="board-create-full">{createLabel}</span>
                </Button>
              )}
            </div>
            <p>Plans, tasks, and the everyday things you share.</p>
          </div>
        </div>
        <HouseTools view={view} onSelect={select} disabled={pending} />
        {pending && (
          <p role="status" className="design-muted">
            Finish or discard the open draft before switching tools.
          </p>
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
      ) : view === 'polls' ? (
        <PollWorkspace {...props} compact onHouseChanged={() => {}} />
      ) : null}
    </div>
  );
}
