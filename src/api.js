/* ================================================================
   Deux surfaces réseau, volontairement séparées.

   1. Anthropic — appelé DIRECTEMENT par le navigateur, avec la clé du
      visiteur. Elle ne quitte jamais sa machine, aucune fonction
      serverless ne la voit. D'où l'en-tête de sortie de secours
      anthropic-dangerous-direct-browser-access.
   2. /api/* — l'accès, et rien d'autre.
   ================================================================ */

import { messageRefus } from "./harnais.js";

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

/* Appel EN FLUX, et borné dans le temps.

   Mesuré le 2026-08-01 : une génération pouvait tourner plus de trois
   minutes sans qu'aucune limite ne s'y oppose et sans qu'aucun caractère
   n'apparaisse. Deux causes, corrigées ici :

   1. rien ne bornait l'attente — un `fetch` qui traîne ne se termine
      jamais de lui-même, et la boucle de réparation en enchaîne cinq ;
   2. rien ne s'affichait avant la fin — une réponse d'une minute était
      indiscernable d'un blocage.

   D'où le flux (le texte arrive au fur et à mesure, `onDelta`), un délai
   d'INACTIVITÉ réarmé à chaque morceau reçu — c'est le silence qui est
   anormal, pas la durée — et un plafond dur au-dessus de tout. */

/* Les modèles qui refusent `thinking: disabled`, et la place qu'on leur
   rend en plus de ce que l'atelier demande pour le texte seul. */
export const PENSE_TOUJOURS = /^claude-(fable|mythos|opus-5-5)/;
export const MARGE_REFLEXION = 16000;

const STALL_MS = 60000; // silence toléré entre deux morceaux
/* Un modèle qui pense toujours se tait pendant qu'il pense : sa réflexion
   n'est pas affichée, et le premier mot n'arrive qu'après. À effort
   `high`, une minute de silence n'est pas une panne. Le plafond absolu,
   lui, ne bouge pas. */
export const STALL_MS_PENSEUR = 150000;
const HARD_MS = 300000; // plafond absolu d'un seul appel

/* Levée quand C'EST L'UTILISATEUR qui arrête, et reconnaissable comme
   telle : un arrêt volontaire n'est pas une panne, et l'atelier ne doit ni
   l'afficher en rouge, ni le confondre avec un silence du modèle. */
export class Arret extends Error {
  constructor() {
    super("Arrêté.");
    this.name = "Arret";
    this.arret = true;
  }
}

export async function callClaude(
  messages,
  { apiKey, model, maxTokens = 4000, system, onDelta, signal, effort } = {}
) {
  if (!apiKey) throw new Error("Aucune clé API — ouvre les réglages et colle la tienne.");
  if (signal?.aborted) throw new Arret();

  const payload = { model, max_tokens: maxTokens, messages, stream: true };
  if (system) payload.system = system;
  /* L'effort du rôle (voir `ROLES` dans meta.js) : sur Opus 5.5, le seul
     réglage de profondeur. */
  if (effort) payload.output_config = { effort };

  // Réflexion coupée : la longueur de sortie reste prévisible sous max_tokens,
  // et la boucle d'assertions joue déjà le rôle d'auto-correction.
  // Fable, Mythos et Opus 5.5 pensent toujours et refusent le réglage (400) :
  // on l'omet — et on leur rend la place que la réflexion prend. Elle se
  // compte DANS max_tokens : avec les 1200 jetons de l'analyse, un modèle qui
  // pense aurait tout dépensé avant d'écrire la première accolade, et
  // l'atelier aurait dit « réponse coupée » sur une demande parfaitement saine.
  // La marge n'est pas facturée : seuls les jetons produits le sont.
  if (PENSE_TOUJOURS.test(model)) {
    payload.max_tokens = maxTokens + MARGE_REFLEXION;
  } else {
    payload.thinking = { type: "disabled" };
  }

  const controller = new AbortController();
  let expired = "";
  let arrete = false;
  let stall;

  /* L'arrêt demandé par l'utilisateur passe par le MÊME contrôleur que les
     délais : un seul point d'abandon, donc un seul chemin à vérifier. Le
     drapeau distingue ensuite les trois causes possibles — arrêt voulu,
     silence du modèle, plafond de durée — qui n'appellent pas la même
     phrase à l'écran. */
  const arreter = () => {
    arrete = true;
    controller.abort();
  };
  signal?.addEventListener("abort", arreter, { once: true });

  /* Réarmé à chaque morceau : un modèle lent reste acceptable, un modèle
     muet ne l'est pas. */
  const silence = PENSE_TOUJOURS.test(model) ? STALL_MS_PENSEUR : STALL_MS;
  const arm = () => {
    clearTimeout(stall);
    stall = setTimeout(() => {
      expired = `api.anthropic.com n'a plus rien envoyé depuis ${silence / 1000} s — appel abandonné.`;
      controller.abort();
    }, silence);
  };
  const hard = setTimeout(() => {
    expired = `L'appel a dépassé ${HARD_MS / 1000} s — abandonné.`;
    controller.abort();
  }, HARD_MS);
  const disarm = () => {
    clearTimeout(stall);
    clearTimeout(hard);
    signal?.removeEventListener("abort", arreter);
  };

  let response;
  arm();
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
      signal: controller.signal,
    });
  } catch {
    disarm();
    if (arrete) throw new Arret();
    if (expired) throw new Error(expired);
    throw new Error("Le navigateur n'a pas pu joindre api.anthropic.com (réseau ou blocage).");
  }

  if (!response.ok) {
    disarm();
    let detail = "";
    try {
      const error = await response.json();
      detail = error?.error?.message || "";
    } catch {
      /* corps illisible : le code HTTP parle déjà */
    }
    throw new Error(describe(response.status, detail));
  }

  let text = "";
  let stopReason = null;
  /* La catégorie d'un refus (`stop_details`), lue dans le même événement
     que `stop_reason` : c'est elle qui dit POURQUOI. */
  let stopDetails = null;
  const usage = { input_tokens: 0, output_tokens: 0 };

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;

        let event;
        try {
          event = JSON.parse(raw);
        } catch {
          continue; // morceau incomplet : il reviendra entier
        }

        if (event.type === "message_start" && event.message?.usage) {
          Object.assign(usage, event.message.usage);
        } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          text += event.delta.text;
          onDelta?.(text);
        } else if (event.type === "message_delta") {
          if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
          const details = event.delta?.stop_details || event.stop_details;
          if (details) stopDetails = details;
          if (event.usage?.output_tokens != null) usage.output_tokens = event.usage.output_tokens;
        } else if (event.type === "error") {
          throw new Error(event.error?.message || "Le flux a été interrompu par une erreur.");
        }
      }
    }
  } catch (error) {
    if (arrete) throw new Arret();
    if (expired) throw new Error(expired);
    throw error;
  } finally {
    disarm();
  }

  if (stopReason === "refusal") {
    const refus = new Error(messageRefus(stopDetails));
    refus.categorie = stopDetails?.category || null;
    /* Anthropic facture les jetons produits avant de refuser — ce refus
       coûte, et l'atelier ne le comptait pas : l'erreur ne portait que le
       message, jamais l'usage reçu dans le flux. Jointe ici, elle laisse
       l'appelant (`ask` dans App.jsx) ajouter le coût dans son catch. */
    refus.usage = usage;
    throw refus;
  }

  if (!text.trim()) {
    /* Vide ET coupé : ce n'est pas le texte qui a pris la place, c'est la
       réflexion — elle se compte dans max_tokens même quand elle n'est
       pas rendue. Baisser la limite de caractères, ce que l'écran
       conseillait, n'y change rien. */
    if (stopReason === "max_tokens") {
      throw new Error(
        "Réponse coupée : la réflexion du modèle a consommé tout le budget de jetons avant le premier mot. Relance ; si ça se répète, l'effort est trop haut pour ce budget."
      );
    }
    throw new Error("Réponse vide du modèle.");
  }

  return { text, truncated: stopReason === "max_tokens", usage };
}

function describe(status, detail) {
  const suffix = detail ? ` — ${detail}` : "";
  /* Le crédit prépayé du compte de la clé est vide (vécu le 2026-09-23 sur
     la clé de l'atelier). L'erreur brute, en anglais, parlait de « Plans &
     Billing » à quelqu'un qui n'a pas la main sur ce compte ; ce qu'il peut
     faire, lui, c'est coller sa propre clé. */
  if (/credit balance is too low/i.test(detail))
    return "La clé utilisée n'a plus de crédit Anthropic. Colle ta propre clé API dans Réglages pour continuer — elle reste dans ce navigateur.";
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
