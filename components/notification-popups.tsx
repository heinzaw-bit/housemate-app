'use client';

import { Bell, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { NotificationItem } from '@/lib/api';

function Popup({
  item,
  dismiss,
}: {
  item: NotificationItem;
  dismiss: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(
    () => document.visibilityState === 'visible',
  );
  useEffect(() => {
    const onVisibility = () =>
      setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    if (hovered || focused || !visible) return;
    const timer = window.setTimeout(() => dismiss(item.id), 8_000);
    return () => clearTimeout(timer);
  }, [item.id, dismiss, hovered, focused, visible]);
  return (
    <article
      className="notification-popup"
      aria-label={item.title}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <Bell size={20} className="notification-popup-icon" aria-hidden="true" />
      <div className="notification-popup-content">
        <p className="font-semibold">{item.title}</p>
        <p className="notification-popup-body">{item.body}</p>
        <Link
          href={item.href}
          prefetch={false}
          className="notification-popup-view"
          onClick={() => dismiss(item.id)}
          aria-label={`View ${item.body || item.title}`}
        >
          View
        </Link>
      </div>
      <button
        type="button"
        className="notification-popup-dismiss"
        aria-label={`Dismiss ${item.title}`}
        onClick={() => dismiss(item.id)}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </article>
  );
}

export function NotificationPopups({
  items,
  dismiss,
}: {
  items: NotificationItem[];
  dismiss: (id: string) => void;
}) {
  return (
    <aside className="notification-popups" aria-label="New notifications">
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {items.map((item) => `${item.title}: ${item.body}`).join('. ')}
      </div>
      {items.map((item) => (
        <Popup key={item.id} item={item} dismiss={dismiss} />
      ))}
    </aside>
  );
}
