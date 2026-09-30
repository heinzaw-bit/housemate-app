import type { NotificationItem } from './api';

export interface PopupCheckpoint {
  time: number;
  ids: string[];
}

// Metadata only, retained across route changes in this tab. No feed text or JWTs.
const checkpoints = new Map<string, PopupCheckpoint>();
const keyFor = (accountId: string, householdId: string) =>
  `${accountId}:${householdId}`;

export function getPopupCheckpoint(accountId: string, householdId: string) {
  return checkpoints.get(keyFor(accountId, householdId));
}

export function clearPopupCheckpoint(accountId: string, householdId: string) {
  checkpoints.delete(keyFor(accountId, householdId));
}

export function savePopupCheckpoint(
  accountId: string,
  householdId: string,
  items: NotificationItem[],
) {
  const key = keyFor(accountId, householdId);
  const previous = checkpoints.get(key);
  const time = items.reduce(
    (latest, item) => Math.max(latest, notificationTime(item)),
    previous?.time ?? 0,
  );
  const ids = new Set(previous?.time === time ? previous.ids : []);
  for (const item of items)
    if (notificationTime(item) === time) ids.add(item.id);
  checkpoints.set(key, { time, ids: [...ids] });
}

export function notificationTime(item: NotificationItem) {
  return Date.parse(item.createdAt);
}

export function isNewNotification(
  item: NotificationItem,
  checkpoint: PopupCheckpoint,
) {
  const time = notificationTime(item);
  return (
    time > checkpoint.time ||
    (time === checkpoint.time && !checkpoint.ids.includes(item.id))
  );
}

export function isPopupNotification(item: NotificationItem) {
  if (item.readAt) return false;
  return (
    (item.entityType === 'announcement' && item.title === 'New announcement') ||
    (item.entityType === 'chore' &&
      ['Chore assigned', 'Chore reassigned'].includes(item.title)) ||
    (item.entityType === 'shopping' && item.title === 'Shopping item added')
  );
}
