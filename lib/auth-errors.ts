type AuthFailure = {
  code?: string;
  message?: string;
  status?: number;
};

export function describeAuthFailure(
  failure: AuthFailure | null | undefined,
  action: 'email' | 'google' | 'callback' | 'session' | 'signout',
): string {
  const code = failure?.code?.toLowerCase() ?? '';
  const message = failure?.message?.toLowerCase() ?? '';
  const detail = `${code} ${message}`;

  if (
    /rate.limit|too.many|over_email_send_rate_limit|over_request_rate_limit/.test(
      detail,
    )
  ) {
    return 'Supabase has temporarily limited sign-in emails. Check the address you entered, then try again later.';
  }
  if (/otp_expired|expired|already.used|invalid_grant/.test(detail)) {
    return 'This sign-in link has expired or was already used. Request a new link.';
  }
  if (/provider.*(disabled|not.enabled)|unsupported.provider/.test(detail)) {
    return 'Google sign-in is not configured for this project yet. Use an email link for now.';
  }
  if (/access_denied|cancelled|canceled/.test(detail)) {
    return 'Sign-in was canceled. You can try again.';
  }
  if (/network|fetch|offline/.test(detail)) {
    return 'Could not reach the sign-in service. Check your connection and try again.';
  }

  switch (action) {
    case 'email':
      return 'Could not send a sign-in link. Check the email address and try again.';
    case 'google':
      return 'Google sign-in could not start. Try again or use an email link.';
    case 'session':
      return 'Your previous sign-in could not be restored. Please sign in again.';
    case 'signout':
      return 'Could not sign out. Check your connection and try again.';
    default:
      return 'Sign-in could not be completed. Please try again.';
  }
}

const redirectErrorKeys = ['error', 'error_code', 'error_description'];

export function readAuthRedirectError(href: string): {
  message: string;
  cleanedUrl: string;
} | null {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const code =
    fragment.get('error_code') ??
    url.searchParams.get('error_code') ??
    fragment.get('error') ??
    url.searchParams.get('error');
  const description =
    fragment.get('error_description') ??
    url.searchParams.get('error_description');
  if (!code && !description) return null;

  for (const key of redirectErrorKeys) {
    url.searchParams.delete(key);
    fragment.delete(key);
  }
  url.hash = fragment.size ? `#${fragment.toString()}` : '';
  return {
    message: describeAuthFailure(
      { code: code ?? undefined, message: description ?? undefined },
      'callback',
    ),
    cleanedUrl: `${url.pathname}${url.search}${url.hash}`,
  };
}
