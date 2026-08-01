/* Hachage des codes et signature des sessions.
   node:crypto uniquement — scrypt pour les codes, HMAC-SHA256 pour le jeton
   de session. Aucune dépendance à installer, aucun secret dans le bundle. */

import {
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export async function hashCode(code) {
  const salt = randomBytes(16);
  const derived = await scrypt(String(code).normalize("NFKC"), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    Buffer.from(derived).toString("base64"),
  ].join("$");
}

export async function verifyCode(code, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  let expected;
  try {
    expected = Buffer.from(hashB64, "base64");
    const derived = await scrypt(
      String(code).normalize("NFKC"),
      Buffer.from(saltB64, "base64"),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p) }
    );
    return timingSafeEqual(Buffer.from(derived), expected);
  } catch {
    return false;
  }
}

/* ---------- jeton de session : HMAC, pas de librairie JWT ---------- */

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("SESSION_SECRET manquant ou trop court (32 octets attendus).");
  }
  return secret;
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function signSession(payload, ttlSeconds = 60 * 60 * 24 * 30) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const data = b64url(JSON.stringify(body));
  const sig = b64url(createHmac("sha256", sessionSecret()).update(data).digest());
  return `${data}.${sig}`;
}

export function readSession(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = b64url(createHmac("sha256", sessionSecret()).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
    return null;
  }
  return payload;
}

/* ---------- jetons de réinitialisation ---------- */

export function newResetToken() {
  return randomBytes(32).toString("base64url");
}

export function fingerprint(value) {
  return createHmac("sha256", sessionSecret()).update(String(value)).digest("base64url");
}
