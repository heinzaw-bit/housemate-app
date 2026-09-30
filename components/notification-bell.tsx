'use client';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getNotifications } from '@/lib/api';

export function NotificationBell({
  token,
  householdId,
}: {
  token: string;
  householdId: string;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = async () => {
      const id = ++request;
      try {
        const page = await getNotifications(
          token,
          householdId,
          'unread',
          undefined,
          1,
        );
        if (active && id === request) {
          setCount(page.unreadCount);
          setError(false);
        }
      } catch {
        if (active && id === request) {
          setCount(null);
          setError(true);
        }
      }
    };
    const onReturn = () => {
      if (document.visibilityState === 'visible' && navigator.onLine)
        void refresh();
    };
    void refresh();
    const timer = window.setInterval(onReturn, 30_000);
    window.addEventListener('focus', onReturn);
    window.addEventListener('online', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('housemate.notifications.changed', onReturn);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('online', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('housemate.notifications.changed', onReturn);
    };
  }, [token, householdId]);
  return (
    <Link
      href={`/notifications?household=${encodeURIComponent(householdId)}`}
      className="relative inline-flex size-9 items-center justify-center rounded-full hover:bg-muted"
      aria-label={
        error
          ? 'Notifications; unread count unavailable'
          : `Notifications${count !== null ? `, ${count} unread` : ''}`
      }
      title={error ? 'Open inbox to retry' : 'Notifications'}
    >
      <Bell size={19} aria-hidden="true" />
      {!!count && (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold text-primary-foreground">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
