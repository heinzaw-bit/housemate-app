// Push messages are invalidations only. All private records are fetched through the API.
export function listenForNotificationPush(refresh: () => void) {
  if (!('serviceWorker' in navigator)) return () => {};
  const receive = (event: MessageEvent) => {
    if (event.data?.type === 'housemate.push.received') refresh();
  };
  navigator.serviceWorker.addEventListener('message', receive);
  return () => navigator.serviceWorker.removeEventListener('message', receive);
}
