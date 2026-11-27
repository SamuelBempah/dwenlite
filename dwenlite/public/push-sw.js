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

// Share to Dwenlite from the phone's Share menu: keep what was shared, then open Dwenlite Home to use it.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return;
  event.respondWith((async () => {
    try {
      const form = await event.request.formData();
      const cache = await caches.open('dwenlite-share');
      await cache.put('/__shared/meta', new Response(JSON.stringify({ title: form.get('title') || '', text: form.get('text') || '', url: form.get('url') || '' }), { headers: { 'Content-Type': 'application/json' } }));
      const files = form.getAll('files').filter((f) => f && typeof f !== 'string').slice(0, 10);
      for (let i = 0; i < files.length; i++) await cache.put('/__shared/' + i, new Response(files[i], { headers: { 'X-Name': encodeURIComponent(files[i].name || 'file'), 'X-Type': files[i].type || 'application/octet-stream' } }));
    } catch (e) { /* open the app anyway */ }
    return Response.redirect('/dwenlite-home?shared=1', 303);
  })());
});
