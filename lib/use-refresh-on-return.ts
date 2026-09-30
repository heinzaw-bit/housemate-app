'use client';
import { useEffect, useRef } from 'react';

export function useRefreshOnReturn(
  refresh: () => void | Promise<void>,
  enabled = true,
) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const returned = () => {
      if (
        document.visibilityState !== 'visible' ||
        !navigator.onLine ||
        Date.now() - last < 1000
      )
        return;
      last = Date.now();
      void latest.current();
    };
    window.addEventListener('online', returned);
    window.addEventListener('focus', returned);
    document.addEventListener('visibilitychange', returned);
    return () => {
      window.removeEventListener('online', returned);
      window.removeEventListener('focus', returned);
      document.removeEventListener('visibilitychange', returned);
    };
  }, [enabled]);
}
