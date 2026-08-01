/* Bibliothèque personnelle.

   Le serveur fait foi : la bibliothèque suit son propriétaire d'un appareil
   à l'autre. Le navigateur en garde un double, qui prend le relais si la
   clé-valeur est momentanément injoignable — on ne perd jamais un prompt
   sur une panne de réseau. */

import { api } from "./api.js";

const localKey = (userId) => `atelier-boris:bibliotheque:${userId}`;

function readLocal(userId) {
  try {
    const raw = localStorage.getItem(localKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(userId, items) {
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export async function loadLibrary(userId) {
  try {
    const { items } = await api.loadPrompts();
    const list = Array.isArray(items) ? items : [];
    writeLocal(userId, list);
    return { items: list, remote: true };
  } catch {
    return { items: readLocal(userId), remote: false };
  }
}

export async function persistLibrary(userId, items) {
  writeLocal(userId, items);
  try {
    await api.savePrompts(items);
    return { ok: true, remote: true };
  } catch (error) {
    return { ok: false, remote: false, error: error.message };
  }
}

export const countChars = (value) => [...String(value)].length;

export function makeEntry({ idea, mode, prompt, limit, version, title, chat }) {
  const now = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: (title || idea || "").trim().slice(0, 90) || "Sans titre",
    idea: (idea || "").trim(),
    mode: mode === "existante" ? "existante" : "nouvelle",
    prompt,
    count: countChars(prompt),
    limit,
    version,
    chat: Array.isArray(chat) ? chat : [],
    savedAt: now,
    updatedAt: now,
  };
}

/* ================================================================
   Le fil de correction.

   Chaque génération porte son fil : ce qu'on a demandé, ce qui est
   sorti. Il vit dans l'entrée de bibliothèque — donc dans le profil de
   son propriétaire, et il le suit d'un appareil à l'autre.
   ================================================================ */

export const MAX_TURNS = 40;

/* Combien de réponses gardent leur texte entier. Le fil sert à corriger,
   pas à archiver : au-delà des trois dernières, une ligne suffit à dire ce
   qui s'est passé, et la bibliothèque reste sous la taille que le magasin
   accepte. Sans cette coupe, douze corrections sur une entrée pèsent déjà
   plus que la limite de charge utile. */
const KEEP_FULL = 3;

export function appendTurn(chat, turn) {
  const list = Array.isArray(chat) ? chat : [];
  const next = [...list, { ...turn, at: turn.at || new Date().toISOString() }];
  return compactChat(next.slice(-MAX_TURNS));
}

export function compactChat(chat) {
  const keep = new Set();
  for (let i = chat.length - 1; i >= 0 && keep.size < KEEP_FULL; i -= 1) {
    if (chat[i].role === "atelier" && !chat[i].compacted) keep.add(i);
  }

  return chat.map((turn, i) => {
    if (turn.role !== "atelier" || turn.compacted || keep.has(i)) return turn;
    return {
      role: "atelier",
      at: turn.at,
      version: turn.version,
      count: turn.count,
      pass: turn.pass,
      compacted: true,
      text: `v${turn.version} — ${turn.count} caractères, ${
        turn.pass ? "au vert" : "hors limite"
      }. Texte plus ancien, non conservé.`,
    };
  });
}

/* Une réponse dont le texte a survécu peut être remise en place. */
export const canRestore = (turn) =>
  Boolean(turn && turn.role === "atelier" && !turn.compacted && turn.text);

/* ================================================================
   Ce qu'on peut faire d'un prompt qu'on possède.

   Tout ce qui suit est PUR — pas de `document`, pas de `fetch` : le
   vérificateur les rejoue en Node, sans navigateur. La seule exception
   est `downloadText`, qui ne touche au DOM qu'à l'appel.
   ================================================================ */

const SCHEMA = "atelier-boris/bibliotheque@1";

/* Un titre devient un nom de fichier : accents retirés, tout en minuscules,
   rien qu'un système de fichiers puisse mal prendre. */
export function slugify(value) {
  const clean = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return clean || "prompt";
}

/* Le prompt part dans une clôture de code : ses huit sections commencent
   par `#`, elles deviendraient des titres Markdown sans elle. */
export function toMarkdown(entry) {
  const modifie =
    entry.updatedAt && entry.updatedAt !== entry.savedAt
      ? `, modifié le ${formatDate(entry.updatedAt)}`
      : "";
  const lines = [
    `# ${entry.title || "Sans titre"}`,
    "",
    `> v${entry.version} · ${entry.count} caractères · limite ${entry.limit}`,
    `> Enregistré le ${formatDate(entry.savedAt)}${modifie}`,
  ];
  if (entry.idea) lines.push("", "## L'idée de départ", "", entry.idea);
  lines.push("", "## Le prompt", "", "```", entry.prompt, "```", "");
  return lines.join("\n");
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/* « X » → « X (copie) » → « X (copie 2) » : dupliquer deux fois ne donne
   jamais deux cartes au même nom. */
function nextCopyTitle(title) {
  const base = String(title || "Sans titre");
  const match = /^(.*) \(copie(?: (\d+))?\)$/.exec(base);
  if (!match) return `${base} (copie)`.slice(0, 160);
  return `${match[1]} (copie ${match[2] ? Number(match[2]) + 1 : 2})`.slice(0, 160);
}

export function duplicateEntry(entry) {
  const now = new Date().toISOString();
  return { ...entry, id: newId(), title: nextCopyTitle(entry.title), savedAt: now, updatedAt: now };
}

export function renameEntry(items, id, title) {
  const clean = String(title || "").trim().slice(0, 160) || "Sans titre";
  return items.map((item) =>
    item.id === id ? { ...item, title: clean, updatedAt: new Date().toISOString() } : item
  );
}

export function exportBundle(items, owner) {
  return JSON.stringify(
    { schema: SCHEMA, owner, exportedAt: new Date().toISOString(), count: items.length, items },
    null,
    2
  );
}

/* Un fichier importé vient du dehors : on ne garde que des entrées qu'on
   a soi-même reconstruites, champ par champ. */
function normalize(raw) {
  const prompt = String(raw.prompt);
  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : new Date().toISOString();
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    title: String(raw.title || raw.idea || "").trim().slice(0, 160) || "Sans titre",
    idea: String(raw.idea || "").trim(),
    prompt,
    count: countChars(prompt),
    limit: Number(raw.limit) > 0 ? Number(raw.limit) : 3900,
    version: Number(raw.version) > 0 ? Number(raw.version) : 1,
    chat: Array.isArray(raw.chat)
      ? compactChat(
          raw.chat
            .filter((t) => t && typeof t.text === "string")
            .slice(-MAX_TURNS)
            .map((t) => ({
              role: t.role === "moi" ? "moi" : "atelier",
              text: t.text,
              at: typeof t.at === "string" ? t.at : savedAt,
              ...(t.version ? { version: Number(t.version) } : {}),
              ...(t.count ? { count: Number(t.count) } : {}),
              ...(t.pass != null ? { pass: Boolean(t.pass) } : {}),
              ...(t.compacted ? { compacted: true } : {}),
            }))
        )
      : [],
    savedAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : savedAt,
  };
}

export function parseBundle(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { items: [], error: "Ce fichier n'est pas du JSON." };
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
  if (!list) return { items: [], error: "Aucune liste de prompts dans ce fichier." };
  const items = list
    .filter((entry) => entry && typeof entry.prompt === "string" && entry.prompt.trim())
    .map(normalize);
  if (!items.length) return { items: [], error: "Aucun prompt exploitable dans ce fichier." };
  return { items, error: "" };
}

/* Un import n'écrase jamais plus récent que lui : à identifiant égal, c'est
   la date de modification qui tranche. Importer deux fois le même fichier
   ne change donc rien la seconde fois. */
export function mergeLibraries(current, incoming) {
  const stamp = (entry) => Date.parse(entry.updatedAt || entry.savedAt) || 0;
  const byId = new Map(current.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of incoming) {
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      added += 1;
    } else if (stamp(entry) > stamp(existing)) {
      byId.set(entry.id, entry);
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  const items = [...byId.values()].sort((a, b) => stamp(b) - stamp(a));
  return { items, added, updated, skipped };
}

/* Seule fonction de ce bloc à toucher le DOM, et seulement à l'appel. */
export function downloadText(filename, text, mime = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
