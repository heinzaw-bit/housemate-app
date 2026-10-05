'use client';

import { Bell, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationItem } from '@/lib/api';

function Popup({
  item,
  dismiss,
}: {
  item: NotificationItem;
  dismiss: (id: string) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const closing = useRef(false);
  const exitTimer = useRef<number | null>(null);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      dismiss(item.id);
      return;
    }
    setLeaving(true);
    exitTimer.current = window.setTimeout(() => dismiss(item.id), 160);
  }, [dismiss, item.id]);
  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );
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
    const timer = window.setTimeout(close, 8_000);
    return () => clearTimeout(timer);
  }, [close, hovered, focused, visible]);
  return (
    <article
      className="notification-popup"
      data-leaving={leaving ? '' : undefined}
      aria-hidden={leaving || undefined}
      inert={leaving}
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
          onClick={close}
          aria-label={`View ${item.body || item.title}`}
        >
          View
        </Link>
      </div>
      <button
        type="button"
        className="notification-popup-dismiss"
        aria-label={`Dismiss ${item.title}`}
        onClick={close}
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
