import * as Sentry from '@sentry/nextjs';
import type { Instrumentation } from 'next';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs')
    await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (!Sentry.isEnabled()) return;
  Sentry.captureRequestError(...args);
  await Sentry.flush(2000).catch(() => false);
};
