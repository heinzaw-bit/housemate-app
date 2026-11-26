import { clearRecentReads } from './recent-reads';

const channelName = 'housemate:bill-updates';
const subscribers = new Map<string, Set<() => void>>();
let channel: BroadcastChannel | null = null;

function openChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel !== 'function')
    return null;
  try {
    return new BroadcastChannel(channelName);
  } catch {
    return null;
  }
}

export function subscribeToBillUpdates(
  householdId: string,
  refresh: () => void,
) {
  if (!channel) {
    channel = openChannel();
    if (!channel) return () => {};
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string') return;
      const listeners = subscribers.get(event.data);
      if (!listeners?.size) return;
      clearRecentReads();
      for (const listener of listeners) listener();
    };
  }
  const listeners = subscribers.get(householdId) ?? new Set<() => void>();
  listeners.add(refresh);
  subscribers.set(householdId, listeners);
  return () => {
    listeners.delete(refresh);
    if (!listeners.size) subscribers.delete(householdId);
    if (!subscribers.size) {
      channel?.close();
      channel = null;
    }
  };
}

export function publishBillUpdate(householdId: string) {
  // Send only the household selector. Each tab reads its own authorized data.
  const sender = channel ?? openChannel();
  try {
    sender?.postMessage(householdId);
  } catch {
    // A tab that cannot receive the signal still has regular refreshes.
  } finally {
    if (sender !== channel) sender?.close();
  }
}
