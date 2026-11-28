// Service worker: tiene in cache l'interfaccia (si apre anche senza rete,
// con gli ultimi dati scaricati) e mostra le notifiche push mandate dal Mac.
const CACHE = 'casa-bologna-v1';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icone/icona-192.png', 'aree.geojson', 'comuni.geojson'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Prima la rete (i dati cambiano ogni giro), la cache solo se la rete manca.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match(e.request).then(r => r ?? caches.match('index.html'))));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Casa a Bologna', body: e.data?.text() ?? '' }; }
  e.waitUntil(self.registration.showNotification(d.title ?? 'Casa a Bologna', {
    body: d.body ?? '', icon: 'icone/icona-192.png', badge: 'icone/icona-192.png',
    data: { url: d.url ?? './' }, tag: d.tag, renotify: !!d.tag,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url ?? './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { c.navigate(target); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
