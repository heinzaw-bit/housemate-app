const recordDateFormatter = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** Format API calendar dates and event timestamps without changing calendar dates. */
export function formatRecordDate(value: string): string {
  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value,
  );
  return Number.isNaN(parsed.getTime())
    ? 'Date unavailable'
    : recordDateFormatter.format(parsed);
}
