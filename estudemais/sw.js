// Estude+ — cache simples do app (rede primeiro, cache se estiver offline). Nunca guarda chamadas ao Supabase.
const VERSAO = 'estude-v3';
const ARQUIVOS = ['./', 'index.html', 'styles.css?v=3', 'efeitos.js?v=3', 'app.js?v=3', 'voz.js?v=3', 'biblioteca.js?v=3', 'tutor.js?v=3', 'comunidade.js?v=3',
  'fontes/shantell-sans.woff2', 'fontes/atkinson-next.woff2', 'fontes/atkinson-next-italic.woff2', 'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
