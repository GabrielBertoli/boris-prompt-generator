import { kv, kvConfigured } from "./_lib/kv.js";
import { readSession } from "./_lib/crypto.js";
import { USERS, cookieFrom, keys, send, userById } from "./_lib/http.js";

/* Qui est là ? Répond toujours 200 : le portail a besoin de la liste des
   prénoms même quand personne n'est connecté. */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "Méthode non autorisée." });
  }

  const roster = USERS.map(({ id, name, initial }) => ({ id, name, initial }));

  let session = null;
  try {
    session = readSession(cookieFrom(req));
  } catch {
    session = null; // SESSION_SECRET absent : on reste sur le portail.
  }

  const user = session ? userById(session.uid) : null;
  if (!user) {
    return send(res, 200, { ok: true, authenticated: false, users: roster, user: null });
  }

  let email = null;
  if (kvConfigured()) {
    try {
      email = await kv.get(keys.email(user.id));
    } catch {
      email = null;
    }
  }

  return send(res, 200, {
    ok: true,
    authenticated: true,
    users: roster,
    user: { id: user.id, name: user.name, initial: user.initial, email },
  });
}
