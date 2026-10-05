// Private, short-lived browser snapshots. Never used to answer an API request.
export const recentReadLifetimeMs = 60_000;
const maximumEntries = 64;
export interface RecentRead<T> {
  value: T;
  readAt: number;
}
const reads = new Map<string, RecentRead<unknown>>();
let generation = 0;
export function readGeneration() {
  return generation;
}
export function householdReadPath(householdId: string, resource: string) {
  return `/v1/households/${encodeURIComponent(householdId)}/${resource}`;
}
function cacheable(path: string) {
  const [base, query] = path.split('?');
  if (
    !/^\/v1\/households\/[^/]+\/(dashboard|balances|members|expenses|bills|settlements|announcements|events)$/.test(
      base,
    )
  )
    return false;
  const params = new URLSearchParams(query);
  return (
    (!params.has('offset') || params.get('offset') === '0') &&
    (!params.has('limit') || params.get('limit') === '50')
  );
}
export function recentRead<T>(
  token: string,
  path: string,
): RecentRead<T> | null {
  if (typeof window === 'undefined') return null;
  const key = `${token}:${path}`;
  const read = reads.get(key);
  if (!read) return null;
  if (Date.now() - read.readAt >= recentReadLifetimeMs) return null;
  return read as RecentRead<T>;
}
export function rememberRead(
  token: string,
  path: string,
  value: unknown,
  version: number,
) {
  if (
    typeof window === 'undefined' ||
    version !== generation ||
    !cacheable(path)
  )
    return;
  const key = `${token}:${path}`;
  reads.delete(key);
  reads.set(key, { value, readAt: Date.now() });
  while (reads.size > maximumEntries) {
    const oldest = reads.keys().next().value;
    if (oldest === undefined) break;
    reads.delete(oldest);
  }
}
export function clearRecentReads() {
  reads.clear();
  generation += 1;
}
