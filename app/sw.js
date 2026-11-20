// Offline support: cache the app shell so FairFare opens with no signal.
const CACHE = "fairfare-v1";
const SHELL = ["./", "index.html", "styles.css", "manifest.webmanifest", "icons/icon.svg",
  "js/app.js", "js/engine.js", "js/demand.js", "js/southwest.js", "js/i18n.js", "js/store.js", "lang/en.json"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

// Network first for the app's own files (so updates arrive), cache as fallback.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
