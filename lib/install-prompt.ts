'use client';
import { useSyncExternalStore } from 'react';

export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let prompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();
export function rememberInstallPrompt(next: InstallPrompt | null) {
  prompt = next;
  listeners.forEach((listener) => {
    listener();
  });
}
const snapshot = () => prompt;
const serverSnapshot = () => null;
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useInstallPrompt() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
