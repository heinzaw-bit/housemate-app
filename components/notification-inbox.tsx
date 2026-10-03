'use client';

import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ClipboardList,
  Megaphone,
  Receipt,
  ShoppingBasket,
  Utensils,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Household, NotificationItem } from '@/lib/api';
import { HouseMateMascot } from './housemate-mascot';

const categoryIcons = {
  money: Wallet,
  bills: Receipt,
  settlements: Wallet,
  meals: Utensils,
  chores: ClipboardList,
  shopping: ShoppingBasket,
  events: CalendarDays,
  announcements: Megaphone,
  polls: ClipboardList,
};

function dayKey(date: Date, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(date);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join('-');
}

export function NotificationInbox({
  household,
  records,
  unread,
  scope,
  setScope,
  loading,
  loadingMore,
  reading,
  error,
  updatedAt,
  cursor,
  mark,
  more,
}: {
  household: Household;
  records: NotificationItem[];
  unread: number;
  scope: 'all' | 'unread';
  setScope: (scope: 'all' | 'unread') => void;
  loading: boolean;
  loadingMore: boolean;
  reading: string;
  error: string;
  updatedAt: string;
  cursor: string | null;
  mark: (id: string, all?: boolean) => Promise<void>;
  more: () => Promise<void>;
}) {
  const dayFormatter = new Intl.DateTimeFormat('en', {
    timeZone: household.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const fullTimeFormatter = new Intl.DateTimeFormat('en', {
    timeZone: household.timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const timeFormatter = new Intl.DateTimeFormat('en', {
    timeZone: household.timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
  const earlierFormatter = new Intl.DateTimeFormat('en', {
    timeZone: household.timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const today = dayKey(new Date(), dayFormatter);
  const [year, month, day] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString()
    .slice(0, 10);
  const groups: { label: string; items: NotificationItem[] }[] = [
    'Today',
    'Yesterday',
    'Earlier',
  ].map((label) => ({ label, items: [] }));
  for (const item of records) {
    const key = dayKey(new Date(item.createdAt), dayFormatter);
    groups[key === today ? 0 : key === yesterday ? 1 : 2].items.push(item);
  }
  return (
    <section
      className="notification-inbox"
      aria-label="Your inbox"
      aria-busy={loading || loadingMore}
    >
      <div className="notification-toolbar">
        <fieldset
          className="notification-filters"
          aria-label="Filter notifications"
        >
          {(['all', 'unread'] as const).map((value) => (
            <Button
              key={value}
              variant="ghost"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
            >
              {value === 'all' ? 'All' : 'Unread'}
            </Button>
          ))}
        </fieldset>
        <Button
          variant="ghost"
          disabled={!!reading || !unread || !records.length || loading}
          onClick={() => void mark(records[0].id, true)}
        >
          {reading === records[0]?.id ? 'Saving…' : 'Mark all read'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="notification-alert">
          {error}
          {updatedAt ? ' Your last view may be out of date.' : ''}
        </p>
      )}
      {loading && (
        <p role="status" className="notification-loading">
          Loading notifications…
        </p>
      )}
      {!loading && !error && !records.length && (
        <div className="notification-empty">
          <div className="notification-empty-mascot" aria-hidden="true">
            <HouseMateMascot />
          </div>
          <h2>
            {scope === 'unread'
              ? 'You’re all caught up.'
              : 'A quiet inbox for now.'}
          </h2>
          <p>
            {scope === 'unread'
              ? 'New updates will appear here.'
              : 'Household updates and reminders will appear here.'}
          </p>
        </div>
      )}
      {groups
        .filter((group) => group.items.length)
        .map((group) => (
          <div key={group.label} className="notification-group">
            <h2>{group.label}</h2>
            <ul>
              {group.items.map((item) => {
                const Icon = categoryIcons[item.category] ?? Bell;
                const important =
                  item.priority === 'important' || item.priority === 'urgent';
                const fullTime = fullTimeFormatter.format(
                  new Date(item.createdAt),
                );
                const shortTime = (
                  group.label === 'Earlier' ? earlierFormatter : timeFormatter
                ).format(new Date(item.createdAt));
                return (
                  <li
                    key={item.id}
                    className={`notification-row history-row ${item.readAt ? '' : 'is-unread'}`}
                  >
                    <Link
                      href={item.href}
                      className="notification-record-link"
                      onClick={() => {
                        if (!item.readAt) void mark(item.id);
                      }}
                    >
                      <span className="notification-category-icon">
                        <Icon size={19} aria-hidden="true" />
                      </span>
                      <div className="notification-row-copy">
                        <div className="notification-row-meta">
                          <span>
                            {item.category === 'money'
                              ? 'Expenses'
                              : item.category}
                          </span>
                          <time dateTime={item.createdAt} title={fullTime}>
                            {shortTime}
                          </time>
                        </div>
                        <div className="notification-row-title">
                          <h3>{item.title}</h3>
                          {!item.readAt && (
                            <span className="notification-unread-dot">
                              <span className="sr-only">Unread</span>
                            </span>
                          )}
                        </div>
                        <p>{item.body}</p>
                        {important && (
                          <span
                            className={`notification-priority ${item.priority === 'urgent' ? 'is-urgent' : ''}`}
                          >
                            {item.priority}
                          </span>
                        )}
                      </div>
                      <ArrowRight
                        className="notification-row-arrow"
                        size={16}
                        aria-hidden="true"
                      />
                    </Link>
                    {!item.readAt && (
                      <Button
                        className="notification-mark-read"
                        variant="ghost"
                        size="icon"
                        aria-label={`Mark ${item.title} read`}
                        title="Mark read"
                        disabled={!!reading}
                        onClick={() => void mark(item.id)}
                      >
                        <Check size={17} aria-hidden="true" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      {cursor && (
        <div className="notification-load-more">
          <Button
            variant="ghost"
            disabled={loadingMore || loading}
            onClick={() => void more()}
          >
            {loadingMore ? 'Loading…' : 'Load older notifications'}
          </Button>
        </div>
      )}
    </section>
  );
}
