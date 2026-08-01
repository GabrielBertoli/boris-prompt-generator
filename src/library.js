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

export function makeEntry({ idea, mode, prompt, limit, version, title }) {
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
    savedAt: now,
    updatedAt: now,
  };
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
