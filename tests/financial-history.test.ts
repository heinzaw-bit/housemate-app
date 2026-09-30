import { expect, test } from 'vitest';
import type { FinancialHistoryEvent } from '../lib/api';
import { historyEventKey, mergeHistoryEvents } from '../lib/financial-history';

function event(
  id: string,
  kind: FinancialHistoryEvent['kind'],
): FinancialHistoryEvent {
  return {
    id,
    kind,
    occurredAt: '2026-09-28T00:00:00.000Z',
    actorDisplayName: 'Member',
    changes: [],
  };
}

test('history merges overlapping pages without repeating rendered keys', () => {
  const first = [event('first', 'created'), event('second', 'edited')];
  const second = [event('second', 'edited'), event('third', 'voided')];
  const merged = mergeHistoryEvents(mergeHistoryEvents([], first), second);
  expect(merged.map(historyEventKey)).toEqual([
    'created:first',
    'edited:second',
    'voided:third',
  ]);
});

test('history keeps different event kinds with the same source ID', () => {
  const merged = mergeHistoryEvents(
    [],
    [
      event('shared', 'created'),
      event('shared', 'status_changed'),
      event('shared', 'created'),
    ],
  );
  expect(merged.map(historyEventKey)).toEqual([
    'created:shared',
    'status_changed:shared',
  ]);
});
