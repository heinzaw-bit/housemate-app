'use client';

import { Dialog } from '@base-ui/react/dialog';
import {
  ArrowRightLeft,
  CalendarDays,
  ClipboardList,
  Megaphone,
  Receipt,
  Search,
  ShoppingBasket,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import {
  ApiRequestError,
  type Household,
  type SearchHit,
  type SearchType,
  searchHousehold,
} from '@/lib/api';
import { hasPendingWork, usePendingWork } from '@/lib/pending-work';
import styles from './household-search.module.css';
import { Button } from './ui/button';
import { Input } from './ui/input';

const currentSearchTypes: readonly SearchType[] = [
  'expense',
  'bill',
  'settlement',
  'event',
  'announcement',
];

function currentResults(results: SearchHit[]) {
  return results.filter((hit) => currentSearchTypes.includes(hit.type));
}

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
const icons = {
  expense: Wallet,
  bill: Receipt,
  settlement: ArrowRightLeft,
  meal: Utensils,
  chore: ClipboardList,
  shopping: ShoppingBasket,
  event: CalendarDays,
  announcement: Megaphone,
  poll: ClipboardList,
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
  const popup = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const term = query.trim();
  const available = !!token && !disabled;
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: household.timezone,
  });
  const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: household.timezone,
  });

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    function position() {
      if (!viewport) return;
      popup.current?.style.setProperty(
        '--search-visible-height',
        `${viewport.height}px`,
      );
      popup.current?.style.setProperty(
        '--search-keyboard-offset',
        `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`,
      );
    }
    position();
    viewport.addEventListener('resize', position);
    viewport.addEventListener('scroll', position);
    return () => {
      viewport.removeEventListener('resize', position);
      viewport.removeEventListener('scroll', position);
    };
  }, [open]);

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
        setResults(currentResults(page.results));
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
          [...previous, ...currentResults(page.results)].map((hit) => [
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
        className="header-icon-button household-search-trigger"
        disabled={!available}
        aria-label="Search household records"
        title={
          available
            ? 'Search household records (Ctrl or Command + K)'
            : 'Search is available in your signed-in household'
        }
      >
        <Search size={20} strokeWidth={2} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup ref={popup} className={styles.popup} initialFocus={input}>
          <div className={styles.heading}>
            <div className={styles.headingCopy}>
              <Dialog.Title>Search</Dialog.Title>
              <Dialog.Description className={styles.description}>
                In {household.name}
              </Dialog.Description>
            </div>
            <Dialog.Close className={styles.close} aria-label="Close search">
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </div>
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
                placeholder="Search household records…"
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
              <label htmlFor={`${id}-type`} className="sr-only">
                Record type
              </label>
              <select
                id={`${id}-type`}
                value={type}
                onChange={(event) =>
                  changeType(event.target.value as SearchType | 'all')
                }
              >
                <option value="all">All records</option>
                {currentSearchTypes.map((kind) => (
                  <option key={kind} value={kind}>
                    {labels[kind]}
                  </option>
                ))}
              </select>
              <p role="status" className={styles.status}>
                {loading
                  ? 'Searching…'
                  : searched
                    ? `${results.length} results${cursor ? ' · more available' : ''}`
                    : ''}
              </p>
            </div>
            <p
              id={`${id}-help`}
              className={term.length === 1 ? styles.help : 'sr-only'}
            >
              {term.length === 1
                ? 'Type at least 2 characters.'
                : 'Search saved household records.'}
            </p>
          </div>
          {pending && (
            <p className={styles.notice}>
              Finish or discard your open draft before opening a result.
            </p>
          )}
          {(searched || error || !online || results.length > 0) && (
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
                  {searched && !loading && !error && results.length === 0 && (
                    <p className={styles.empty}>
                      {cursor
                        ? 'No matches on this page. Load more results or try another phrase.'
                        : 'No matches. Try a shorter phrase or another record type.'}
                    </p>
                  )}
                  <ul
                    ref={list}
                    className={styles.list}
                    aria-label="Search results"
                    onKeyDown={(event) => {
                      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
                      const links = Array.from(
                        list.current?.querySelectorAll<HTMLAnchorElement>(
                          'a',
                        ) ?? [],
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
                    {results.map((hit) => {
                      const Icon = icons[hit.type];
                      return (
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
                            <span className={styles.categoryIcon}>
                              <Icon size={19} aria-hidden="true" />
                            </span>
                            <div className={styles.resultBody}>
                              <strong>{hit.title}</strong>
                              <div className={styles.meta}>
                                <span>{labels[hit.type]}</span>
                                <span>{hit.status}</span>
                              </div>
                              {hit.snippet && <p>{hit.snippet}</p>}
                            </div>
                            <time
                              className={styles.date}
                              dateTime={hit.createdAt}
                              title={`Added ${dateFormatter.format(new Date(hit.createdAt))}`}
                            >
                              {shortDateFormatter.format(
                                new Date(hit.createdAt),
                              )}
                            </time>
                          </Link>
                        </li>
                      );
                    })}
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
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
