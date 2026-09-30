import * as Sentry from '@sentry/nextjs';
import { reportingOptions } from './lib/error-reporting';

if (
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' &&
  process.env.NEXT_PUBLIC_SENTRY_DSN
) {
  Sentry.init({
    ...reportingOptions,
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: 'production',
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    defaultIntegrations: false,
    integrations: [
      Sentry.globalHandlersIntegration(),
      Sentry.browserApiErrorsIntegration(),
      Sentry.dedupeIntegration(),
    ],
  });
}
