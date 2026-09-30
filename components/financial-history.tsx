'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  type FinancialHistoryEvent,
  getBillHistory,
  getExpenseHistory,
} from '@/lib/api';
import { historyEventKey, mergeHistoryEvents } from '@/lib/financial-history';

const titles: Record<FinancialHistoryEvent['kind'], string> = {
  created: 'Created',
  edited: 'Edited',
  voided: 'Voided',
  status_changed: 'Provider status changed',
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function FinancialHistory({
  token,
  householdId,
  recordId,
  kind,
}: {
  token: string;
  householdId: string;
  recordId: string;
  kind: 'expense' | 'bill';
}) {
  const [events, setEvents] = useState<FinancialHistoryEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const nextOffset = useRef(0);
  const moreInFlight = useRef(false);
  const fetchPage = useCallback(
    (offset: number) =>
      kind === 'expense'
        ? getExpenseHistory(token, householdId, recordId, 20, offset)
        : getBillHistory(token, householdId, recordId, 20, offset),
    [kind, token, householdId, recordId],
  );

  const loadInitial = useCallback(async () => {
    const request = ++generation.current;
    nextOffset.current = 0;
    moreInFlight.current = false;
    setLoading(true);
    setLoadingMore(false);
    setHasMore(false);
    setError('');
    try {
      const page = await fetchPage(0);
      if (request !== generation.current) return;
      nextOffset.current = page.events.length;
      setEvents(mergeHistoryEvents([], page.events));
      setHasMore(page.hasMore);
    } catch (cause) {
      if (request !== generation.current) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not load history.',
      );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    void loadInitial();
    return () => {
      generation.current += 1;
    };
  }, [loadInitial]);

  async function more() {
    if (loading || moreInFlight.current) return;
    moreInFlight.current = true;
    const request = generation.current;
    setLoadingMore(true);
    setError('');
    try {
      const page = await fetchPage(nextOffset.current);
      if (request !== generation.current) return;
      nextOffset.current += page.events.length;
      setEvents((old) => mergeHistoryEvents(old, page.events));
      setHasMore(page.hasMore);
    } catch (cause) {
      if (request !== generation.current) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not load more history.',
      );
    } finally {
      if (request === generation.current) {
        moreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  }

  return (
    <section
      className="space-y-3 border-t border-border pt-4"
      aria-label={`${kind} change history`}
    >
      <h4 className="font-heading text-base font-medium">Change history</h4>
      {loading && (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {error && events.length === 0 && !loading && (
        <Button variant="outline" size="sm" onClick={() => void loadInitial()}>
          Retry history
        </Button>
      )}
      {!loading && events.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          No history is available for this record.
        </p>
      )}
      {events.length > 0 && (
        <ol className="space-y-3">
          {events.map((event) => (
            <li
              key={historyEventKey(event)}
              className="rounded-xl border border-border p-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <strong>{titles[event.kind]}</strong>
                <time
                  dateTime={event.occurredAt}
                  className="text-xs text-muted-foreground"
                >
                  {dateTime(event.occurredAt)}
                </time>
              </div>
              <p className="text-xs text-muted-foreground">
                By {event.actorDisplayName}
              </p>
              {event.changes.length ? (
                <dl className="mt-2 space-y-2 border-t border-border pt-2">
                  {event.changes.map((change) => (
                    <div key={change.field}>
                      <dt className="font-medium">{change.label}</dt>
                      <dd className="break-words text-muted-foreground">
                        {change.before === null ? (
                          change.after || 'None'
                        ) : (
                          <>
                            {change.before || 'None'} → {change.after || 'None'}
                          </>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  No displayed fields changed.
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {hasMore && (
        <Button
          variant="outline"
          size="sm"
          disabled={loading || loadingMore}
          onClick={() => void more()}
        >
          {loadingMore ? 'Loading…' : 'Load more history'}
        </Button>
      )}
    </section>
  );
}
