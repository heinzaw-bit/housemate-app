'use client';

import { useEffect } from 'react';
import {
  type InstallPrompt,
  rememberInstallPrompt,
} from '@/lib/install-prompt';

export function ServiceWorkerRegister() {
  useEffect(() => {
    const install = (event: Event) => {
      event.preventDefault();
      rememberInstallPrompt(event as InstallPrompt);
    };
    const installed = () => rememberInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', installed);
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let lastChecked = 0;
    const cleanups: (() => void)[] = [];
    const ready = () => {
      if (
        !disposed &&
        registration?.waiting &&
        navigator.serviceWorker.controller
      )
        window.dispatchEvent(
          new CustomEvent('housemate.update.ready', {
            detail: registration.waiting,
          }),
        );
    };
    const check = () => {
      ready();
      if (
        document.visibilityState !== 'visible' ||
        !navigator.onLine ||
        Date.now() - lastChecked < 60_000
      )
        return;
      lastChecked = Date.now();
      void registration?.update().catch(() => {});
    };
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((result) => {
          if (disposed) return;
          registration = result;
          const watch = () => {
            const worker = result.installing;
            if (!worker) return;
            const changed = () => {
              if (worker.state === 'installed') ready();
            };
            worker.addEventListener('statechange', changed);
            cleanups.push(() =>
              worker.removeEventListener('statechange', changed),
            );
          };
          result.addEventListener('updatefound', watch);
          cleanups.push(() => result.removeEventListener('updatefound', watch));
          watch();
          check();
        })
        .catch(() => {});
      window.addEventListener('focus', check);
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', check);
    }
    return () => {
      disposed = true;
      window.removeEventListener('beforeinstallprompt', install);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
      cleanups.forEach((cleanup) => {
        cleanup();
      });
    };
  }, []);
  return null;
}
