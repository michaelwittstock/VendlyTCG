/* End-to-end checks for Show mode against a REAL production server.
 *
 *   npx next build && npx next start -p 3111
 *   npm run test:e2e
 *
 * Everything here is signed out on purpose. The point is to prove the parts a
 * stranger can reach behave: the install metadata is real, the worker is
 * served as a worker, the offline page is not readable without a session, and
 * nothing that already worked has broken.
 */

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3111";

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, what: string) => { cond ? pass++ : fails.push(what); };
const eq = (a: unknown, e: unknown, what: string) => {
  JSON.stringify(a) === JSON.stringify(e)
    ? pass++
    : fails.push(`${what}\n      expected ${JSON.stringify(e)}\n      got      ${JSON.stringify(a)}`);
};

async function main() {
  /* ---------------- install metadata ---------------- */

  const mres = await fetch(`${BASE}/manifest.webmanifest`);
  eq(mres.status, 200, "manifest is served");
  const manifest = (await mres.json()) as {
    start_url?: string; display?: string; scope?: string;
    icons?: { src: string; sizes: string; purpose?: string }[];
  };
  // Someone tapping the icon is standing at a table. The dashboard home needs
  // the network; Show mode does not.
  eq(manifest.start_url, "/dashboard/show", "the installed app opens straight into Show mode");
  eq(manifest.display, "standalone", "it opens without browser chrome");
  ok((manifest.icons?.length ?? 0) >= 3, "there are icons to install with");
  ok((manifest.icons ?? []).some((i) => i.purpose === "maskable"),
    "a maskable icon exists, so Android does not letterbox it");

  for (const icon of manifest.icons ?? []) {
    const r = await fetch(`${BASE}${icon.src}`);
    eq(r.status, 200, `icon ${icon.src} is actually there`);
    ok((r.headers.get("content-type") ?? "").includes("image/png"), `icon ${icon.src} is a png`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    // PNG header, then width/height big-endian at bytes 16-24.
    ok(bytes[0] === 0x89 && bytes[1] === 0x50, `icon ${icon.src} really is PNG data`);
    const view = new DataView(bytes.buffer);
    const w = view.getUint32(16), h = view.getUint32(20);
    const [want] = icon.sizes.split("x").map(Number);
    eq([w, h], [want, want], `icon ${icon.src} is genuinely ${icon.sizes}`);
  }

  /* ---------------- what the browser needs in the document ---------------- *
   * A manifest nothing links to is a manifest no browser reads, and iOS does
   * not read the manifest for the icon at all. These are the difference
   * between "installable" and "we wrote an install file".                    */

  const html = await (await fetch(`${BASE}/login`)).text();
  ok(html.includes('rel="manifest"'), "the document points at the manifest");
  ok(/rel="apple-touch-icon"/.test(html),
    "iOS is given a real icon rather than screenshotting the page");
  ok(/name="theme-color"/.test(html), "the status bar is coloured on iOS, which ignores the manifest");
  ok(/apple-mobile-web-app-capable|mobile-web-app-capable/.test(html),
    "iOS is told this can run standalone");

  const apple = await fetch(`${BASE}/icons/apple-touch-icon.png`);
  eq(apple.status, 200, "the apple touch icon is actually served");

  /* ---------------- the worker ---------------- */

  const sw = await fetch(`${BASE}/sw.js`);
  eq(sw.status, 200, "the service worker is served");
  ok((sw.headers.get("content-type") ?? "").includes("javascript"),
    "…as JavaScript, which a browser requires before it will register it");
  const swText = await sw.text();
  ok(swText.includes("/dashboard/show"), "it is the Show mode worker");
  ok(!/\/api\//.test(swText.split("if (url.pathname.startsWith(\"/api/\")")[1] ?? ""),
    "nothing after the /api/ bail-out reintroduces API caching");

  /* ---------------- signed out, nothing leaks ---------------- */

  const pack = await fetch(`${BASE}/api/show-pack`, { redirect: "manual" });
  eq(pack.status, 401, "the show pack refuses a stranger");
  const packBody = await pack.text();
  ok(!/inventory_items|cost_basis|card_id/.test(packBody), "and says nothing about the schema");

  const sync = await fetch(`${BASE}/api/sales/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sales: [{ ref: "00000000-0000-4000-8000-000000000001", itemName: "x", quantity: 1, salePrice: 1 }] }),
    redirect: "manual",
  });
  eq(sync.status, 401, "a stranger cannot post sales into somebody's books");

  const showPage = await fetch(`${BASE}/dashboard/show`, { redirect: "manual" });
  ok(showPage.status === 307 || showPage.status === 302,
    "Show mode itself redirects when signed out");
  ok((showPage.headers.get("location") ?? "").includes("/login"),
    "…to the login page");

  /* ---------------- nothing that worked is broken ---------------- */

  const existing = [
    "/", "/start-here", "/shows", "/tools", "/gear", "/guides",
    "/guides/first-vendor-table", "/tools/profit-calculator",
    "/tools/inventory-template", "/tools/show-prep-checklist", "/tools/price-checker",
    "/login", "/signup",
  ];
  for (const path of existing) {
    const r = await fetch(`${BASE}${path}`);
    eq(r.status, 200, `${path} still loads`);
  }

  const xlsx = await fetch(`${BASE}/downloads/vendly-tcg-inventory-tracker.xlsx`);
  eq(xlsx.status, 200, "the inventory template still downloads");
  const pdf = await fetch(`${BASE}/downloads/vendly-tcg-show-prep-checklist.pdf`);
  eq(pdf.status, 200, "the show-prep checklist still downloads");

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
