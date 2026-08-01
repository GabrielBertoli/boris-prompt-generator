/* Pose les codes initiaux dans la clé-valeur.
   À lancer une fois, depuis un poste de confiance :

     vercel env pull .env.local
     node scripts/seed.mjs karl=… raphaelle=… gabriela=…

   Les codes ne sont jamais écrits dans le dépôt : ils passent en argument
   et ressortent hachés (scrypt). Sans SESSION_SECRET le hachage marche
   quand même — il ne sert qu'aux jetons.
*/

import { readFileSync } from "node:fs";
import { hashCode } from "../api/_lib/crypto.js";

loadEnvFile(".env.local");
loadEnvFile(".env");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!URL_ || !TOKEN) {
  console.error("KV_REST_API_URL / KV_REST_API_TOKEN absents. Lance `vercel env pull .env.local`.");
  process.exit(1);
}

const KNOWN = ["karl", "raphaelle", "gabriela"];
const pairs = process.argv.slice(2).map((arg) => {
  const index = arg.indexOf("=");
  return [arg.slice(0, index), arg.slice(index + 1)];
});

if (!pairs.length) {
  console.error("Usage : node scripts/seed.mjs karl=CODE raphaelle=CODE gabriela=CODE");
  process.exit(1);
}

for (const [id, code] of pairs) {
  if (!KNOWN.includes(id)) {
    console.error(`Prénom inconnu : ${id}`);
    process.exit(1);
  }
  if (!code || code.length < 4) {
    console.error(`Code trop court pour ${id} (4 caractères minimum).`);
    process.exit(1);
  }
}

for (const [id, code] of pairs) {
  const hash = await hashCode(code);
  await command(["SET", `bpg:user:${id}:code`, hash]);
  console.log(`✓ ${id} — code posé (scrypt, ${hash.length} caractères de condensat)`);
}

console.log("\nTerminé. Les codes en clair n'existent nulle part ailleurs.");

async function command(args) {
  const response = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args.map(String)),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(`KV ${args[0]} : ${payload.error || response.status}`);
  }
  return payload.result;
}

function loadEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
