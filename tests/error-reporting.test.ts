import { expect, test } from 'vitest';
import { sanitizeErrorEvent } from '../lib/error-reporting';

test('browser error payloads contain no household data, tokens or source context', () => {
  const secret = 'PRIVATE_INVITE_TOKEN';
  const event = sanitizeErrorEvent({
    type: undefined,
    message: secret,
    user: { email: secret },
    request: { url: secret, data: secret },
    extra: { expense: secret },
    breadcrumbs: [{ message: secret }],
    exception: {
      values: [
        {
          value: secret,
          type: 'TypeError',
          stacktrace: {
            frames: [
              {
                filename: `https://app.test/_next/static/chunks/app.js?invite=${secret}`,
                lineno: 10,
                vars: { secret },
                context_line: secret,
              },
            ],
          },
        },
      ],
    },
  });
  expect(JSON.stringify(event)).not.toContain(secret);
  expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.lineno).toBe(
    10,
  );
});
