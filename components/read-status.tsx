'use client';
import { recentRead } from '@/lib/recent-reads';
export function ReadStatus({
  token,
  path,
  refreshing,
  error,
}: {
  token: string;
  path: string;
  refreshing: boolean;
  error?: string;
}) {
  const snapshot = recentRead(token, path);
  if (!snapshot)
    return error ? (
      <p className="text-xs text-muted-foreground" role="status">
        Could not refresh · Shown records may be out of date.
      </p>
    ) : null;
  return (
    <p className="text-xs text-muted-foreground" role="status">
      {refreshing || error ? 'Last checked' : 'Checked'}{' '}
      {new Date(snapshot.readAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}
      {refreshing ? ' · Refreshing…' : error ? ' · May be out of date' : ''}
    </p>
  );
}
