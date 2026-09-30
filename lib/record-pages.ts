export function appendRecords<T extends { id: string }>(
  previous: T[],
  page: T[],
): T[] {
  const seen = new Set(previous.map((record) => record.id));
  const additions = page.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
  return [...previous, ...additions];
}
