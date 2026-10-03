'use client';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ApiRequestError,
  getNotificationPreferences,
  getNotifications,
  type NotificationItem,
} from '@/lib/api';
import {
  clearPopupCheckpoint,
  getPopupCheckpoint,
  isNewNotification,
  isPopupNotification,
  notificationTime,
  savePopupCheckpoint,
} from '@/lib/notification-popups';
import { NotificationPopups } from './notification-popups';

export function NotificationBell({
  token,
  householdId,
  accountId,
}: {
  token: string;
  householdId: string;
  accountId: string;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [popups, setPopups] = useState<NotificationItem[]>([]);
  const dismiss = useCallback((id: string) => {
    setPopups((items) => items.filter((item) => item.id !== id));
  }, []);
  useEffect(() => {
    let active = true;
    let busy = false;
    const canRefresh = () =>
      active && document.visibilityState === 'visible' && navigator.onLine;
    const refresh = async () => {
      if (busy || !canRefresh()) return;
      busy = true;
      try {
        let page = await getNotifications(
          token,
          householdId,
          'all',
          undefined,
          50,
        );
        if (!canRefresh()) return;
        const count = page.unreadCount;
        const checkpoint = getPopupCheckpoint(accountId, householdId);
        const cutoff =
          checkpoint?.time ??
          (page.notifications[0] ? notificationTime(page.notifications[0]) : 0);
        let items = page.notifications;
        let last = page.notifications.at(-1);
        // Read every page at/above the boundary, including ties within one ms.
        // Advance the checkpoint only after the entire refresh succeeds.
        while (page.nextCursor && last && notificationTime(last) >= cutoff) {
          page = await getNotifications(
            token,
            householdId,
            'all',
            page.nextCursor,
            50,
          );
          if (!canRefresh()) return;
          items = [...items, ...page.notifications];
          last = page.notifications.at(-1);
        }
        items = [...new Map(items.map((item) => [item.id, item])).values()];
        const fresh = checkpoint
          ? items.filter(
              (item) =>
                item.householdId === householdId &&
                isNewNotification(item, checkpoint) &&
                isPopupNotification(item),
            )
          : [];
        let allowed: NotificationItem[] = [];
        if (fresh.length) {
          const preferences = await getNotificationPreferences(
            token,
            householdId,
          );
          if (!canRefresh()) return;
          allowed = fresh.filter(
            (item) => preferences.categories[item.category]?.inApp,
          );
        }
        if (!canRefresh()) return;
        savePopupCheckpoint(accountId, householdId, items);
        setCount(count);
        setError(false);
        if (allowed.length)
          setPopups((current) => {
            const next = [
              ...new Map(
                [...current, ...allowed.reverse()].map((item) => [
                  item.id,
                  item,
                ]),
              ).values(),
            ];
            // Keep the screen quiet; every extra notification stays in the inbox.
            return next.slice(-3);
          });
      } catch (failure) {
        if (active) {
          setCount(null);
          setError(true);
          if (
            failure instanceof ApiRequestError &&
            [401, 403, 404].includes(failure.status)
          ) {
            setPopups([]);
            clearPopupCheckpoint(accountId, householdId);
          }
        }
      } finally {
        busy = false;
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
  }, [token, householdId, accountId]);
  return (
    <>
      <Link
        href={`/notifications?household=${encodeURIComponent(householdId)}`}
        className="header-icon-button header-icon-button-plain"
        aria-label={
          error
            ? 'Notifications; unread count unavailable'
            : `Notifications${count !== null ? `, ${count} unread` : ''}`
        }
        title={error ? 'Open inbox to retry' : 'Notifications'}
      >
        <Bell size={20} strokeWidth={2} aria-hidden="true" />
        {!!count && (
          <span className="absolute right-0 top-0 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold text-primary-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Link>
      <NotificationPopups items={popups} dismiss={dismiss} />
    </>
  );
}
