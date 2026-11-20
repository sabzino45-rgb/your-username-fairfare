// Offline support: cache the app shell so FairFare opens with no signal.
const CACHE = "fairfare-v3";
const SHELL = ["./", "index.html", "styles.css", "manifest.webmanifest", "icons/icon.svg",
  "js/app.js", "js/engine.js", "js/demand.js", "js/southwest.js", "js/i18n.js", "js/store.js", "lang/en.json"];

// Share target hand-off (manifest "share_target"). A shared screenshot waits here only until
// the Check screen reads it; the page deletes this whole cache straight after, success or not.
// Keep SHARE_CACHE, SHARE_KEY and SHARE_ACTION in step with app/js/app.js and the manifest.
const SHARE_CACHE = "fairfare-share";
const SHARE_KEY = "shared-image";
const SHARE_ACTION = "share-target";

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

function isShareTarget(url) {
  return url.origin === location.origin && url.pathname === new URL(SHARE_ACTION, self.registration.scope).pathname;
}

// Take the image out of the shared form, park it for the page, then send the page to #check.
async function handleShare(request) {
  const back = new URL("./#check", self.registration.scope).href;
  const key = new URL(SHARE_KEY, self.registration.scope).href;
  try {
    await caches.delete(SHARE_CACHE); // never keep an older share around
    const form = await request.formData();
    const file = form.getAll("image").find((f) => f && typeof f !== "string") || null;
    const cache = await caches.open(SHARE_CACHE);
    // Not an image (or nothing shared): park an empty marker so the page shows "couldn't read".
    const ok = file && /^image\//.test(file.type || "");
    await cache.put(key, ok ? new Response(file, { headers: { "content-type": file.type } })
                            : new Response("", { headers: { "content-type": "application/x-fairfare-none" } }));
  } catch { /* the page finds nothing and stays on the normal Check screen */ }
  return Response.redirect(back, 303);
}

// Network first for the app's own files (so updates arrive), cache as fallback.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && isShareTarget(url)) { e.respondWith(handleShare(e.request)); return; }
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // A GET to the share action (e.g. reopened from history) just opens the Check screen.
  if (isShareTarget(url)) { e.respondWith(Response.redirect(new URL("./#check", self.registration.scope).href, 303)); return; }
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
