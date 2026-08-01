/* Vérificateur — il tourne AVANT qu'on déclare quoi que ce soit.
   Rejoue les parcours contre un déploiement réel et fouille le bundle.

     vercel env pull .env.local
     BASE_URL=https://…vercel.app VERIFY_USER=karl VERIFY_CODE=… npm run verify

   Chaque assertion affiche ce qu'elle a mesuré. Un seul échec fait sortir
   en code 1 : rien ne se déclare au vert sur une impression.
*/

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

loadEnvFile(".env.local");
loadEnvFile(".env");

const BASE = (process.env.BASE_URL || "").replace(/\/$/, "");
const USER = process.env.VERIFY_USER || "karl";
const CODE = process.env.VERIFY_CODE || "";
const ANTHROPIC = process.env.ANTHROPIC_TEST_KEY || process.env.ANTHROPIC_API_KEY || "";

let failures = 0;
let cookie = "";

function assert(label, condition, detail = "") {
  const mark = condition ? "✓" : "✗";
  if (!condition) failures += 1;
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
}

function section(title) {
  console.log(`\n[1m${title}[0m`);
}

/* ---------- 1. le bundle ne contient aucun secret ---------- */

section("Bundle");

const SECRET_NAMES = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "SESSION_SECRET",
  "RESEND_API_KEY",
  "ANTHROPIC_TEST_KEY",
  "ANTHROPIC_API_KEY",
];

let bundle = "";
try {
  bundle = readAll("dist");
} catch {
  assert("dist/ construit", false, "lance `npm run build` d'abord");
}

if (bundle) {
  assert("dist/ construit", true, `${Math.round(bundle.length / 1024)} Ko lus`);

  for (const name of SECRET_NAMES) {
    const value = process.env[name];
    if (!value || value.length < 8) continue;
    assert(`aucune trace de ${name}`, !bundle.includes(value));
  }

  assert("aucun code d'accès en clair", !CODE || !bundle.includes(CODE));
  assert("aucun condensat scrypt", !bundle.includes("scrypt$"));
  assert("aucune clé Anthropic", !/sk-ant-[A-Za-z0-9_-]{20,}/.test(bundle));
  assert("aucun jeton Upstash", !/\bAX[A-Za-z0-9_-]{30,}/.test(bundle));
  assert("aucune variable VITE_ sensible", !/VITE_[A-Z_]*(KEY|TOKEN|SECRET)/.test(bundle));
}

/* ---------- 2. l'accès ---------- */

if (!BASE) {
  section("Accès");
  console.log("… ignoré : BASE_URL non fourni.");
} else {
  section(`Accès — ${BASE}`);

  const anon = await call("/api/session");
  assert("GET /api/session répond 200", anon.status === 200, `reçu ${anon.status}`);
  assert("anonyme = non authentifié", anon.body?.authenticated === false);
  assert("trois prénoms proposés", anon.body?.users?.length === 3, list(anon.body?.users));

  const wrong = await call("/api/login", "POST", { id: USER, code: "code-manifestement-faux" });
  assert("mauvais code bloqué", wrong.status === 401, `reçu ${wrong.status}`);
  assert("aucun cookie posé sur échec", !wrong.cookie);

  if (!CODE) {
    console.log("… suite ignorée : VERIFY_CODE non fourni.");
  } else {
    const good = await call("/api/login", "POST", { id: USER, code: CODE });
    assert("bon code accepté", good.status === 200, `reçu ${good.status} ${good.body?.error || ""}`);
    assert("cookie httpOnly + Secure", /HttpOnly/i.test(good.cookieRaw) && /Secure/i.test(good.cookieRaw));
    cookie = good.cookie;

    const me = await call("/api/session");
    assert("session reconnue", me.body?.authenticated === true);
    assert("bon utilisateur", me.body?.user?.id === USER, me.body?.user?.id);

    /* bibliothèque : écrire, relire, effacer */
    const marker = `vérification ${new Date().toISOString()}`;
    const before = await call("/api/prompts");
    const existing = before.body?.items || [];
    const probe = {
      id: `verify-${Date.now()}`,
      title: marker,
      idea: "sonde du vérificateur",
      mode: "nouvelle",
      prompt: "# QUI TU ES\nsonde\n# SORTIE\nSinon tu continues.",
      count: 52,
      limit: 3000,
      version: 1,
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const written = await call("/api/prompts", "PUT", { items: [probe, ...existing] });
    assert("PUT /api/prompts accepté", written.status === 200, `reçu ${written.status}`);

    const reread = await call("/api/prompts");
    assert(
      "prompt relu après écriture",
      (reread.body?.items || []).some((i) => i.title === marker)
    );

    const cleaned = await call("/api/prompts", "PUT", { items: existing });
    assert("suppression acceptée", cleaned.status === 200);
    const after = await call("/api/prompts");
    assert(
      "sonde effacée",
      !(after.body?.items || []).some((i) => i.title === marker),
      `${(after.body?.items || []).length} entrées restantes`
    );

    /* cloisonnement : sans cookie, rien */
    const naked = await callRaw("/api/prompts");
    assert("bibliothèque fermée sans session", naked.status === 401, `reçu ${naked.status}`);

    const out = await call("/api/logout", "POST");
    assert("déconnexion acceptée", out.status === 200);
    cookie = "";
    const gone = await call("/api/session");
    assert("session éteinte après sortie", gone.body?.authenticated === false);
  }
}

/* ---------- 3. le générateur, contre la vraie API ---------- */

section("Générateur (appel direct Anthropic)");

if (!ANTHROPIC) {
  console.log("… ignoré : ANTHROPIC_TEST_KEY non fourni.");
} else {
  const limit = 3000;
  const { buildMeta } = await import("../src/meta.js");
  const { runVerifiedGeneration } = await import("../src/generate.js");

  const base = [
    {
      role: "user",
      content:
        buildMeta(limit) +
        "MODE : créer le produit fondateur d'une NOUVELLE start-up. L'agent part de zéro." +
        "\n\nIDÉE :\nune conciergerie de copropriétés pilotée par des agents",
    },
  ];

  let httpOk = true;

  /* Exactement la boucle de l'atelier : générer, mesurer, réparer. */
  const run = await runVerifiedGeneration({
    ask: async (convo) => {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 2700,
          thinking: { type: "disabled" },
          messages: convo,
        }),
      });
      if (!response.ok) {
        httpOk = false;
        throw new Error(`api.anthropic.com a répondu ${response.status}`);
      }
      const data = await response.json();
      return (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    },
    baseConvo: base,
    instruction:
      "ÉTAPE 2 — Génère MAINTENANT le system prompt final. Texte brut uniquement : pas de backticks, " +
      "pas de commentaire, pas de préambule. Huit sections '# EN MAJUSCULES', " +
      `moins de ${limit} caractères, vise 2200 à 2700.`,
    limit,
    onLog: (line) => console.log(`   · ${line}`),
  }).catch((error) => {
    assert("api.anthropic.com répond 200", false, error.message);
    return null;
  });

  if (run) {
    const sections = [
      "# QUI TU ES",
      "# TON PRODUIT",
      "# COMMENT TU DÉCIDES",
      "# INVARIANTS",
      "# ENVIRONNEMENT",
      "# VÉRIFICATION",
      "# ESCALADE",
      "# SORTIE",
    ];
    const found = sections.filter((s) => run.text.includes(s));

    assert("api.anthropic.com répond 200", httpOk);
    assert("huit sections présentes", found.length === 8, `${found.length}/8`);
    assert("dans l'ordre", inOrder(run.text, sections));
    assert(
      `sous la limite (${limit}) après réparation`,
      run.check.pass,
      `${run.check.count} caractères en ${run.attempts} tentative(s)`
    );
    assert("finit par « Sinon tu continues. »", run.text.trim().endsWith("Sinon tu continues."));
  }
}

/* ---------- verdict ---------- */

console.log(
  failures === 0
    ? "\n[32mAssertions au vert.[0m"
    : `\n[31m${failures} assertion(s) en échec.[0m`
);
process.exit(failures === 0 ? 0 : 1);

/* ---------- outils ---------- */

async function callRaw(path, method = "GET", payload, withCookie = false) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(withCookie && cookie ? { Cookie: cookie } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    redirect: "manual",
  });
  const cookieRaw = response.headers.get("set-cookie") || "";
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* pas de JSON : le statut suffit */
  }
  return {
    status: response.status,
    body,
    cookieRaw,
    cookie: (cookieRaw.split(";")[0] || "").startsWith("bpg_session=") ? cookieRaw.split(";")[0] : "",
  };
}

function call(path, method, payload) {
  return callRaw(path, method, payload, true);
}

function readAll(dir) {
  let out = "";
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out += readAll(path);
    else if (/\.(js|css|html|map|json)$/.test(name)) out += readFileSync(path, "utf8");
  }
  return out;
}

function inOrder(text, markers) {
  let cursor = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index <= cursor) return false;
    cursor = index;
  }
  return true;
}

function list(users) {
  return (users || []).map((u) => u.name).join(", ");
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
