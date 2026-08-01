import { kv } from "./_lib/kv.js";
import { signSession, verifyCode } from "./_lib/crypto.js";
import {
  body,
  clientIp,
  fail,
  keys,
  methodIs,
  normalizeCode,
  ok,
  rateLimited,
  setSessionCookie,
  userById,
} from "./_lib/http.js";

export default async function handler(req, res) {
  if (!methodIs(req, res, "POST")) return;

  const { id, code } = body(req);
  const user = userById(id);
  const candidate = normalizeCode(code);

  if (!user) return fail(res, 400, "Prénom inconnu.");
  if (!candidate) return fail(res, 400, "Code trop court — 4 caractères au minimum.");

  if (await rateLimited(`login:${user.id}:${clientIp(req)}`, 8, 600)) {
    return fail(res, 429, "Trop de tentatives. Réessaie dans dix minutes.");
  }

  let stored;
  try {
    stored = await kv.get(keys.code(user.id));
  } catch (error) {
    return fail(res, 503, `Le magasin de codes est injoignable : ${error.message}`);
  }

  if (!stored) {
    return fail(res, 409, "Ce compte n'a pas encore de code. Préviens l'administrateur.");
  }

  if (!(await verifyCode(candidate, stored))) {
    return fail(res, 401, "Code refusé.");
  }

  let token;
  try {
    token = signSession({ uid: user.id });
  } catch (error) {
    return fail(res, 500, error.message);
  }

  setSessionCookie(res, token);

  let email = null;
  try {
    email = await kv.get(keys.email(user.id));
  } catch {
    email = null;
  }

  return ok(res, {
    user: { id: user.id, name: user.name, initial: user.initial, email },
    sharedKey: process.env.ANTHROPIC_SHARED_KEY || null,
  });
}
