/* Talk — service worker.
 *
 * Network-first, always. A messaging client must never run last week's code because a cache
 * said so: the previous version of this file served stale assets, which is exactly how a
 * "Connect" button ends up broken in production while the source is fine.
 *
 * The cache exists only to keep the shell usable when the network drops, never to win a race.
 */
const VERSION = "talk-v3";
const SHELL = ["./index.html", "./app.html", "./landing.css", "./styles.css", "./config.js", "./app.js"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                 // fonts, CDN: let the browser handle it

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: "no-store" });
      if (fresh && fresh.ok) {
        const c = await caches.open(VERSION);
        c.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (_) {
      const hit = await caches.match(req);
      if (hit) return hit;
      return new Response("offline", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
  })());
});
