/* Tests for public/sw.js — the thing standing between a vendor and a blank
 * screen at a venue with no signal.
 * Run: npm run test:sw   (cwd = vendor-starter-hub)
 *
 * The worker is plain JS with no exports, so it is evaluated here inside a
 * fake ServiceWorkerGlobalScope: stub caches, stub fetch, captured listeners.
 * That is what makes its ROUTING decisions testable, which is the part that
 * can quietly do damage — serving a stale API response, or intercepting a page
 * it was never meant to touch.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, what: string) => { cond ? pass++ : fails.push(what); };
const eq = (a: unknown, e: unknown, what: string) => {
  JSON.stringify(a) === JSON.stringify(e)
    ? pass++
    : fails.push(`${what}\n      expected ${JSON.stringify(e)}\n      got      ${JSON.stringify(a)}`);
};

/* ---------------- fakes ---------------- */

type Req = { url: string; method: string; mode?: string };

class FakeResponse {
  body: string; status: number; headers: Map<string, string>;
  constructor(body = "", init: { status?: number; headers?: Record<string, string> } = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = new Map(Object.entries(init.headers ?? {}));
  }
  get ok() { return this.status >= 200 && this.status < 300; }
  clone() { return new FakeResponse(this.body, { status: this.status }); }
  async text() { return this.body; }
}

class FakeCache {
  store = new Map<string, FakeResponse>();
  async put(key: Req | string, res: FakeResponse) {
    this.store.set(typeof key === "string" ? key : key.url, res);
  }
  async match(key: Req | string) {
    return this.store.get(typeof key === "string" ? key : key.url);
  }
  async keys() { return [...this.store.keys()]; }
  async delete(key: string) { return this.store.delete(key); }
}

class FakeCaches {
  boxes = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.boxes.has(name)) this.boxes.set(name, new FakeCache());
    return this.boxes.get(name)!;
  }
  async keys() { return [...this.boxes.keys()]; }
  async delete(name: string) { return this.boxes.delete(name); }
  async match(key: Req | string) {
    const url = typeof key === "string" ? key : key.url;
    for (const box of this.boxes.values()) {
      const hit = await box.match(url);
      if (hit) return hit;
    }
    return undefined;
  }
}

/** Build a fresh worker scope. `online:false` makes every fetch reject, which
 *  is exactly what a venue with no wifi looks like from inside the worker. */
function boot(opts: { online?: boolean } = {}) {
  const listeners = new Map<string, (e: unknown) => void>();
  const fetched: string[] = [];
  const caches = new FakeCaches();
  const online = opts.online !== false;

  const self: Record<string, unknown> = {
    location: { origin: "https://vendly.example" },
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };

  const sandbox: Record<string, unknown> = {
    self, caches, Response: FakeResponse, URL, Set, Map, Promise, console,
    fetch: async (req: Req | string) => {
      const url = typeof req === "string" ? req : req.url;
      fetched.push(url);
      if (!online) throw new Error("network down");
      return new FakeResponse(`<html>fresh ${url}</html>`);
    },
  };
  sandbox.globalThis = sandbox;

  const code = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  vm.runInNewContext(code, sandbox);

  /** Run the fetch handler and report whether the worker claimed the request. */
  async function handle(url: string, init: { mode?: string; method?: string } = {}) {
    const request: Req = { url, method: init.method ?? "GET", mode: init.mode };
    // An array rather than a nullable local: assigning inside the callback
    // leaves TypeScript narrowing the local to `never` at the return.
    const responded: Promise<FakeResponse>[] = [];
    const event = {
      request,
      respondWith: (p: Promise<FakeResponse>) => responded.push(p),
      waitUntil: (p: Promise<unknown>) => p,
    };
    listeners.get("fetch")?.(event);
    return {
      claimed: responded.length > 0,
      response: responded.length > 0 ? await responded[0] : null,
    };
  }

  return { listeners, fetched, caches, handle, self };
}

// Wrapped rather than run at top level: tsx compiles this to CommonJS, where
// top-level await is not available.
async function main() {

/* ---------------- what it must never touch ---------------- */
/* A cached API response is a stale number wearing a fresh timestamp: yesterday's
 * stock count or a price that has moved, served silently and indistinguishably
 * from a live one. Nothing under /api/ may ever be intercepted.              */

{
  const w = boot();
  for (const path of ["/api/show-pack", "/api/sales/sync", "/api/prices?q=charizard"]) {
    const r = await w.handle(`https://vendly.example${path}`, { mode: "cors" });
    ok(!r.claimed, `${path} is left alone by the worker`);
  }

  const post = await w.handle("https://vendly.example/dashboard/show", { method: "POST", mode: "navigate" });
  ok(!post.claimed, "a POST is never intercepted");

  const other = await w.handle("https://cdn.example.com/thing.js");
  ok(!other.claimed, "another origin is never intercepted");

  const dash = await w.handle("https://vendly.example/dashboard", { mode: "navigate" });
  ok(!dash.claimed, "the normal dashboard is not made offline — only Show mode is");

  const rsc = await w.handle("https://vendly.example/dashboard/show?_rsc=abc12", { mode: "navigate" });
  ok(!rsc.claimed, "a React Server Component fetch passes straight through");

  const sub = await w.handle("https://vendly.example/dashboard/show/extra", { mode: "navigate" });
  ok(!sub.claimed, "only the exact Show mode path is claimed");
}

/* ---------------- the page itself ---------------- */

{
  const w = boot();
  const first = await w.handle("https://vendly.example/dashboard/show", { mode: "navigate" });
  ok(first.claimed, "Show mode navigation is claimed");
  ok((await first.response!.text()).includes("fresh"), "online, the network answer wins — a new build must not be shadowed by an old cache");

  // Now the venue: same device, no signal.
  const off = boot({ online: false });
  off.caches.boxes = w.caches.boxes; // the cache this device already filled
  const second = await off.handle("https://vendly.example/dashboard/show", { mode: "navigate" });
  ok(second.claimed, "offline navigation is claimed");
  eq(second.response!.status, 200, "offline, the saved copy is served");
  ok((await second.response!.text()).includes("fresh"), "and it is the copy that was saved");
}

{
  // A device that has never opened Show mode online has genuinely nothing to
  // serve. It must say that, not imply something just went wrong.
  const w = boot({ online: false });
  const r = await w.handle("https://vendly.example/dashboard/show", { mode: "navigate" });
  ok(r.claimed, "the miss is still handled rather than left to fail as a browser error");
  eq(r.response!.status, 503, "an honest 503, not a fake 200");
  const html = await r.response!.text();
  ok(html.includes("not saved on this device"), "the fallback explains the actual situation");
  ok(html.includes("while you still have signal"), "and says what to do about it");
  ok(!/error|failed|wrong/i.test(html), "it does not blame an error that did not happen");
}

/* ---------------- build assets ---------------- */

{
  const w = boot();
  const url = "https://vendly.example/_next/static/chunks/main-abc123.js";
  const a = await w.handle(url);
  ok(a.claimed, "build output is claimed");
  eq(w.fetched.length, 1, "first hit goes to the network");

  const b = await w.handle(url);
  ok(b.claimed && b.response !== null, "second hit is answered");
  eq(w.fetched.length, 1, "…from cache, with no second network request");

  await w.handle("https://vendly.example/icons/icon-192.png");
  await w.handle("https://vendly.example/manifest.webmanifest");
  ok(w.fetched.includes("https://vendly.example/icons/icon-192.png"), "icons are cached");
  ok(w.fetched.includes("https://vendly.example/manifest.webmanifest"), "the manifest is cached");
}

{
  // A 404 or a 500 must not be stored: cache-first would then serve that
  // failure forever, and the URLs here are the app's own code.
  const listeners = new Map<string, (e: unknown) => void>();
  const caches = new FakeCaches();
  const self: Record<string, unknown> = {
    location: { origin: "https://vendly.example" },
    addEventListener: (t: string, fn: (e: unknown) => void) => listeners.set(t, fn),
    skipWaiting: async () => {}, clients: { claim: async () => {} },
  };
  const sandbox: Record<string, unknown> = {
    self, caches, Response: FakeResponse, URL, Set, Map, Promise, console,
    fetch: async () => new FakeResponse("nope", { status: 500 }),
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(join(process.cwd(), "public", "sw.js"), "utf8"), sandbox);

  const responded: Promise<FakeResponse>[] = [];
  listeners.get("fetch")?.({
    request: { url: "https://vendly.example/_next/static/chunks/bad.js", method: "GET" },
    respondWith: (p: Promise<FakeResponse>) => responded.push(p),
    waitUntil: (p: Promise<unknown>) => p,
  });
  await responded[0];
  const box = await caches.open("vendly-assets-v1");
  eq((await box.keys()).length, 0, "a failed asset response is never cached");
}

/* ---------------- housekeeping ---------------- */

{
  // Old versions must be swept, and only ours. Deleting a cache this app did
  // not create would be vandalism on a shared origin.
  const w = boot();
  const stale = await w.caches.open("vendly-assets-v0");
  await stale.put("https://vendly.example/old.js", new FakeResponse("old"));
  const foreign = await w.caches.open("some-other-app-v1");
  await foreign.put("https://vendly.example/theirs.js", new FakeResponse("theirs"));

  const held: Promise<unknown>[] = [];
  w.listeners.get("activate")?.({ waitUntil: (p: Promise<unknown>) => held.push(p) });
  await held[0];

  const names = await w.caches.keys();
  ok(!names.includes("vendly-assets-v0"), "a previous version's cache is cleared out");
  ok(names.includes("some-other-app-v1"), "caches belonging to anything else are left alone");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL: " + f);
  process.exit(1);
}

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
