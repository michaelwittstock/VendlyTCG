/**
 * Browser-side Web Push plumbing.
 *
 * THE PUBLIC KEY BELOW IS NOT A SECRET. VAPID is a keypair: the browser hands
 * the public half to the push service when it subscribes, so it ships in the
 * client bundle by definition. It is a constant here rather than an env var on
 * purpose — an env var would be one more thing to set in Vercel, and the
 * Vercel project is already the bottleneck on this repo. The private half
 * lives in Supabase Vault and never leaves the sender.
 */
export const VAPID_PUBLIC_KEY =
  "BPsJQYo222HgefVv_MqNqR5iz57F2rfzmlME1dty-P7a356hbY9LIsUqrvpPBw0XE6iSOonx14D9Ffj0j1P3Z_E";

/** The subscribe API wants raw bytes, and the key travels as base64url. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type PushSupport =
  | { ok: true }
  /** Safari on iOS only allows push from an INSTALLED PWA, not a browser tab. */
  | { ok: false; reason: "needs_install" }
  | { ok: false; reason: "unsupported" };

/**
 * Can this browser subscribe at all?
 *
 * The iOS case is called out separately because the fix is a real instruction
 * a person can follow — "Share, then Add to Home Screen" — and telling them
 * "not supported" instead would be both discouraging and wrong.
 */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return { ok: false, reason: "unsupported" };

  const hasApi =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports as a Mac; the touch points give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own flag, which predates the standard media query.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (isIOS && !standalone) return { ok: false, reason: "needs_install" };
  if (!hasApi) return { ok: false, reason: "unsupported" };
  return { ok: true };
}

export type SubscriptionPayload = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string;
};

/**
 * Ask the browser for permission and a subscription.
 *
 * Called from a click handler and never on page load. A permission prompt
 * fired at someone who did not ask for it is the fastest route to a permanent
 * "denied", and there is no second chance on iOS.
 */
export async function subscribeToPush(): Promise<
  { ok: true; sub: SubscriptionPayload } | { ok: false; reason: string }
> {
  const support = pushSupport();
  if (!support.ok) return { ok: false, reason: support.reason };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission };

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // Re-subscribing returns the existing subscription, so this is safe to call
  // again — which matters, because a person who reinstalls the app gets a new
  // endpoint and the old row has to be replaced rather than duplicated.
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh ?? arrayBufferToBase64Url(sub.getKey("p256dh"));
  const auth = json.keys?.auth ?? arrayBufferToBase64Url(sub.getKey("auth"));
  if (!p256dh || !auth) return { ok: false, reason: "no_keys" };

  return {
    ok: true,
    sub: {
      endpoint: sub.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent.slice(0, 300),
    },
  };
}

/** Returns the endpoint that was removed, so the server row can be deleted. */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
