import { kv } from "./_lib/kv.js";
import { fingerprint, hashCode, newResetToken, signSession } from "./_lib/crypto.js";
import {
  body,
  clientIp,
  fail,
  keys,
  methodIs,
  normalizeCode,
  ok,
  originOf,
  rateLimited,
  setSessionCookie,
  userById,
} from "./_lib/http.js";
import { mailConfigured, resetEmail, sendMail } from "./_lib/mail.js";

const TTL = 60 * 30; // trente minutes

export default async function handler(req, res) {
  if (!methodIs(req, res, "POST")) return;

  const { action, id, token, code } = body(req);

  /* ---------- code oublié : envoyer le lien ---------- */
  if (action === "request") {
    const user = userById(id);
    if (!user) return fail(res, 400, "Prénom inconnu.");
    if (!mailConfigured()) return fail(res, 503, "L'envoi d'e-mail n'est pas configuré.");

    if (await rateLimited(`reset:${user.id}`, 3, 3600)) {
      return fail(res, 429, "Trois demandes par heure au maximum. Réessaie plus tard.");
    }

    let address;
    try {
      address = await kv.get(keys.email(user.id));
    } catch (error) {
      return fail(res, 503, `Le magasin est injoignable : ${error.message}`);
    }
    if (!address) {
      return ok(res, {
        sent: false,
        message: `Aucune adresse enregistrée pour ${user.name}. Un code ne peut pas être renvoyé.`,
      });
    }

    const raw = newResetToken();
    try {
      await kv.setEx(keys.reset(fingerprint(raw)), user.id, TTL);
    } catch (error) {
      return fail(res, 503, `Le magasin est injoignable : ${error.message}`);
    }

    const link = `${originOf(req)}/?reset=${encodeURIComponent(raw)}&u=${encodeURIComponent(user.id)}`;
    try {
      await sendMail({ to: address, ...resetEmail({ name: user.name, link }) });
    } catch (error) {
      return fail(res, 502, error.message);
    }

    return ok(res, { sent: true, message: `Lien envoyé à ${maskEmail(address)}.` });
  }

  /* ---------- lien suivi : poser le nouveau code ---------- */
  if (action === "confirm") {
    const user = userById(id);
    const nextCode = normalizeCode(code);
    if (!user) return fail(res, 400, "Prénom inconnu.");
    if (typeof token !== "string" || token.length < 20) return fail(res, 400, "Lien invalide.");
    if (!nextCode) return fail(res, 400, "Le nouveau code fait 4 caractères au minimum.");

    if (await rateLimited(`confirm:${clientIp(req)}`, 12, 600)) {
      return fail(res, 429, "Trop de tentatives. Réessaie dans dix minutes.");
    }

    const key = keys.reset(fingerprint(token));
    let owner;
    try {
      owner = await kv.get(key);
    } catch (error) {
      return fail(res, 503, `Le magasin est injoignable : ${error.message}`);
    }
    if (!owner || owner !== user.id) {
      return fail(res, 401, "Lien expiré ou déjà utilisé. Demande-en un nouveau.");
    }

    try {
      await kv.set(keys.code(user.id), await hashCode(nextCode));
      await kv.del(key); // usage unique
    } catch (error) {
      return fail(res, 503, `Le magasin est injoignable : ${error.message}`);
    }

    let email = null;
    try {
      email = await kv.get(keys.email(user.id));
    } catch {
      email = null;
    }

    try {
      setSessionCookie(res, signSession({ uid: user.id }));
    } catch (error) {
      return fail(res, 500, error.message);
    }

    return ok(res, { user: { id: user.id, name: user.name, initial: user.initial, email } });
  }

  return fail(res, 400, "Action inconnue.");
}

function maskEmail(address) {
  const [local, domain] = String(address).split("@");
  if (!domain) return "l'adresse enregistrée";
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
