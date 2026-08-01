/* Clé-valeur : Upstash Redis via son API REST.
   Aucune dépendance npm — un POST suffit, c'est la brique la plus simple.
   Les deux jeux de noms de variables sont acceptés : l'intégration Vercel
   Marketplace pose KV_REST_API_*, l'intégration native Upstash UPSTASH_*. */

const URL_ =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.REDIS_REST_URL;

const TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.REDIS_REST_TOKEN;

export function kvConfigured() {
  return Boolean(URL_ && TOKEN);
}

async function command(args) {
  if (!kvConfigured()) {
    throw new Error("KV non configuré : KV_REST_API_URL / KV_REST_API_TOKEN manquants.");
  }
  const response = await fetch(URL_, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.map(String)),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Réponse KV illisible (${response.status})`);
  }
  if (!response.ok || payload.error) {
    throw new Error(`KV ${args[0]} a échoué : ${payload.error || response.status}`);
  }
  return payload.result;
}

export const kv = {
  async get(key) {
    const value = await command(["GET", key]);
    return value === null || value === undefined ? null : String(value);
  },
  async set(key, value) {
    return command(["SET", key, value]);
  },
  async setEx(key, value, seconds) {
    return command(["SET", key, value, "EX", seconds]);
  },
  async del(key) {
    return command(["DEL", key]);
  },
  async incrEx(key, seconds) {
    const count = Number(await command(["INCR", key]));
    if (count === 1) await command(["EXPIRE", key, seconds]);
    return count;
  },
  /* Atomique : deux onglets qui génèrent en même temps ne se perdent pas. */
  async incrByFloat(key, delta) {
    return Number(await command(["INCRBYFLOAT", key, delta]));
  },
  async getJson(key, fallback) {
    const raw = await this.get(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  async setJson(key, value) {
    return this.set(key, JSON.stringify(value));
  },
};
