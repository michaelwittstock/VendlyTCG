/*
 * Show mode service worker.
 *
 * Scope is deliberately narrow. This exists so ONE page — /dashboard/show —
 * opens at a venue with no signal. It does not try to make the whole site work
 * offline, because a marketing page you cannot reach is an inconvenience and a
 * sale you cannot log is money.
 *
 * What it will never do:
 *  - cache anything under /api/ (a stale sale total is a lie, and the show
 *    pack has its own timestamped copy in localStorage)
 *  - cache other people's pages, or any page it was not asked to
 *  - serve a cached document without the app knowing, so the UI can always
 *    say how old the data on screen is
 */

const VERSION = "v1";
const DOC_CACHE = `vendly-doc-${VERSION}`;
const ASSET_CACHE = `vendly-assets-${VERSION}`;
const KEEP = new Set([DOC_CACHE, ASSET_CACHE]);

const SHOW_PATH = "/dashboard/show";

/* Content-hashed build output plus the handful of static files the page needs
 * to render at all. Everything here is safe to serve cache-first because the
 * URL changes when the bytes change. */
const ASSET_PREFIXES = ["/_next/static/", "/icons/"];
const ASSET_EXACT = new Set(["/manifest.webmanifest", "/favicon.ico"]);

/* One build's chunks are well under this. The cap stops caches from previous
 * deploys accumulating forever on a device that is rarely cleared. */
const MAX_ASSETS = 240;

self.addEventListener("install", (event) => {
  // Nothing is precached: the chunk URLs are build-specific and this file is
  // static, so it cannot know them. They are picked up on first online visit.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("vendly-") && !KEEP.has(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAsset(url) {
  return (
    ASSET_EXACT.has(url.pathname) ||
    ASSET_PREFIXES.some((p) => url.pathname.startsWith(p))
  );
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  // Cache API keys come back in insertion order, so the front is the oldest.
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

/** Cache-first. These URLs are immutable, so a hit is always correct. */
async function assetFirst(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.status === 200) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
    trimCache(ASSET_CACHE, MAX_ASSETS);
  }
  return response;
}

/**
 * Network-first for the Show mode document.
 *
 * Network-first and not cache-first because a fresher build should win the
 * moment there is signal. The cached copy is the safety net, not the default.
 */
async function docNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(DOC_CACHE);
      await cache.put(SHOW_PATH, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(SHOW_PATH, { ignoreVary: true });
    if (cached) return cached;
    return new Response(offlineFallback(), {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

/* Shown only when the page has never been opened online on this device, so
 * there is genuinely nothing to serve. It says that, rather than pretending
 * something went wrong just now. */
function offlineFallback() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Show mode is not saved on this device</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#faf9f5;color:#1a1917;font:16px/1.5 system-ui,sans-serif;padding:24px}
div{max-width:32rem}h1{font-size:1.5rem;margin:0 0 .75rem}p{margin:0 0 .75rem;color:#5f5b55}
code{background:#eceae1;padding:.1em .35em;border-radius:3px}</style></head><body><div>
<h1>Show mode is not saved on this device yet.</h1>
<p>You are offline, and this browser has never loaded <code>/dashboard/show</code> with a
connection. There is nothing cached to open.</p>
<p>Open Show mode once while you still have signal — that is what saves your inventory,
prices and the app itself to the device. Then it will work with no signal at all.</p>
</div></body></html>`;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Never anything dynamic. A cached API response would be a stale number
  // wearing a fresh timestamp.
  if (url.pathname.startsWith("/api/")) return;

  if (isAsset(url)) {
    event.respondWith(assetFirst(request));
    return;
  }

  // Full page loads of Show mode only. React Server Component fetches
  // (?_rsc=) and every other route pass straight through untouched.
  const isShowDoc =
    request.mode === "navigate" &&
    url.pathname === SHOW_PATH &&
    !url.searchParams.has("_rsc");

  if (isShowDoc) event.respondWith(docNetworkFirst(request));
});

/* ------------------------------------------------------------------ *
 * Watchlist alerts (Web Push)
 *
 * Separate concern from Show mode caching above, sharing this file only
 * because a page may register exactly one service worker per scope.
 *
 * userVisibleOnly was promised at subscribe time, so every push MUST show a
 * notification. A push that decides it has nothing to say and shows nothing
 * gets the whole subscription revoked by the browser after a few offences.
 * Hence the fallback below: it should never be reached, and if it is, the
 * honest thing is to say so rather than stay silent and lose the channel.
 * ------------------------------------------------------------------ */

const ALERT_TAG = "vendly-watchlist-digest";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Vendly TCG";
  const body = payload.body || "Open your watchlist to see what changed.";
  const url = payload.url || "/dashboard/watchlist";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // One tag for all digests: a new day's digest replaces yesterday's
      // rather than stacking up unread on the lock screen.
      tag: ALERT_TAG,
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard/watchlist";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse a tab that is already open on this origin instead of piling up
      // windows — a vendor tapping a notification three days running should
      // not end up with three copies of the dashboard.
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
