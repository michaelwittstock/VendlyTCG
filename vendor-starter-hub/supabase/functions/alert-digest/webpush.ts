/**
 * Web Push, from scratch, on WebCrypto.
 *
 * WHY NOT A LIBRARY. The usual choice is npm:web-push, which is built on Node
 * crypto and pulls a dependency tree into an edge runtime for what is, below,
 * about eighty lines of standard WebCrypto. Fewer moving parts in the thing
 * that runs unattended at 3am.
 *
 * Implements RFC 8291 (aes128gcm message encryption) and RFC 8292 (VAPID).
 * The shapes are fixed by those specs; the comments explain the parts that are
 * easy to get subtly wrong.
 */

const enc = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function b64urlToBytes(s: string): Uint8Array {
  const padded = s.padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Encrypt a payload for one subscription.
 *
 * The output is the whole request body: a header block carrying the salt, the
 * record size and our ephemeral public key, followed by the AES-GCM ciphertext.
 * The receiving browser needs every one of those to derive the same key, which
 * is why they travel in the clear alongside it.
 */
export async function encryptPayload(
  payload: string,
  p256dhB64: string,
  authB64: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(p256dhB64);
  const authSecret = b64urlToBytes(authB64);

  // A fresh keypair per message. Reusing one would let anyone who ever saw a
  // decrypted message derive the keys for every later one.
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, ephemeral.privateKey, 256),
  );
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));

  // RFC 8291 §3.3. Both public keys are bound into the info string, so a
  // message encrypted for one device cannot be replayed at another.
  const ikm = await hkdf(
    authSecret,
    shared,
    concat(enc.encode("WebPush: info\0"), uaPublic, asPublic),
    32,
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, [
    "encrypt",
  ]);
  // 0x02 is the final-record padding delimiter. Without it the browser rejects
  // the message, and the failure looks like a key problem rather than a byte.
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      plaintext as BufferSource,
    ),
  );

  // Record size, big-endian. One record, so it only has to exceed the payload.
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);

  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/**
 * The VAPID Authorization header: a short-lived JWT saying who is sending,
 * signed by the key whose public half the browser handed to the push service
 * at subscribe time.
 */
export async function vapidHeader(
  endpoint: string,
  privateJwk: JsonWebKey,
  publicKeyB64: string,
  subject: string,
): Promise<string> {
  const aud = new URL(endpoint).origin;
  // Twelve hours. The spec caps it at 24; well under keeps a leaked token from
  // being useful for long, and the job runs daily anyway.
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = bytesToB64url(enc.encode(JSON.stringify({ aud, exp, sub: subject })));
  const signingInput = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto returns the raw r||s pair, which is exactly what JWS ES256
  // wants. Node's crypto returns DER here instead, which is the classic reason
  // a hand-rolled VAPID token gets rejected as malformed.
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      enc.encode(signingInput) as BufferSource,
    ),
  );

  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${publicKeyB64}`;
}

export type SendResult =
  | { ok: true; status: number }
  /** The subscription is gone for good — retire the row rather than retry it. */
  | { ok: false; gone: true; status: number }
  | { ok: false; gone: false; status: number; detail: string };

export async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  privateJwk: JsonWebKey,
  publicKeyB64: string,
  subject: string,
): Promise<SendResult> {
  try {
    const body = await encryptPayload(payload, sub.p256dh, sub.auth);
    const auth = await vapidHeader(sub.endpoint, privateJwk, publicKeyB64, subject);

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        // Deliver within the day or drop it. A "this card is cheap" alert that
        // arrives on Thursday about Monday's price is worse than no alert.
        TTL: "86400",
        Urgency: "normal",
      },
      body: body as BodyInit,
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) return { ok: true, status: res.status };
    // 404: endpoint never existed. 410: the browser revoked it (app deleted,
    // permission withdrawn). Neither will ever succeed again.
    if (res.status === 404 || res.status === 410) {
      return { ok: false, gone: true, status: res.status };
    }
    return {
      ok: false,
      gone: false,
      status: res.status,
      detail: (await res.text().catch(() => "")).slice(0, 200),
    };
  } catch (e) {
    return { ok: false, gone: false, status: 0, detail: String(e).slice(0, 200) };
  }
}
