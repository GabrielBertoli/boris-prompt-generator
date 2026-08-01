import { kv } from "./_lib/kv.js";
import { body, fail, keys, ok, requireSession, send } from "./_lib/http.js";

/* Bibliothèque personnelle : chacun lit et écrit la sienne, jamais celle
   d'un autre — la clé est dérivée de la session, pas d'un paramètre. */

const MAX_ITEMS = 200;
const MAX_PROMPT = 24000;
const MAX_PAYLOAD = 2 * 1024 * 1024;

/* Le fil de correction voyage avec son entrée. Le client compacte déjà —
   seules les trois dernières réponses gardent leur texte entier — mais le
   serveur ne fait confiance à personne : il replafonne le nombre de tours
   et la taille de chacun. Sans ces bornes, un fil suffirait à faire
   dépasser la charge utile et à bloquer toute écriture de la bibliothèque. */
const MAX_TURNS = 40;
const MAX_TURN_TEXT = MAX_PROMPT;

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const key = keys.prompts(session.uid);

  if (req.method === "GET") {
    try {
      const items = await kv.getJson(key, []);
      return ok(res, { items: Array.isArray(items) ? items : [] });
    } catch (error) {
      return fail(res, 503, `Le magasin est injoignable : ${error.message}`);
    }
  }

  if (req.method === "PUT") {
    const { items } = body(req);
    if (!Array.isArray(items)) return fail(res, 400, "Liste attendue.");
    if (items.length > MAX_ITEMS) return fail(res, 413, `${MAX_ITEMS} prompts au maximum.`);

    let clean;
    try {
      clean = items.map(sanitize);
    } catch (error) {
      return fail(res, 400, error.message);
    }

    const payload = JSON.stringify(clean);
    if (payload.length > MAX_PAYLOAD) return fail(res, 413, "Bibliothèque trop volumineuse.");

    try {
      await kv.set(key, payload);
    } catch (error) {
      return fail(res, 503, `Le magasin est injoignable : ${error.message}`);
    }
    return ok(res, { items: clean });
  }

  res.setHeader("Allow", "GET, PUT");
  return send(res, 405, { ok: false, error: "Méthode non autorisée." });
}

function text(value, max, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.slice(0, max);
}

function sanitize(item) {
  if (!item || typeof item !== "object") throw new Error("Entrée de bibliothèque invalide.");
  const prompt = text(item.prompt, MAX_PROMPT);
  if (!prompt) throw new Error("Un prompt vide ne peut pas être enregistré.");
  return {
    id: text(item.id, 64) || String(Date.now()),
    title: text(item.title, 160) || "Sans titre",
    idea: text(item.idea, 4000),
    mode: item.mode === "existante" ? "existante" : "nouvelle",
    prompt,
    count: Number.isFinite(item.count) ? Math.max(0, Math.trunc(item.count)) : [...prompt].length,
    limit: Number.isFinite(item.limit) ? Math.max(0, Math.trunc(item.limit)) : 3000,
    version: Number.isFinite(item.version) ? Math.max(1, Math.trunc(item.version)) : 1,
    chat: chat(item.chat),
    savedAt: text(item.savedAt, 40) || new Date().toISOString(),
    updatedAt: text(item.updatedAt, 40) || text(item.savedAt, 40) || new Date().toISOString(),
  };
}

function chat(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((turn) => turn && typeof turn === "object" && typeof turn.text === "string")
    .slice(-MAX_TURNS)
    .map((turn) => ({
      role: turn.role === "moi" ? "moi" : "atelier",
      text: text(turn.text, MAX_TURN_TEXT),
      at: text(turn.at, 40) || new Date().toISOString(),
      ...(Number.isFinite(turn.version) ? { version: Math.max(1, Math.trunc(turn.version)) } : {}),
      ...(Number.isFinite(turn.count) ? { count: Math.max(0, Math.trunc(turn.count)) } : {}),
      ...(typeof turn.pass === "boolean" ? { pass: turn.pass } : {}),
      ...(turn.compacted ? { compacted: true } : {}),
    }));
}
