// O app saiu de /saidaescola para /estudeup: este service worker limpa o antigo e leva para o novo endereço.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) {
      const u = new URL(c.url);
      c.navigate('/estudeup/' + u.search + u.hash);
    }
  })());
});
