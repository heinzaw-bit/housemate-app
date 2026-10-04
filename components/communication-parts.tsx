'use client';

import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getMembers, type HouseholdMember } from '@/lib/api';

export function householdLocalTime(
  timezone: string,
  hoursAhead: number,
): string {
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
export function householdTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
export function useCommunicationMembers(token: string, householdId: string) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [error, setError] = useState('');
  const requestNumber = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requestNumber.current;
    try {
      const next = await getMembers(token, householdId);
      if (request === requestNumber.current) {
        setMembers(next);
        setError('');
      }
    } catch (failure) {
      if (request === requestNumber.current) {
        setMembers([]);
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not load household members.',
        );
      }
    }
  }, [token, householdId]);
  useEffect(() => {
    void refresh();
    return () => {
      requestNumber.current += 1;
    };
  }, [refresh]);
  return { members, error, refresh };
}

export function usePublicationKey() {
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  return {
    forDraft(draft: unknown) {
      const signature = JSON.stringify(draft);
      if (attempt.current?.signature !== signature) {
        attempt.current = { signature, key: crypto.randomUUID() };
      }
      return attempt.current.key;
    },
    reset() {
      attempt.current = null;
    },
  };
}

export function CommunicationRecipients({
  members,
  selectedIds,
  onChange,
  disabled,
  label,
}: {
  members: Pick<HouseholdMember, 'id' | 'displayName'>[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(members.map((member) => member.id))}
        >
          Select all
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([])}
        >
          Clear
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {members.map((member) => (
          <label
            key={member.id}
            className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(member.id)}
              onChange={() =>
                onChange(
                  selectedIds.includes(member.id)
                    ? selectedIds.filter((id) => id !== member.id)
                    : [...selectedIds, member.id],
                )
              }
            />
            {member.displayName}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CommunicationBrowser<T extends { id: string }>({
  title,
  subtitle,
  compact = false,
  createOpen,
  draftNotice,
  onToggleCreate,
  form,
  scopes,
  scope,
  onScope,
  records,
  selected,
  loading,
  detailLoading,
  loadingMore,
  hasMore,
  error,
  updatedAt,
  onOpen,
  onClose,
  onRefresh,
  onMore,
  renderRow,
  renderDetail,
  notice,
}: {
  title: string;
  subtitle: string;
  compact?: boolean;
  createOpen: boolean;
  draftNotice?: React.ReactNode;
  onToggleCreate: () => void;
  form: React.ReactNode;
  scopes: { value: string; label: string }[];
  scope: string;
  onScope: (value: string) => void;
  records: T[];
  selected: T | null;
  loading: boolean;
  detailLoading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string;
  updatedAt: string;
  notice: string;
  onOpen: (id: string) => void;
  onClose: () => void;
  onRefresh: () => void;
  onMore: () => void;
  renderRow: (record: T) => React.ReactNode;
  renderDetail: (record: T) => React.ReactNode;
}) {
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected?.id && window.matchMedia('(max-width: 1023px)').matches) {
      detailRef.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
      detailRef.current?.focus({ preventScroll: true });
    }
  }, [selected?.id]);
  return (
    <section
      className={`content-inner space-y-4 ${compact ? 'pt-5' : ''}`}
      aria-label={title}
    >
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={onRefresh}
              aria-label={`Refresh ${title.toLowerCase()}`}
              title={`Refresh ${title.toLowerCase()}`}
            >
              <RefreshCw size={15} aria-hidden="true" /> Refresh
            </Button>
            <Button size="sm" onClick={onToggleCreate}>
              {createOpen
                ? 'Close form'
                : `New ${title === 'Polls' ? 'poll' : 'announcement'}`}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
          {updatedAt ? ' The last view may be out of date.' : ''}
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
      {draftNotice}
      {createOpen && form}
      <fieldset
        className={compact ? 'board-record-filters' : 'flex flex-wrap gap-2'}
      >
        <legend className="sr-only">{title} filter</legend>
        {scopes.map((item) => (
          <Button
            key={item.value}
            size="sm"
            aria-label={
              compact && item.value === 'needs_ack'
                ? 'To acknowledge: needs acknowledgement'
                : item.label
            }
            aria-pressed={scope === item.value}
            variant={scope === item.value ? 'default' : 'outline'}
            onClick={() => onScope(item.value)}
          >
            {compact && item.value === 'needs_ack'
              ? 'To acknowledge'
              : item.label}
          </Button>
        ))}
      </fieldset>
      {compact ? (
        <RecordRefreshStatus
          label={title.toLowerCase()}
          updatedAt={updatedAt}
          loading={loading}
          onRefresh={onRefresh}
        />
      ) : updatedAt ? (
        <p className="text-xs text-muted-foreground">
          Updated{' '}
          {new Date(updatedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          · Refreshes while this section is open.
        </p>
      ) : null}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading {title.toLowerCase()}…
        </p>
      )}
      {detailLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          Opening details…
        </p>
      )}
      <div
        className={`grid gap-4 ${selected || !compact ? 'lg:grid-cols-[minmax(0,1fr)_minmax(300px,1fr)]' : ''}`}
      >
        <Card className={selected ? 'max-lg:hidden' : undefined}>
          {!compact && (
            <CardHeader>
              <CardTitle>
                {scopes.find((item) => item.value === scope)?.label ?? title}
              </CardTitle>
            </CardHeader>
          )}
          <CardContent className="space-y-2">
            {!loading && !records.length && !error && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No {title.toLowerCase()} in this view yet.
              </p>
            )}
            {records.map((record) => (
              <button
                type="button"
                key={record.id}
                onClick={() => onOpen(record.id)}
                aria-current={selected?.id === record.id ? 'true' : undefined}
                className={`w-full rounded-xl border p-3 text-left hover:bg-muted/50 ${selected?.id === record.id ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                {renderRow(record)}
              </button>
            ))}
            {hasMore && (
              <Button variant="outline" disabled={loadingMore} onClick={onMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </CardContent>
        </Card>
        {(selected || !compact) && (
          <Card
            ref={detailRef}
            tabIndex={-1}
            className={`scroll-mt-6 ${selected ? '' : 'max-lg:hidden'}`}
          >
            <CardContent className="space-y-4">
              {selected ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="lg:hidden"
                    onClick={onClose}
                  >
                    Back to {title.toLowerCase()}
                  </Button>
                  {renderDetail(selected)}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Choose {title === 'Polls' ? 'a poll' : 'an announcement'} to
                  see details and respond.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

export function RecordRefreshStatus({
  label,
  updatedAt,
  loading,
  onRefresh,
}: {
  label: string;
  updatedAt: string;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="board-record-status">
      <p className="text-xs text-muted-foreground">
        {loading
          ? 'Updating…'
          : updatedAt
            ? `Updated ${new Date(updatedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : 'Not updated yet'}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={loading}
        onClick={onRefresh}
        aria-label={`Refresh ${label}`}
        title={`Refresh ${label}`}
      >
        <RefreshCw size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}
