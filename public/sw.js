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
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = safePushHref(event.notification.data?.href);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(href); await existing.focus(); }
    else await self.clients.openWindow(href);
  })());
});
self.addEventListener('pushsubscriptionchange', (event) => {
  // No session tokens live in the service worker. Refresh securely on the next signed-in visit.
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'housemate.push.subscription-changed' }));
  }));
});
