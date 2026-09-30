import { expect, test } from 'vitest';
import { describeAuthFailure, readAuthRedirectError } from '../lib/auth-errors';

test('email rate limits have an actionable message without exposing server wording', () => {
  expect(
    describeAuthFailure(
      {
        code: 'over_email_send_rate_limit',
        message: 'email rate limit exceeded',
      },
      'email',
    ),
  ).toContain('Check the address you entered');
});

test('disabled Google provider points to the usable sign-in method', () => {
  expect(
    describeAuthFailure(
      { message: 'Unsupported provider: provider is not enabled' },
      'google',
    ),
  ).toContain('Use an email link');
});

test('failed callback in the URL becomes a friendly message and can be cleared', () => {
  const result = readAuthRedirectError(
    'http://localhost:3000/?next=home#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
  );
  expect(result?.message).toContain('expired or was already used');
  expect(result?.cleanedUrl).toBe('/?next=home');
});

test('successful implicit callback tokens are left for Supabase to process', () => {
  expect(
    readAuthRedirectError(
      'http://localhost:3000/#access_token=token&refresh_token=refresh',
    ),
  ).toBeNull();
});
