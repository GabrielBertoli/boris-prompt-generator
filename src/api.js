/* ================================================================
   Deux surfaces réseau, volontairement séparées.

   1. Anthropic — appelé DIRECTEMENT par le navigateur, avec la clé du
      visiteur. Elle ne quitte jamais sa machine, aucune fonction
      serverless ne la voit. D'où l'en-tête de sortie de secours
      anthropic-dangerous-direct-browser-access.
   2. /api/* — l'accès, et rien d'autre.
   ================================================================ */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const KEY_STORAGE = "atelier-boris:cle-api";

/* ---------- clé du visiteur : navigateur uniquement ----------

   Deux origines possibles, dans cet ordre :
   1. la clé PERSONNELLE, collée dans les réglages et gardée ici même ;
   2. à défaut, la clé de l'atelier, servie par /api/session à une session
      valide — jamais au portail, jamais dans le bundle.
   La personnelle gagne toujours : c'est elle qu'on a choisi de poser. */

export function loadApiKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function saveApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
    return true;
  } catch {
    return false;
  }
}

export const looksLikeKey = (key) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(key).trim());

/* ---------- appel Claude ---------- */

export async function callClaude(messages, { apiKey, model, maxTokens = 4000, system }) {
  if (!apiKey) throw new Error("Aucune clé API — ouvre les réglages et colle la tienne.");

  const payload = { model, max_tokens: maxTokens, messages };
  if (system) payload.system = system;

  // Réflexion coupée : la longueur de sortie reste prévisible sous max_tokens,
  // et la boucle d'assertions joue déjà le rôle d'auto-correction.
  // Fable et Mythos pensent toujours et refusent le réglage (400) : on l'omet.
  if (!/^claude-(fable|mythos)/.test(model)) {
    payload.thinking = { type: "disabled" };
  }

  let response;
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": String(apiKey).trim(),
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Le navigateur n'a pas pu joindre api.anthropic.com (réseau ou blocage).");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const error = await response.json();
      detail = error?.error?.message || "";
    } catch {
      /* corps illisible : le code HTTP parle déjà */
    }
    throw new Error(describe(response.status, detail));
  }

  const data = await response.json();

  if (data.stop_reason === "refusal") {
    throw new Error("Le modèle a décliné cette demande. Reformule l'idée.");
  }

  const text = (data.content || [])
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n");

  if (!text.trim()) {
    if (data.stop_reason === "max_tokens") {
      throw new Error("Réponse coupée par la limite de jetons. Baisse la limite de caractères.");
    }
    throw new Error("Réponse vide du modèle.");
  }

  return { text, truncated: data.stop_reason === "max_tokens", usage: data.usage || null };
}

function describe(status, detail) {
  const suffix = detail ? ` — ${detail}` : "";
  if (status === 401) return "Clé API refusée (401). Vérifie-la dans les réglages.";
  if (status === 403) return `Clé sans droit d'accès à ce modèle (403)${suffix}`;
  if (status === 404) return `Modèle introuvable (404)${suffix}`;
  if (status === 429) return "Limite de débit atteinte (429). Patiente une minute.";
  if (status === 529) return "Service Anthropic saturé (529). Relance dans un instant.";
  if (status >= 500) return `Erreur côté Anthropic (${status})${suffix}`;
  return `Appel refusé (${status})${suffix}`;
}

/* ---------- surface d'accès ---------- */

async function callApi(path, { method = "GET", payload } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    /* réponse non JSON : on retombe sur le statut */
  }

  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || `Le serveur a répondu ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export const api = {
  session: () => callApi("/api/session"),
  login: (id, code) => callApi("/api/login", { method: "POST", payload: { id, code } }),
  logout: () => callApi("/api/logout", { method: "POST" }),
  changeCode: (current, next) =>
    callApi("/api/account", { method: "POST", payload: { action: "code", current, next } }),
  setEmail: (email) =>
    callApi("/api/account", { method: "POST", payload: { action: "email", email } }),
  requestReset: (id) => callApi("/api/reset", { method: "POST", payload: { action: "request", id } }),
  confirmReset: (id, token, code) =>
    callApi("/api/reset", { method: "POST", payload: { action: "confirm", id, token, code } }),
  loadPrompts: () => callApi("/api/prompts"),
  savePrompts: (items) => callApi("/api/prompts", { method: "PUT", payload: { items } }),
  loadUsage: () => callApi("/api/usage"),
  addUsage: (delta) => callApi("/api/usage", { method: "POST", payload: { delta } }),
};
