/* Service worker do Azul: deixa o jogo abrir sem internet (bot e mesmo aparelho).
   Estratégia REDE PRIMEIRO: com internet sempre baixa a versão nova (nunca fica preso a JS velho);
   sem internet usa a última cópia guardada. Só guarda GET do próprio site e a biblioteca do Supabase (jsDelivr).
   Realtime (WebSocket) e chamadas ao Supabase NÃO passam por aqui. */
const CACHE = 'azul-shell-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isLib = url.origin === 'https://cdn.jsdelivr.net';
  if (!sameOrigin && !isLib) return; // Supabase e o resto: direto na rede

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const page = await caches.match('index.html') || await caches.match('./');
        if (page) return page;
      }
      return new Response('Sem conexão.', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
