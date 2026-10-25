/* ChatUP push server (Cloudflare Worker)
   Sends notifications to phones when ChatUP is closed.
   Paste this whole file into your worker and click Deploy. */

const PROJECT = "chatup-656fd";
const VAPID_PUBLIC = "BK8dFCiW93CJ4Nfnv5WyCN37VnSss3-SDy7YdSKuyxCLUcp-0GIWW13AA_V3mQjvx3c_1EgktjJM0PntHeyKKZo";
const VAPID_JWK = {"kty":"EC","crv":"P-256","x":"rx0UKJb3cIng1-e_lbII3ftWdKyzf5IPLth1Iq7LEIs","y":"Ucp-0GIWW13AA_V3mQjvx3c_1EgktjJM0PntHeyKKZo","d":"bpeC4OQIrxXGMgrBcU96CHQ-tJ5arIKW7VxKdIOzPcE"};
const VAPID_SUBJECT = "mailto:chatup-push@example.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    if (req.method === "GET") return json({ ok: true, app: "ChatUP push", publicKey: VAPID_PUBLIC });
    if (req.method !== "POST") return json({ error: "method" }, 405);
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return json({ error: "no token" }, 401);
    const me = uidFromToken(token);
    if (!me) return json({ error: "bad token" }, 401);
    let body = {};
    try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
    try {
      if (url.pathname.endsWith("/notify")) return json(await notifyChat(token, me, body));
      if (url.pathname.endsWith("/call")) return json(await notifyCall(token, me, body));
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },
};

/* ---------- Firestore (read as the sender, so the security rules decide) ---------- */
async function fsGet(token, path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { headers: { Authorization: "Bearer " + token } });
  if (r.status === 404) return null;
  if (r.status === 401 || r.status === 403) throw new Error("not allowed: " + path);
  if (!r.ok) throw new Error("firestore " + r.status);
  const d = await r.json();
  return fromFields(d.fields || {});
}
function fromValue(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  return null;
}
function fromFields(f) { const o = {}; for (const k in f) o[k] = fromValue(f[k]); return o; }
function uidFromToken(t) {
  try {
    const p = JSON.parse(new TextDecoder().decode(b64d(t.split(".")[1])));
    if (p.exp && p.exp * 1000 < Date.now()) return null;
    return p.user_id || p.sub || null;
  } catch (e) { return null; }
}
const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

async function notifyChat(token, me, b) {
  const chatId = String(b.chat || "");
  if (!/^[\w~.-]{3,120}$/.test(chatId)) throw new Error("bad chat");
  const chat = await fsGet(token, "chats/" + chatId);
  if (!chat || !Array.isArray(chat.members) || !chat.members.includes(me)) throw new Error("not a member");
  const targets = chat.members.filter((u) => u !== me);
  const payload = { t: "msg", cid: chatId, title: clip(b.title, 60) || "ChatUP", body: clip(b.body, 160) || "הודעה חדשה" };
  return sendToUsers(token, targets, payload, { ttl: 86400, mutedKey: chatId, from: me });
}
async function notifyCall(token, me, b) {
  const id = String(b.call || "");
  if (!/^[\w-]{3,80}$/.test(id)) throw new Error("bad call");
  const call = await fsGet(token, "calls/" + id);
  if (!call || call.from !== me || !call.to) throw new Error("not your call");
  const payload = { t: "call", id, video: !!call.video, title: clip(b.title, 60) || "ChatUP", body: call.video ? "שיחת וידאו נכנסת" : "שיחה קולית נכנסת" };
  return sendToUsers(token, [call.to], payload, { ttl: 45, from: me });
}
async function sendToUsers(token, uids, payload, opt) {
  let sent = 0, failed = 0, skipped = 0;
  await Promise.all(uids.slice(0, 256).map(async (u) => {
    const doc = await fsGet(token, "pushsubs/" + u).catch(() => null);
    if (!doc || !doc.subs) return;
    if (opt.mutedKey && doc.muted && doc.muted[opt.mutedKey]) {
      const m = doc.muted[opt.mutedKey];
      if (m === true || (typeof m === "number" && m > Date.now())) { skipped++; return; }
    }
    if (doc.blocked && Array.isArray(doc.blocked) && doc.blocked.includes(opt.from)) { skipped++; return; }
    await Promise.all(Object.values(doc.subs).map(async (s) => {
      if (!s || !s.endpoint || !s.p256dh || !s.auth) return;
      try { const r = await webPush(s, JSON.stringify(payload), opt.ttl); if (r.ok) sent++; else failed++; }
      catch (e) { failed++; }
    }));
  }));
  return { sent, failed, skipped };
}

/* ---------- Web Push: VAPID (RFC 8292) + aes128gcm (RFC 8291) ---------- */
const te = new TextEncoder();
function b64u(buf) { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64d(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
function concat(...arrs) { const n = arrs.reduce((s, a) => s + a.length, 0); const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; }
async function hmac(key, data) { const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return new Uint8Array(await crypto.subtle.sign("HMAC", k, data)); }
async function hkdfExpand(prk, info, len) { return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, len); }

let vapidKey = null;
async function vapidHeader(endpoint) {
  if (!vapidKey) vapidKey = await crypto.subtle.importKey("jwk", { ...VAPID_JWK, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const aud = new URL(endpoint).origin;
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapidKey, te.encode(head + "." + claims));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${VAPID_PUBLIC}`;
}
async function encrypt(sub, text) {
  const uaPublic = b64d(sub.p256dh), authSecret = b64d(sub.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hkdfExpand(prkKey, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = await hkdfExpand(prk, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(te.encode(text), new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}
async function webPush(sub, text, ttl) {
  const body = await encrypt(sub, text);
  return fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: await vapidHeader(sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl || 86400), Urgency: "high" },
    body,
  });
}
