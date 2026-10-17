/* Service worker: deja la aplicación disponible sin internet y muestra avisos de llamados. */
const V = 'cbv-campo-v3';
const BASE = ['./', 'index.html', 'config.js', 'esquema.js', 'jszip.min.js', 'gen.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'plantillas/reporte_emergencias.xlsx'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(BASE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
/* toque en un aviso (o en «Unidad activa» / «Omitir») */
self.addEventListener('notificationclick', e => {
  const n = e.notification; n.close();
  const d = n.data || {}; const url = new URL(d.url || './', self.registration.scope);
  const id = url.searchParams.get('llamado');
  const accion = e.action || '';
  if (accion === 'omitir') return;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs[0];
    if (c) { c.focus(); if (id) c.postMessage({ llamado: id, accion: accion || 'ver' }); return; }
    if (id && accion === 'activa') url.searchParams.set('acc', 'activa');
    return self.clients.openWindow(url.href);
  }));
});
