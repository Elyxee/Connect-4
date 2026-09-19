const CACHE_NAME = "c4-notes-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./board-art.png",
  "./assets/red-chip.png",
  "./assets/yellow-chip.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Network-first so asset format fixes (and CSS) aren't stuck behind stale SW cache.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok && request.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
  );
});
