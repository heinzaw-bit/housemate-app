import type { FinancialHistoryEvent } from './api';

export function historyEventKey(event: FinancialHistoryEvent): string {
  return `${event.kind}:${event.id}`;
}

export function mergeHistoryEvents(
  current: FinancialHistoryEvent[],
  incoming: FinancialHistoryEvent[],
): FinancialHistoryEvent[] {
  const seen = new Set(current.map(historyEventKey));
  const merged = [...current];
  for (const event of incoming) {
    const key = historyEventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }
  return merged;
}
