export const pendingInviteKey = 'housemate.pendingInvite';

const inviteTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function parseInviteInput(value: string, origin: string): string | null {
  const trimmed = value.trim();
  if (inviteTokenPattern.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.origin !== origin) return null;
    const token = url.searchParams.get('invite');
    return token && inviteTokenPattern.test(token) ? token : null;
  } catch {
    return null;
  }
}
