import { kv } from "./_lib/kv.js";
import { hashCode, verifyCode } from "./_lib/crypto.js";
import {
  body,
  clientIp,
  fail,
  keys,
  methodIs,
  normalizeCode,
  normalizeEmail,
  ok,
  rateLimited,
  requireSession,
  userById,
} from "./_lib/http.js";

/* Changer son code, enregistrer son mail. Session obligatoire. */
export default async function handler(req, res) {
  if (!methodIs(req, res, "POST")) return;

  const session = requireSession(req, res);
  if (!session) return;

  const user = userById(session.uid);
  const { action, current, next, email } = body(req);

  if (action === "code") {
    const currentCode = normalizeCode(current);
    const nextCode = normalizeCode(next);
    if (!currentCode) return fail(res, 400, "Code actuel manquant.");
    if (!nextCode) return fail(res, 400, "Le nouveau code fait 4 caractères au minimum.");
    if (nextCode === currentCode) return fail(res, 400, "Le nouveau code est identique à l'ancien.");

    if (await rateLimited(`code:${user.id}:${clientIp(req)}`, 10, 600)) {
      return fail(res, 429, "Trop de tentatives. Réessaie dans dix minutes.");
    }

    try {
      const stored = await kv.get(keys.code(user.id));
      if (!stored || !(await verifyCode(currentCode, stored))) {
        return fail(res, 401, "Code actuel refusé.");
      }
      await kv.set(keys.code(user.id), await hashCode(nextCode));
    } catch (error) {
      return fail(res, 503, `Le magasin de codes est injoignable : ${error.message}`);
    }

    return ok(res, { message: "Code remplacé." });
  }

  if (action === "email") {
    if (email === null || email === "") {
      try {
        await kv.del(keys.email(user.id));
      } catch (error) {
        return fail(res, 503, `Le magasin est injoignable : ${error.message}`);
      }
      return ok(res, { email: null, message: "Adresse retirée." });
    }

    const address = normalizeEmail(email);
    if (!address) return fail(res, 400, "Adresse e-mail invalide.");

    try {
      await kv.set(keys.email(user.id), address);
    } catch (error) {
      return fail(res, 503, `Le magasin est injoignable : ${error.message}`);
    }
    return ok(res, { email: address, message: "Adresse enregistrée." });
  }

  return fail(res, 400, "Action inconnue.");
}
