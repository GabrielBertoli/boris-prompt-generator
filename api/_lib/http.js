/* Petites briques HTTP partagées par les fonctions d'accès. */

import { kv } from "./kv.js";
import { readSession } from "./crypto.js";

export const COOKIE = "bpg_session";

/* Les prénoms de la porte d'entrée. Ce ne sont pas des secrets :
   seuls les codes le sont, et ils vivent hachés côté serveur.
   `gabriel` et `gabriela` partagent l'initiale G — les identifiants, eux,
   restent distincts, et c'est le prénom entier qui s'affiche. */
export const USERS = [
  { id: "gabriel", name: "Gabriel", initial: "G" },
  { id: "karl", name: "Karl", initial: "K" },
  { id: "raphaelle", name: "Raphaëlle", initial: "R" },
  { id: "gabriela", name: "Gabriela", initial: "G" },
];

export const userById = (id) => USERS.find((u) => u.id === id) || null;

export const keys = {
  code: (id) => `bpg:user:${id}:code`,
  email: (id) => `bpg:user:${id}:email`,
  prompts: (id) => `bpg:user:${id}:prompts`,
  reset: (fp) => `bpg:reset:${fp}`,
  rate: (bucket) => `bpg:rl:${bucket}`,
};

export function send(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

export const ok = (res, body = {}) => send(res, 200, { ok: true, ...body });
export const fail = (res, status, error) => send(res, status, { ok: false, error });

export function methodIs(req, res, method) {
  if (req.method === method) return true;
  res.setHeader("Allow", method);
  fail(res, 405, "Méthode non autorisée.");
  return false;
}

export function body(req) {
  const raw = req.body;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function cookieFrom(req) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function setSessionCookie(res, token, maxAge = 60 * 60 * 24 * 30) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

/** Renvoie la session valide, ou répond 401 et renvoie null. */
export function requireSession(req, res) {
  let session = null;
  try {
    session = readSession(cookieFrom(req));
  } catch (error) {
    fail(res, 500, error.message);
    return null;
  }
  if (!session || !userById(session.uid)) {
    fail(res, 401, "Session absente ou expirée — reconnecte-toi.");
    return null;
  }
  return session;
}

export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "inconnu";
}

/** Compteur glissant en KV. Renvoie true quand la limite est dépassée. */
export async function rateLimited(bucket, limit, seconds) {
  try {
    const count = await kv.incrEx(keys.rate(bucket), seconds);
    return count > limit;
  } catch {
    // KV indisponible : on ne bloque pas l'accès sur une panne du compteur.
    return false;
  }
}

/** Un code : 4 à 64 caractères, espaces de bord retirés. */
export function normalizeCode(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().normalize("NFKC");
  return code.length >= 4 && code.length <= 64 ? code : null;
}

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : null;
}

export function originOf(req) {
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}
