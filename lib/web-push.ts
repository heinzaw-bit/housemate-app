import { disablePushDevice, registerPushDevice } from './api';

const deviceKey = 'housemate.pushDevice';
interface LocalDevice {
  accountId: string;
  id: string;
  endpoint: string;
}
export function localPushDevice(): LocalDevice | null {
  try {
    const value = JSON.parse(localStorage.getItem(deviceKey) ?? 'null');
    return value &&
      typeof value.id === 'string' &&
      typeof value.accountId === 'string' &&
      typeof value.endpoint === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}
export function supportsWebPush(): boolean {
  return (
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}
export function applicationServerKey(
  publicKey: string,
): Uint8Array<ArrayBuffer> {
  const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
function registrationPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth)
    throw Error('This browser did not return valid push keys.');
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}
export async function enableBrowserPush(
  token: string,
  accountId: string,
  publicKey: string,
) {
  if (!supportsWebPush())
    throw Error(
      'This browser does not support web push here. Use HTTPS or localhost; some phones require installing HouseMate first.',
    );
  if (Notification.permission === 'denied')
    throw Error(
      'Notifications are blocked. Allow them in your browser site settings, then try again.',
    );
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw Error(
      'Notifications were not enabled. Your in-app inbox still works.',
    );
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  const previous = localPushDevice();
  const expectedKey = applicationServerKey(publicKey);
  const existingKey = subscription?.options.applicationServerKey;
  const differentKey =
    existingKey &&
    Array.from(new Uint8Array(existingKey)).join(',') !==
      Array.from(expectedKey).join(',');
  if (
    subscription &&
    ((previous && previous.accountId !== accountId) || differentKey)
  ) {
    await subscription.unsubscribe();
    subscription = null;
  }
  const newlyCreated = !subscription;
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expectedKey,
  });
  try {
    const device = await registerPushDevice(
      token,
      registrationPayload(subscription),
    );
    localStorage.setItem(
      deviceKey,
      JSON.stringify({
        accountId,
        id: device.id,
        endpoint: subscription.endpoint,
      }),
    );
    return device;
  } catch (error) {
    if (newlyCreated) await subscription.unsubscribe();
    throw error;
  }
}
export async function refreshBrowserPush(token: string, accountId: string) {
  const previous = localPushDevice();
  if (
    !previous ||
    previous.accountId !== accountId ||
    !supportsWebPush() ||
    Notification.permission !== 'granted'
  )
    return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  // Never recreate a subscription silently or re-enable a device disabled from another browser.
  if (!subscription) {
    await disablePushDevice(token, previous.id).catch(() => {});
    localStorage.removeItem(deviceKey);
    return;
  }
  const { getPushDevices } = await import('./api');
  const saved = (await getPushDevices(token)).find(
    (device) => device.id === previous.id,
  );
  if (!saved?.enabled) {
    await subscription.unsubscribe();
    localStorage.removeItem(deviceKey);
    return;
  }
  const device = await registerPushDevice(token, {
    ...registrationPayload(subscription),
    refreshOnly: true,
  });
  localStorage.setItem(
    deviceKey,
    JSON.stringify({
      accountId,
      id: device.id,
      endpoint: subscription.endpoint,
    }),
  );
}
export async function disableBrowserPush(token?: string) {
  const previous = localPushDevice();
  let failure: unknown;
  if (previous && token) {
    try {
      await disablePushDevice(token, previous.id);
    } catch (error) {
      failure = error;
    }
  }
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  }
  localStorage.removeItem(deviceKey);
  if (failure) throw failure;
}
