'use client';

import { useEffect, useSyncExternalStore } from 'react';

const drafts = new Set<symbol>();
const listeners = new Set<() => void>();
const snapshot = () => drafts.size > 0;
const serverSnapshot = () => false;
export const hasPendingWork = snapshot;
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!drafts.size) return;
  event.preventDefault();
  event.returnValue = '';
}
export function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const id = Symbol('open draft');
    if (!drafts.size) window.addEventListener('beforeunload', beforeUnload);
    drafts.add(id);
    listeners.forEach((listener) => {
      listener();
    });
    return () => {
      drafts.delete(id);
      if (!drafts.size)
        window.removeEventListener('beforeunload', beforeUnload);
      listeners.forEach((listener) => {
        listener();
      });
    };
  }, [active]);
}
export function usePendingWork() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
