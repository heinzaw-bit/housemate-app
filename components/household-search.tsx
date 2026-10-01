'use client';

import { Dialog } from '@base-ui/react/dialog';
import { ArrowUpRight, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import {
  ApiRequestError,
  type Household,
  type SearchHit,
  type SearchType,
  searchHousehold,
  searchTypes,
} from '@/lib/api';
import { hasPendingWork, usePendingWork } from '@/lib/pending-work';
import styles from './household-search.module.css';
import { Button } from './ui/button';
import { Input } from './ui/input';

const labels: Record<SearchType, string> = {
  expense: 'Expenses',
  bill: 'Bills',
  settlement: 'Transfers',
  meal: 'Meals',
  chore: 'Chores',
  shopping: 'Shopping',
  event: 'Events',
  announcement: 'Announcements',
  poll: 'Polls',
};

export function HouseholdSearch({
  token,
  household,
  disabled = false,
}: {
  token?: string;
  household: Household;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SearchType | 'all'>('all');
  const [composing, setComposing] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [online, setOnline] = useState(true);
  const pending = usePendingWork();
  const version = useRef(0);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const term = query.trim();
  const available = !!token && !disabled;

  function invalidate() {
    version.current++;
    controller.current?.abort();
    inFlight.current = false;
  }
  function clearResults() {
    setResults([]);
    setCursor(null);
    setSearched(false);
    setLoading(false);
    setError('');
  }
  function changeOpen(next: boolean) {
    invalidate();
    clearResults();
    setQuery('');
    setType('all');
    setComposing(false);
    setOpen(next && available);
  }
  function changeQuery(next: string) {
    invalidate();
    clearResults();
    setQuery(next);
  }
  function changeType(next: SearchType | 'all') {
    invalidate();
    clearResults();
    setType(next);
  }

  useEffect(() => {
    function connection() {
      const active = navigator.onLine;
      if (!active) {
        version.current++;
        controller.current?.abort();
        inFlight.current = false;
        setResults([]);
        setCursor(null);
        setSearched(false);
        setLoading(false);
      }
      setOnline(active);
    }
    connection();
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    return () => {
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
    };
  }, []);
  useEffect(() => {
    if (!available) return;
    function shortcut(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k' &&
        !event.altKey &&
        !event.isComposing
      ) {
        // Do not stack a new modal over another dialog or trap its keyboard shortcut.
        if (document.querySelector('[role="dialog"]')) return;
        event.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [available]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry explicitly restarts the same protected search.
  useEffect(() => {
    const requestQuery = query.trim();
    const current = ++version.current;
    controller.current?.abort();
    inFlight.current = false;
    setResults([]);
    setCursor(null);
    setSearched(false);
    setError('');
    setLoading(false);
    if (
      !open ||
      !available ||
      !token ||
      !online ||
      composing ||
      requestQuery.length < 2
    )
      return;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      inFlight.current = true;
      try {
        const page = await searchHousehold(
          token,
          household.id,
          requestQuery,
          type,
          undefined,
          abort.signal,
        );
        if (current !== version.current || abort.signal.aborted) return;
        setResults(page.results);
        setCursor(page.nextCursor);
        setSearched(true);
      } catch (cause) {
        if (current !== version.current || abort.signal.aborted) return;
        setError(
          cause instanceof ApiRequestError
            ? cause.message
            : 'Could not search. Try again.',
        );
      } finally {
        if (current === version.current) {
          setLoading(false);
          inFlight.current = false;
        }
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
      version.current++;
      inFlight.current = false;
    };
  }, [
    open,
    available,
    token,
    household.id,
    query,
    type,
    retry,
    online,
    composing,
  ]);

  async function more() {
    if (!token || !cursor || inFlight.current || !online) return;
    const current = ++version.current;
    const abort = new AbortController();
    controller.current = abort;
    inFlight.current = true;
    setLoading(true);
    setError('');
    try {
      const page = await searchHousehold(
        token,
        household.id,
        term,
        type,
        cursor,
        abort.signal,
      );
      if (current !== version.current || abort.signal.aborted) return;
      setResults((previous) => [
        ...new Map(
          [...previous, ...page.results].map((hit) => [
            `${hit.type}:${hit.id}`,
            hit,
          ]),
        ).values(),
      ]);
      setCursor(page.nextCursor);
    } catch (cause) {
      if (current !== version.current || abort.signal.aborted) return;
      if (
        cause instanceof ApiRequestError &&
        [401, 403, 404].includes(cause.status)
      ) {
        setResults([]);
        setCursor(null);
        setSearched(false);
      }
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Could not load more. Try again.',
      );
    } finally {
      if (current === version.current) {
        setLoading(false);
        inFlight.current = false;
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger
        className={styles.trigger}
        disabled={!available}
        aria-label="Search household records"
        title={
          available
            ? 'Search household records (Ctrl or Command + K)'
            : 'Search is available in your signed-in household'
        }
      >
        <Search size={19} aria-hidden="true" />
        <span>Search</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup} initialFocus={input}>
          <div className={styles.heading}>
            <Dialog.Title>Search your household</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close search">
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.description}>
            Find saved records in {household.name}. Newest added first.
          </Dialog.Description>
          <div className={styles.controls}>
            <label htmlFor={`${id}-query`} className="sr-only">
              Search records
            </label>
            <div className={styles.inputRow}>
              <Search size={18} aria-hidden="true" />
              <Input
                ref={input}
                id={`${id}-query`}
                type="search"
                value={query}
                maxLength={120}
                placeholder="Try rent, dinner, or cleaning…"
                aria-describedby={`${id}-help`}
                onChange={(event) => changeQuery(event.target.value)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' && results.length) {
                    event.preventDefault();
                    list.current
                      ?.querySelector<HTMLAnchorElement>('a')
                      ?.focus();
                  }
                }}
              />
              {query && (
                <button
                  type="button"
                  className={styles.close}
                  aria-label="Clear search"
                  onClick={() => {
                    changeQuery('');
                    input.current?.focus();
                  }}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className={styles.filter}>
              <label htmlFor={`${id}-type`}>Record type</label>
              <select
                id={`${id}-type`}
                value={type}
                onChange={(event) =>
                  changeType(event.target.value as SearchType | 'all')
                }
              >
                <option value="all">All records</option>
                {searchTypes.map((kind) => (
                  <option key={kind} value={kind}>
                    {labels[kind]}
                  </option>
                ))}
              </select>
            </div>
            <p id={`${id}-help`} className={styles.help}>
              Enter at least 2 characters. Searches titles and descriptive text.
            </p>
          </div>
          {pending && (
            <p className={styles.notice}>
              Finish or discard your open draft before opening a result.
            </p>
          )}
          <div className={styles.results}>
            {!online ? (
              <p role="status" className={styles.empty}>
                You’re offline. Reconnect to search current household records.
              </p>
            ) : (
              <>
                {error && (
                  <div className={styles.notice} role="alert">
                    <p>{error}</p>
                    <Button
                      variant="outline"
                      disabled={loading}
                      onClick={() => {
                        if (results.length && cursor) void more();
                        else setRetry((value) => value + 1);
                      }}
                    >
                      Try again
                    </Button>
                  </div>
                )}
                <p role="status" className={styles.help}>
                  {loading
                    ? 'Searching…'
                    : searched
                      ? `${results.length} results loaded${cursor ? ' · more available' : ''}`
                      : term.length < 2
                        ? 'Your search stays in this session.'
                        : ''}
                </p>
                {!loading && !error && !searched && term.length < 2 && (
                  <div className={styles.empty}>
                    <Search size={28} aria-hidden="true" />
                    <p>
                      Bills, expenses, meals, chores and more—all in one place.
                    </p>
                  </div>
                )}
                {searched && !loading && results.length === 0 && (
                  <p className={styles.empty}>
                    No matches. Try a shorter phrase or another record type.
                  </p>
                )}
                <ul
                  ref={list}
                  className={styles.list}
                  aria-label="Search results"
                  onKeyDown={(event) => {
                    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
                    const links = Array.from(
                      list.current?.querySelectorAll<HTMLAnchorElement>('a') ??
                        [],
                    );
                    const index = links.indexOf(
                      document.activeElement as HTMLAnchorElement,
                    );
                    if (index < 0) return;
                    event.preventDefault();
                    if (event.key === 'ArrowUp' && index === 0)
                      input.current?.focus();
                    else
                      links[
                        Math.min(
                          links.length - 1,
                          Math.max(
                            0,
                            index + (event.key === 'ArrowDown' ? 1 : -1),
                          ),
                        )
                      ]?.focus();
                  }}
                >
                  {results.map((hit) => (
                    <li key={`${hit.type}:${hit.id}`}>
                      <Link
                        href={hit.href}
                        className={styles.result}
                        aria-disabled={pending || undefined}
                        onClick={(event) => {
                          if (hasPendingWork()) {
                            event.preventDefault();
                            setError(
                              'Finish or discard your open draft before opening a result.',
                            );
                          } else changeOpen(false);
                        }}
                      >
                        <div className={styles.resultBody}>
                          <div className={styles.meta}>
                            <span>{labels[hit.type]}</span>
                            <span>{hit.status}</span>
                          </div>
                          <strong>{hit.title}</strong>
                          {hit.snippet && <p>{hit.snippet}</p>}
                          <small>
                            Added{' '}
                            {new Intl.DateTimeFormat(undefined, {
                              dateStyle: 'medium',
                              timeZone: household.timezone,
                            }).format(new Date(hit.createdAt))}
                          </small>
                        </div>
                        <ArrowUpRight size={18} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
                {cursor && (
                  <Button
                    className={styles.more}
                    variant="outline"
                    disabled={loading}
                    onClick={() => void more()}
                  >
                    {loading ? 'Loading…' : 'Load more results'}
                  </Button>
                )}
              </>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
