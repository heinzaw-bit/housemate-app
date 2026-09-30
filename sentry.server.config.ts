import * as Sentry from '@sentry/nextjs';
import { reportingOptions } from './lib/error-reporting';

if (process.env.VERCEL_ENV === 'production' && process.env.SENTRY_DSN) {
  Sentry.init({
    ...reportingOptions,
    dsn: process.env.SENTRY_DSN,
    environment: 'production',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    defaultIntegrations: false,
  });
}
