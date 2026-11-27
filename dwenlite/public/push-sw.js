// Notifications for Dwenlite Home (loaded by the app's service worker).
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Dwenlite Home', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Dwenlite Home', {
    body: d.body || '', icon: '/pwa-192x192.png', badge: '/pwa-192x192.png', tag: 'dwenlite-home', renotify: true, data: { url: d.url || '/dwenlite-home' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dwenlite-home';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { if (c.navigate) c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
