const OFFLINE_CACHE = 'housemate-offline-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add('/offline.html')));
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'HOUSEMATE_ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('housemate-offline-') && key !== OFFLINE_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try { return await fetch(event.request, { signal: controller.signal }); }
    catch { return await caches.match('/offline.html') || new Response('HouseMate is offline. Reconnect and reload.', { status: 503, headers: { 'Content-Type': 'text/plain' } }); }
    finally { clearTimeout(timeout); }
  })());
});

function safePushHref(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin === self.location.origin && ['/house', '/money', '/notifications'].includes(url.pathname)) return url.href;
  } catch {}
  return new URL('/notifications', self.location.origin).href;
}
self.addEventListener('push', (event) => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch {}
  event.waitUntil(self.registration.showNotification('HouseMate', {
    body: 'You have a household update. Open HouseMate to see it.',
    tag: typeof message.id === 'string' ? `housemate-${message.id}` : 'housemate-update',
    renotify: false,
    data: { href: safePushHref(message.href) },
  }));
});
async function openPushTarget(href) {
  // Let the browser route the tap to the installed app. Choosing an arbitrary
  // same-origin tab ourselves can bring Chrome forward instead of HouseMate.
  // Start opening during the click, before waiting for client discovery.
  try {
    const opened = await self.clients.openWindow(href);
    if (opened) {
      // A window can already be open even when explicit focus is rejected.
      await opened.focus().catch(() => {});
      if (opened.url === href || await opened.navigate(href)) return;
    }
  } catch {}

  // If opening is unavailable, recover using a live same-origin window. Focus
  // before navigation so navigation cannot prevent the app being foregrounded.
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    try {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      if (await client.navigate(href)) return;
    } catch {}
  }
  throw new Error('Could not open the HouseMate notification.');
}
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openPushTarget(safePushHref(event.notification.data?.href)));
});
self.addEventListener('pushsubscriptionchange', (event) => {
  // No session tokens live in the service worker. Refresh securely on the next signed-in visit.
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'housemate.push.subscription-changed' }));
  }));
});
