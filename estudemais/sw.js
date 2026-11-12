// EstudeUp — cache simples do app (rede primeiro, cache se estiver offline). Nunca guarda chamadas ao Supabase.
const VERSAO = 'estudeup-v17';
const ARQUIVOS = ['./', 'index.html', 'styles.css?v=17', 'efeitos.js?v=17', 'app.js?v=17', 'voz.js?v=17', 'biblioteca.js?v=17', 'tutor.js?v=17', 'comunidade.js?v=17', 'criador.js?v=17', 'config.js?v=17', 'vitrine.js?v=17', 'escolas.js?v=17', 'patrocinio.js?v=17', 'ingles-conteudo.js?v=17', 'ingles.js?v=17',
  'fontes/unbounded.woff2', 'fontes/atkinson-next.woff2', 'fontes/atkinson-next-italic.woff2', 'adesivos/fogo.webp', 'adesivos/caderno.webp', 'adesivos/fichas.webp', 'adesivos/capelo.webp', 'adesivos/lapis.webp', 'adesivos/trofeu.webp', 'adesivos/escola.webp', 'adesivos/camera.webp', 'adesivos/medalha3.webp',
  'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'marca/simbolo-256.webp', 'manifest.webmanifest'];

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
