import type { Dashboard } from './api';

export function moneyHref(
  householdId: string,
  view: 'expenses' | 'bills' | 'balances' | 'record-transfer',
  recordId?: string,
) {
  const params = new URLSearchParams({ household: householdId, view });
  if (recordId) params.set('record', recordId);
  return `/money?${params}`;
}

export function moneyCreateHref(
  householdId: string,
  view: 'expenses' | 'bills',
) {
  return `${moneyHref(householdId, view)}&add=1`;
}

export function activityHref(
  householdId: string,
  event: Dashboard['recentActivity'][number],
) {
  return moneyHref(
    householdId,
    event.resourceType === 'expense'
      ? 'expenses'
      : event.resourceType === 'bill'
        ? 'bills'
        : 'balances',
    event.resourceId,
  );
}

export function activityLabel(event: Dashboard['recentActivity'][number]) {
  const action = {
    created: 'added',
    edited: 'edited',
    voided: 'voided',
    paid: 'marked Paid',
    unpaid: 'marked Unpaid',
    recorded: 'reported a manual transfer',
  }[event.kind];
  return `${event.actorDisplayName} ${action}`;
}

export const dashboardStaleAfterMs = 60_000;
