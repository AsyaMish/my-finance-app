const CACHE_NAME = 'finance-app-v7';
const ASSETS = [
  './', './index.html', './style.css',
  './script.js', './manifest.json', './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null)))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Навигация (index.html): сначала сеть, кэш — только для офлайна
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Остальные файлы: кэш + фоновое обновление на следующий запуск
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fresh = fetch(e.request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
        return r;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});