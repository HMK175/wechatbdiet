const CACHE_NAME = "nutrition-app-cache-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // 对导航请求 / index.html：网络优先，避免更新被旧缓存卡住
  const isNavigation = req.mode === "navigate";
  const isIndexHtml = isSameOrigin && url.pathname.endsWith("/index.html");
  if (isNavigation || isIndexHtml) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  // 静态资源：缓存优先
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(resp => {
      const copy = resp.clone();
      if (isSameOrigin) {
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return resp;
    }))
  );
});

