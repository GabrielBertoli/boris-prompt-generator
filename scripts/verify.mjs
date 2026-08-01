/* Vérificateur — il tourne AVANT qu'on déclare quoi que ce soit.
   Rejoue les parcours contre un déploiement réel et fouille le bundle.

     vercel env pull .env.local
     BASE_URL=https://…vercel.app VERIFY_USER=karl VERIFY_CODE=… npm run verify

   Chaque assertion affiche ce qu'elle a mesuré. Un seul échec fait sortir
   en code 1 : rien ne se déclare au vert sur une impression.
*/

import {
  appendFileSync,
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { extname, join } from "node:path";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";

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
  "ANTHROPIC_SHARED_KEY",
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

  const anon = await callRaw("/api/session");
  assert("GET /api/session répond 200", anon.status === 200, `reçu ${anon.status}`);
  assert("anonyme = non authentifié", anon.body?.authenticated === false);
  /* La liste attendue est nommée, pas comptée : ajouter quelqu'un et
     oublier de le semer ne doit pas passer inaperçu. */
  const EXPECTED = ["Gabriel", "Karl", "Raphaëlle", "Gabriela"];
  const served = (anon.body?.users || []).map((u) => u.name);
  assert(
    "les prénoms attendus sont proposés",
    EXPECTED.every((n) => served.includes(n)) && served.length === EXPECTED.length,
    served.join(", ")
  );
  assert(
    "aucune clé servie au portail",
    !anon.body?.sharedKey && !JSON.stringify(anon.body).includes("sk-ant-")
  );

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

    /* La clé de l'atelier ne sort que pour une session valide. */
    const shared = process.env.ANTHROPIC_SHARED_KEY;
    if (shared) {
      assert(
        "clé de l'atelier servie à la session",
        me.body?.sharedKey === shared,
        me.body?.sharedKey ? "reçue" : "absente"
      );
      assert("clé de l'atelier absente du bundle", !bundle || !bundle.includes(shared));
    } else {
      console.log("… clé de l'atelier non vérifiée : ANTHROPIC_SHARED_KEY absent en local.");
    }

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

/* ---------- 3. mobile : aucun débordement horizontal ---------- */

section("Mobile");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!existsSync(CHROME) || !bundle) {
  console.log("… ignoré : Chrome ou dist/ introuvable.");
} else {
  const probe = join(tmpdir(), `bpg-probe-${process.pid}`);
  rmSync(probe, { recursive: true, force: true });
  cpSync("dist", probe, { recursive: true });

  /* `--window-size` est ignoré par ce Chrome headless : le viewport reste
     à 485 px quoi qu'on demande. On force donc la largeur de mise en page
     depuis la page elle-même, puis on cherche un élément plus large que
     son conteneur — la signature d'un `min-width: auto` non maîtrisé. */
  appendFileSync(
    join(probe, "index.html"),
    `<script>setTimeout(() => {
      const out = [];
      for (const W of [320, 360, 390, 430]) {
        document.documentElement.style.width = W + "px";
        document.documentElement.style.overflowX = "visible";
        document.body.style.overflowX = "visible";
        void document.body.offsetWidth;
        let over = 0;
        document.querySelectorAll("*").forEach((el) => {
          if (el.id !== "PROBE" && el.getBoundingClientRect().width > W + 1) over += 1;
        });
        out.push(W + ":" + over);
      }
      const p = document.createElement("pre");
      p.id = "PROBE";
      p.textContent = out.join(" ");
      document.body.appendChild(p);
    }, 1200);</script>`
  );

  const server = createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    if (url.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, authenticated: false, users: [], user: null }));
    }
    try {
      const file = url === "/" ? "/index.html" : url;
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
      res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
      res.end(readFileSync(join(probe, file)));
    } catch {
      res.writeHead(404).end("");
    }
  });

  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  /* Lancement ASYNCHRONE, impérativement.
     Mesuré : `execFileSync` bloque la boucle d'événements de Node — le
     serveur ouvert juste au-dessus, dans ce même processus, ne pouvait
     alors plus répondre à Chrome. Interblocage parfait, vérificateur
     suspendu sans un octet de sortie.
     Pas de `--user-data-dir` jetable : mesuré, un profil neuf fait pendre
     `--dump-dom` au-delà de la minute, là où le profil par défaut rend la
     main en quelques secondes. Le garde-fou est le délai ci-dessous. */
  let dom = "";
  try {
    dom = await new Promise((resolve, reject) => {
      const child = execFile(
        CHROME,
        [
          "--headless=new",
          "--disable-gpu",
          "--virtual-time-budget=6000",
          "--dump-dom",
          `http://localhost:${port}/`,
        ],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
        (error, stdout) => (error ? reject(error) : resolve(stdout))
      );
      setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Chrome n'a pas rendu la main en 60 s"));
      }, 60000).unref();
    });
  } catch (error) {
    assert("Chrome a répondu", false, error.message.split("\n")[0]);
  }

  server.close();
  rmSync(probe, { recursive: true, force: true });

  const found = /id="PROBE">([^<]*)</.exec(dom);
  if (dom && !found) {
    assert("mesure du débordement obtenue", false, "sonde muette");
  } else if (found) {
    for (const pair of found[1].trim().split(" ")) {
      const [width, over] = pair.split(":");
      assert(`aucun débordement à ${width} px`, Number(over) === 0, `${over} élément(s) trop large(s)`);
    }
  }
}

/* ---------- 4. le générateur, contre la vraie API ---------- */

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
