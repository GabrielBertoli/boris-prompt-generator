import { kv } from "./_lib/kv.js";
import { body, fail, keys, ok, requireSession, send } from "./_lib/http.js";

/* Compteur de dépense par personne, en dollars.
   Comme la bibliothèque : la clé sort de la session, jamais d'un paramètre —
   personne ne lit ni ne gonfle le compteur d'un autre. Le navigateur mesure
   (il est seul à voir les réponses d'Anthropic), le serveur additionne. */

const MAX_DELTA = 5; // un appel de l'atelier coûte des centimes ; 5 $ est déjà absurde

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const key = keys.usage(session.uid);

  if (req.method === "GET") {
    try {
      const total = Number(await kv.get(key)) || 0;
      return ok(res, { total });
    } catch (error) {
      return fail(res, 503, `Le magasin est injoignable : ${error.message}`);
    }
  }

  if (req.method === "POST") {
    const { delta } = body(req);
    if (!Number.isFinite(delta) || delta <= 0 || delta > MAX_DELTA) {
      return fail(res, 400, "Montant invalide.");
    }
    try {
      const total = await kv.incrByFloat(key, delta);
      return ok(res, { total });
    } catch (error) {
      return fail(res, 503, `Le magasin est injoignable : ${error.message}`);
    }
  }

  res.setHeader("Allow", "GET, POST");
  return send(res, 405, { ok: false, error: "Méthode non autorisée." });
}
