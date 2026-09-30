'use client';

import { useEffect, useState } from 'react';
import { hasPendingWork, usePendingWork } from '@/lib/pending-work';
import { Button } from './ui/button';

export function AppStatus() {
  const [offline, setOffline] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const [activatedElsewhere, setActivatedElsewhere] = useState(false);
  const pending = usePendingWork();
  useEffect(() => {
    let wasOffline = !navigator.onLine;
    setOffline(wasOffline);
    const lost = () => {
      wasOffline = true;
      setOffline(true);
      setReconnected(false);
    };
    const restored = () => {
      setOffline(false);
      if (wasOffline) setReconnected(true);
      wasOffline = false;
    };
    const ready = (event: Event) =>
      setWaiting((event as CustomEvent<ServiceWorker>).detail);
    const serviceWorker = navigator.serviceWorker;
    let controlled = !!serviceWorker?.controller;
    const changed = () => {
      if (controlled) setActivatedElsewhere(true);
      controlled = true;
    };
    serviceWorker?.addEventListener('controllerchange', changed);
    window.addEventListener('offline', lost);
    window.addEventListener('online', restored);
    window.addEventListener('housemate.update.ready', ready);
    return () => {
      window.removeEventListener('offline', lost);
      window.removeEventListener('online', restored);
      window.removeEventListener('housemate.update.ready', ready);
      serviceWorker?.removeEventListener('controllerchange', changed);
    };
  }, []);
  async function update() {
    if (pending || updating) return;
    if (activatedElsewhere) {
      window.location.reload();
      return;
    }
    if (!waiting) return;
    setUpdating(true);
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        // A draft may have opened while the worker was activating.
        if (hasPendingWork()) {
          setActivatedElsewhere(true);
          setUpdating(false);
        } else window.location.reload();
      },
      { once: true },
    );
    waiting.postMessage({ type: 'HOUSEMATE_ACTIVATE_UPDATE' });
  }
  return (
    <aside aria-label="Connection and app updates" className="app-status">
      {offline && (
        <p role="status">
          You’re offline. Displayed information may be out of date. Keep
          unfinished reviews open; saves need a connection and are never queued
          automatically.
        </p>
      )}
      {reconnected && !offline && (
        <div role="status" className="flex flex-wrap items-center gap-3">
          <p>
            Connection restored. Views refresh as you return to them. Retry any
            unconfirmed action from its existing review.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setReconnected(false)}
          >
            Dismiss connection notice
          </Button>
        </div>
      )}
      {(waiting || activatedElsewhere) && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status">
            An app update is ready.{' '}
            {pending
              ? 'Finish or discard your open draft before updating.'
              : 'Reload when you’re ready.'}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || updating || offline}
            onClick={() => void update()}
          >
            {updating ? 'Updating…' : 'Reload to update'}
          </Button>
        </div>
      )}
    </aside>
  );
}
