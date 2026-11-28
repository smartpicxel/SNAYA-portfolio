const CACHE_NAME = 'snaya-portfolio-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'WARM_CACHE' && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(CACHE_NAME).then(async (cache) => {
        for (const url of data.urls) {
          try {
            const match = await cache.match(url);
            if (!match) {
              await cache.add(url);
            }
          } catch {
            // Skip individual failed URLs cleanly without failing batch
          }
        }
      })
    );
  } else if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.delete(CACHE_NAME));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(new URL('./', self.registration.scope).href)))
    );
    return;
  }

  // Cache-first with background revalidation for static assets (JS, CSS, 3D portraits, posters)
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    )
  );
});
