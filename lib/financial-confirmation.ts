import { ApiRequestError } from './api';

export function confirmationFailure(
  cause: unknown,
  action: string,
  keyed = true,
): string {
  if (
    !keyed &&
    cause instanceof ApiRequestError &&
    (cause.status === 0 ||
      cause.status >= 500 ||
      cause.code === 'INVALID_RESPONSE')
  )
    return `Not yet confirmed: HouseMate could not verify this ${action}. Reconnect and reload the related record to check its current state before trying again. Nothing is retried automatically.`;
  if (cause instanceof ApiRequestError && cause.code === 'OFFLINE')
    return `Not yet confirmed: this ${action} was not sent because you are offline. Keep this review open, reconnect, and retry.`;
  if (
    cause instanceof ApiRequestError &&
    (cause.status === 0 ||
      cause.status >= 500 ||
      cause.code === 'INVALID_RESPONSE')
  )
    return `Not yet confirmed: HouseMate could not verify this ${action}. It may have been saved. Keep this review open and retry the same confirmation after reconnecting; its retry key prevents a duplicate. Nothing is retried automatically.`;
  return cause instanceof Error
    ? cause.message
    : `Could not confirm this ${action}. Keep the review open and retry to check its status.`;
}
