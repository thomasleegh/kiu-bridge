// Bump CACHE_NAME whenever you ship (index.html, dict.json, icons) so installed copies refresh.
const CACHE_NAME = 'kiu-bridge-v5';
// dict.json is precached so the offline dictionary works from the first offline launch after install.
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './dict.json'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isFont = FONT_HOSTS.includes(url.hostname);
  if(url.origin !== self.location.origin && !isFont) return; // e.g. the Anthropic API — never cache

  // dict.json (~3 MB) only changes when CACHE_NAME is bumped, so serve it from cache without
  // re-downloading it on every launch. Fonts never change at a given URL either.
  if(url.pathname.endsWith('/dict.json') || isFont){
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((resp) => {
        // Font files come back opaque (no-cors) — still fine to cache and replay.
        if(resp && (resp.ok || resp.type === 'opaque')){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return resp;
      }))
    );
    return;
  }

  // Everything else: stale-while-revalidate — instant from cache, refreshed in the background.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((resp) => {
        if(resp && resp.ok){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
