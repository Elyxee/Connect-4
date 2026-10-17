/* Offline cache for the PWA build. Network first; the cache is the fallback.
   Bump the version with `node scripts/bump-version.cjs` after changing files:
   it updates CACHE_NAME and every ?v= query in index.html and this file. */
const CACHE_NAME = "c4-notes-main-v50";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",

  // Code (same order as index.html)
  "./src/style.css?v=50",
  "./src/config.js?v=50",
  "./src/home-drag.js?v=50",
  "./src/home-flow.js?v=50",
  "./src/home-fx.js?v=50",
  "./src/experience.js?v=50",
  "./src/game.js?v=50",
  "./src/board-renderer.js?v=50",
  "./src/note-canvas.js?v=50",
  "./src/timeline.js?v=50",
  "./src/clock.js?v=50",
  "./src/orbit.js?v=50",
  "./src/modules.js?v=50",
  "./src/app.js?v=50",
  "./src/background-flow.js?v=50",
  "./src/home-motion.js?v=50",

  "./assets/fonts/chalkboard-regular.ttf",
  "./assets/fonts/chalkboard-bold.ttf",

  // Home
  "./assets/home/vector/logo.svg?v=50",
  "./assets/home/vector/new.svg?v=50",
  "./assets/home/vector/continue.svg?v=50",
  "./assets/home/vector/recent.svg?v=50",
  "./assets/home/vector/chip-red.svg?v=50",
  "./assets/home/vector/chip-gold.svg?v=50",
  "./assets/home/vector/heart.svg?v=50",
  "./assets/home/vector/swan.svg?v=50",
  "./assets/home/vector/bulb.svg?v=50",
  "./assets/home/vector/controller.svg?v=50",
  "./assets/home/vector/star-left.svg?v=50",
  "./assets/home/vector/star-bottom.svg?v=50",
  "./assets/home/vector/burst.svg?v=50",
  "./assets/home/vector/bubble.svg?v=50",
  "./assets/home/vector/chip-bottom.svg?v=50",
  "./assets/home/vector/chip-corner.svg?v=50",
  "./assets/home/vector/chip-edge.svg?v=50",
  "./assets/home/vector/bolt.svg?v=50",
  "./assets/home/vector/new-rays-left.svg?v=50",
  "./assets/home/vector/new-rays-right.svg?v=50",
  "./assets/home/vector/logo-rays-left.svg?v=50",
  "./assets/home/vector/logo-rays-right.svg?v=50",
  // Button artwork again, unversioned, as the gloss masks in style.css.
  "./assets/home/vector/new.svg",
  "./assets/home/vector/continue.svg",
  "./assets/home/vector/recent.svg",

  // Game screen
  "./assets/figma/main-connect-sharp.svg?v=50",
  "./assets/figma/main-4live-sharp.svg?v=50",
  "./assets/figma/swan-painter.png?v=50",
  "./assets/figma/board-live.png",
  "./assets/figma/chip-red-enamel.svg",
  "./assets/figma/chip-yellow-enamel.svg",
  "./assets/figma/main-minigame.png",
  "./assets/figma/gamepad.png",

  // Bottom-right module
  "./assets/modules/arrow.png",
  "./assets/modules/clock-cover.png",
  "./assets/modules/clock-logo.png",
  "./assets/modules/clock-title.png",
  "./assets/modules/orbit-bg.png",
  "./assets/modules/orbit-dial.png",
  "./assets/modules/orbit-logo.png",
  "./assets/modules/life-white.png",
  "./assets/modules/life-gold.png",
  "./assets/modules/life-red.png",
  "./assets/clock/setup.png",
  "./assets/clock/red-active.png",
  "./assets/clock/yellow-active.png",
  "./assets/clock/full-red.png",
  "./assets/clock/full-yellow.png",
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("c4-notes-") && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

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
