import type { ErrorEvent } from '@sentry/nextjs';

// Independent client policy: discard every field except static diagnostic locations.
export function sanitizeErrorEvent(event: ErrorEvent): ErrorEvent {
  const values = event.exception?.values?.map((exception) => ({
    type: [
      'Error',
      'TypeError',
      'RangeError',
      'ReferenceError',
      'SyntaxError',
    ].includes(exception.type ?? '')
      ? exception.type
      : 'Error',
    value: 'Unexpected HouseMate error (details withheld)',
    stacktrace: {
      frames:
        exception.stacktrace?.frames?.flatMap((frame) => {
          const file = frame.filename?.replaceAll('\\', '/').split(/[?#]/)[0];
          const match = file?.match(
            /(?:^|\/)((?:app|components|lib|_next\/static|\.next\/server)\/[A-Za-z0-9_./-]+\.[cm]?[jt]sx?)$/,
          );
          if (!match) return [];
          return [
            {
              filename: match[1],
              lineno: frame.lineno,
              colno: frame.colno,
              function: /^[A-Za-z0-9_.$<> ]{1,100}$/.test(frame.function ?? '')
                ? frame.function
                : undefined,
            },
          ];
        }) ?? [],
    },
  }));
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: 'javascript',
    environment: 'production',
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    level: 'error',
    exception: {
      values: values?.length
        ? values
        : [
            {
              type: 'Error',
              value: 'Unexpected HouseMate error (details withheld)',
            },
          ],
    },
    fingerprint: [
      values?.[0]?.type ?? 'Error',
      values?.[0]?.stacktrace.frames?.at(-1)?.filename ?? 'unknown',
    ],
  };
}

export const reportingOptions = {
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
    frameContextLines: 0,
  },
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSendLog: () => null,
  tracePropagationTargets: [],
  sendClientReports: false,
  autoSessionTracking: false,
  beforeSend: sanitizeErrorEvent,
  beforeBreadcrumb: () => null,
};
