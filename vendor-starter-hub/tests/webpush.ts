/* Round-trip tests for the hand-rolled Web Push crypto.
 * Run: npm run test:push   (cwd = vendor-starter-hub)
 *
 * WHY THIS FILE EXISTS. supabase/functions/alert-digest/webpush.ts implements
 * RFC 8291 and RFC 8292 directly on WebCrypto rather than pulling in
 * npm:web-push. That is the right call for an edge runtime, but it means a
 * single wrong byte produces a notification that silently never arrives — the
 * push service accepts the POST and the browser discards the message. No error
 * anywhere. So the encryption is verified by DECRYPTING it here, playing the
 * part of the browser, and the VAPID token by verifying its signature.
 *
 * The implementation uses only standard WebCrypto and fetch, so it runs
 * unchanged under Node.
 */

import {
  encryptPayload,
  vapidHeader,
  b64urlToBytes,
  bytesToB64url,
} from "../supabase/functions/alert-digest/webpush";

let pass = 0;
const fails: string[] = [];

function ok(cond: boolean, what: string) {
  if (cond) pass++;
  else fails.push(what);
}
function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) pass++;
  else fails.push(`${what}\n      expected ${e}\n      got      ${a}`);
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
      key, bytes * 8,
    ),
  );
}

// Wrapped in a function rather than run at the top level: tsx compiles these
// test files to CJS, which has no top-level await.
async function main() {

/* ---------------- base64url helpers ---------------- */
{
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
  eq(Array.from(b64urlToBytes(bytesToB64url(bytes))), Array.from(bytes),
    "base64url round-trips bytes that need + and / substitution");
  ok(!bytesToB64url(bytes).includes("="), "no padding, as the spec requires");
  // The real VAPID key is 65 bytes and 87 base64url chars, i.e. unpadded.
  eq(b64urlToBytes("BPsJQYo222HgefVv_MqNqR5iz57F2rfzmlME1dty-P7a356hbY9LIsUqrvpPBw0XE6iSOonx14D9Ffj0j1P3Z_E").length,
    65, "the shipped VAPID public key decodes to a 65-byte uncompressed point");
}

/* ---------------- aes128gcm round trip (RFC 8291) ---------------- *
 * Plays the browser: generate a subscription keypair, hand the public half to
 * encryptPayload as p256dh, then derive the same key from the private half and
 * decrypt. If any byte of the header block, the info strings or the padding
 * delimiter is wrong, this fails. */
{
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));

  const message = JSON.stringify({
    title: "2 cards are down against their own history",
    body: "Charizard ex (Holofoil) $80.00, 20% under its 14-day average",
    url: "/dashboard/watchlist",
  });

  const body = await encryptPayload(message, bytesToB64url(uaPublic), bytesToB64url(authSecret));

  // Header: salt(16) | rs(4) | idlen(1) | as_public(idlen) | ciphertext
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0, false);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);

  eq(idlen, 65, "sender's ephemeral key is a 65-byte uncompressed point");
  eq(rs, 4096, "record size is declared big-endian");
  ok(salt.length === 16, "16-byte salt");
  ok(ciphertext.length >= message.length + 1 + 16, "ciphertext carries payload, delimiter and GCM tag");

  const asKey = await crypto.subtle.importKey("raw", asPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256),
  );
  const ikm = await hkdf(authSecret, shared,
    concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
      aesKey, ciphertext as BufferSource),
  );

  eq(plain[plain.length - 1], 2, "final record ends with the 0x02 padding delimiter");
  eq(dec.decode(plain.slice(0, -1)), message, "the browser recovers exactly what was sent");

  // Two messages must never share a salt or an ephemeral key; reuse would let
  // anyone who decrypted one derive the keys for the rest.
  const second = await encryptPayload(message, bytesToB64url(uaPublic), bytesToB64url(authSecret));
  ok(bytesToB64url(second.slice(0, 16)) !== bytesToB64url(salt), "a fresh salt per message");
  ok(bytesToB64url(second.slice(21, 86)) !== bytesToB64url(asPublic), "a fresh keypair per message");
}

/* ---------------- VAPID token (RFC 8292) ---------------- *
 * The failure this catches: Node's crypto signs ECDSA as DER, WebCrypto signs
 * as the raw r||s pair, and JWS ES256 wants raw. Signing with the wrong one
 * produces a token every push service rejects as malformed. Verifying the
 * signature here proves we emit the shape they expect. */
{
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const publicB64 = bytesToB64url(publicRaw);

  const endpoint = "https://fcm.googleapis.com/fcm/send/abc123?token=xyz";
  const header = await vapidHeader(endpoint, privateJwk, publicB64, "mailto:a@b.com");

  ok(header.startsWith("vapid t="), "Authorization uses the vapid scheme");
  ok(header.includes(`, k=${publicB64}`), "the public key travels in k=");

  const token = header.slice("vapid t=".length, header.indexOf(", k="));
  const [h, p, s] = token.split(".");
  eq(JSON.parse(dec.decode(b64urlToBytes(h))), { typ: "JWT", alg: "ES256" }, "JOSE header");

  const claims = JSON.parse(dec.decode(b64urlToBytes(p)));
  // aud must be the ORIGIN, not the full endpoint. Sending the whole URL is a
  // common mistake and is rejected — with a message that blames the key.
  eq(claims.aud, "https://fcm.googleapis.com", "aud is the origin, path and query stripped");
  eq(claims.sub, "mailto:a@b.com", "sub carries the contact");
  const hours = (claims.exp - Math.floor(Date.now() / 1000)) / 3600;
  ok(hours > 11 && hours <= 12, "expires in about 12 hours, well inside the 24h cap");

  const sig = b64urlToBytes(s);
  eq(sig.length, 64, "signature is the raw 64-byte r||s pair, not DER");
  const verified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    pair.publicKey,
    sig as BufferSource,
    enc.encode(`${h}.${p}`) as BufferSource,
  );
  ok(verified, "the signature verifies against the public key");
}

/* ---------------- summary ---------------- */
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL: " + f);
  process.exit(1);
}

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
