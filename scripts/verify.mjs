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

/* ---------- 1 bis. ce qu'on fait d'un prompt qu'on possède ----------
   Renommer, dupliquer, télécharger, exporter, réimporter : tout cela est
   écrit en fonctions pures dans src/library.js, précisément pour être
   rejoué ici sans navigateur. */

section("Bibliothèque — renommer, dupliquer, exporter");

{
  const lib = await import("../src/library.js");

  assert("slugify nettoie accents et espaces", lib.slugify("Créer l'appli d'échecs !") === "creer-l-appli-d-echecs");
  assert("slugify ne rend jamais vide", lib.slugify("—  ") === "prompt", lib.slugify("—  "));

  const entry = lib.makeEntry({
    idea: "une conciergerie de copropriétés",
    prompt: "# QUI TU ES\nsonde\n# SORTIE\nSinon tu continues.",
    limit: 3900,
    version: 2,
  });

  const md = lib.toMarkdown(entry);
  assert("le Markdown porte le titre", md.startsWith("# une conciergerie de copropriétés"));
  assert("le prompt est clôturé", md.includes("```\n# QUI TU ES"), "sinon ses sections deviendraient des titres");
  assert("l'idée de départ est jointe", md.includes("## L'idée de départ"));

  const copy1 = lib.duplicateEntry(entry);
  const copy2 = lib.duplicateEntry(copy1);
  assert("dupliquer donne un nouvel identifiant", copy1.id !== entry.id);
  assert("le prompt est inchangé", copy1.prompt === entry.prompt);
  assert("la copie se nomme « (copie) »", copy1.title.endsWith(" (copie)"), copy1.title);
  assert("la copie d'une copie se numérote", copy2.title.endsWith(" (copie 2)"), copy2.title);

  const renamed = lib.renameEntry([entry, copy1], entry.id, "  Conciergerie v2  ");
  assert("renommer coupe les blancs", renamed[0].title === "Conciergerie v2", renamed[0].title);
  assert("renommer ne touche pas les autres", renamed[1].title === copy1.title);
  assert("un titre vide retombe sur « Sans titre »", lib.renameEntry([entry], entry.id, "   ")[0].title === "Sans titre");

  /* export → import : le tour complet doit rendre la même bibliothèque. */
  const shelf = [entry, copy1];
  const round = lib.parseBundle(lib.exportBundle(shelf, "karl"));
  assert("l'export se relit sans erreur", round.error === "", round.error);
  assert("rien ne se perd au passage", round.items.length === 2, `${round.items.length}/2`);
  assert("le prompt survit à l'aller-retour", round.items[0].prompt === shelf[0].prompt);

  assert("un fichier qui n'est pas du JSON est refusé", Boolean(lib.parseBundle("ceci n'est pas du json").error));
  assert("un JSON sans prompts est refusé", Boolean(lib.parseBundle('{"items":[{"titre":"vide"}]}').error));
  assert("une liste nue est acceptée", lib.parseBundle(JSON.stringify(shelf)).error === "");

  /* fusion : ajouter, mettre à jour le plus récent, ignorer le plus ancien */
  const older = { ...entry, prompt: "ancien", updatedAt: "2020-01-01T00:00:00.000Z" };
  const newer = { ...entry, prompt: "récent", updatedAt: "2099-01-01T00:00:00.000Z" };

  const add = lib.mergeLibraries([entry], [copy1]);
  assert("un inconnu est ajouté", add.added === 1 && add.items.length === 2);

  const beaten = lib.mergeLibraries([entry], [older]);
  assert("un import plus ancien est ignoré", beaten.skipped === 1 && beaten.items[0].prompt === entry.prompt);

  const wins = lib.mergeLibraries([entry], [newer]);
  assert("un import plus récent remplace", wins.updated === 1 && wins.items[0].prompt === "récent");

  const twice = lib.mergeLibraries(lib.mergeLibraries([], shelf).items, shelf);
  assert(
    "réimporter le même fichier ne duplique rien",
    twice.items.length === 2 && twice.added === 0,
    `${twice.items.length} entrées, ${twice.added} ajout(s)`
  );
}

/* ---------- 1 ter. le fil de correction ---------- */

section("Fil de correction");

{
  const lib = await import("../src/library.js");
  const { baseConvoFor, correctionInstruction, buildMeta } = await import("../src/meta.js");

  /* Un fil se construit par tours alternés. */
  let fil = [];
  fil = lib.appendTurn(fil, { role: "moi", text: "durcis l'escalade" });
  fil = lib.appendTurn(fil, { role: "atelier", text: "PROMPT-A", version: 2, count: 3200, pass: true });
  assert("un tour porte une date", Boolean(fil[0].at));
  assert("les rôles alternent", fil.map((t) => t.role).join(">") === "moi>atelier");

  /* La coupe : au-delà des trois dernières réponses, le texte cède la place
     à une ligne. Sans elle, douze corrections dépassent la charge utile. */
  for (let i = 3; i <= 8; i += 1) {
    fil = lib.appendTurn(fil, { role: "moi", text: `correction ${i}` });
    fil = lib.appendTurn(fil, {
      role: "atelier",
      text: `PROMPT-${i}`,
      version: i,
      count: 3000 + i,
      pass: true,
    });
  }

  const reponses = fil.filter((t) => t.role === "atelier");
  const entieres = reponses.filter((t) => !t.compacted);
  assert("seules les 3 dernières réponses gardent leur texte", entieres.length === 3, `${entieres.length}`);
  assert("ce sont bien les plus récentes", entieres.map((t) => t.version).join(",") === "6,7,8");
  assert(
    "une réponse coupée dit ce qu'elle était",
    reponses[0].compacted && reponses[0].text.includes("v2") && reponses[0].text.includes("3200"),
    reponses[0].text
  );
  assert("les demandes ne sont JAMAIS coupées", fil.filter((t) => t.role === "moi").every((t) => !t.compacted));
  assert("on ne restaure que ce qui a survécu", !lib.canRestore(reponses[0]) && lib.canRestore(reponses.at(-1)));

  /* Le fil est plafonné en nombre de tours. */
  let long = [];
  for (let i = 0; i < 60; i += 1) long = lib.appendTurn(long, { role: "moi", text: `t${i}` });
  assert(`le fil est plafonné à ${lib.MAX_TURNS} tours`, long.length === lib.MAX_TURNS, `${long.length}`);
  assert("ce sont les derniers qui restent", long.at(-1).text === "t59");

  /* Un fil survit à l'export et au réimport. */
  const withChat = { ...lib.makeEntry({ idea: "une idée", prompt: "# QUI TU ES\nx", limit: 3900, version: 3 }), chat: fil };
  const back = lib.parseBundle(lib.exportBundle([withChat], "karl"));
  assert("le fil survit à l'aller-retour d'export", back.items[0].chat.length === fil.length, `${back.items[0].chat.length}/${fil.length}`);
  assert("les tours coupés restent coupés", back.items[0].chat.filter((t) => t.role === "atelier" && !t.compacted).length === 3);
  assert("une entrée sans fil en reçoit un vide", lib.parseBundle('[{"prompt":"x"}]').items[0].chat.length === 0);

  /* La conversation se reconstruit sans la mémoire de la session. */
  const convo = baseConvoFor({ idea: "une conciergerie", prompt: "PROMPT-EN-COURS", limit: 3900 });
  assert("la reconstruction pose la méthode d'abord", convo[0].content.startsWith(buildMeta(3900).slice(0, 40)));
  assert("elle porte l'idée", convo[0].content.includes("une conciergerie"));
  assert("puis le prompt en vigueur, côté assistant", convo[1].role === "assistant" && convo[1].content === "PROMPT-EN-COURS");
  assert("sans prompt, un seul tour", baseConvoFor({ idea: "x", limit: 3900 }).length === 1);

  const consigne = correctionInstruction("  retire la section VÉRIFICATION  ", 3900);
  assert("la consigne cite la demande", consigne.includes("retire la section VÉRIFICATION"));
  assert("elle réclame les huit sections", consigne.includes("huit sections"));
  assert("elle rappelle la limite", consigne.includes("3900"));
  assert("elle interdit de commenter la correction", consigne.includes("aucune phrase qui parle"));
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
  const EXPECTED = ["Gabriel", "Karl", "Raphaëlle", "Gabriela", "Cécile"];
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
    /* La sonde porte un FIL : c'est le seul moyen de prouver que le serveur
       le conserve. Son `sanitize` reconstruit chaque entrée champ par champ
       et jette tout ce qu'il ne connaît pas — un fil non déclaré y
       disparaîtrait en silence, et le profil ne garderait rien. */
    const thread = [
      { role: "moi", text: "durcis l'escalade", at: new Date().toISOString() },
      {
        role: "atelier",
        text: "# QUI TU ES\nsonde corrigée\n# SORTIE\nSinon tu continues.",
        at: new Date().toISOString(),
        version: 2,
        count: 58,
        pass: true,
      },
      {
        role: "atelier",
        text: "v1 — 52 caractères, au vert. Texte plus ancien, non conservé.",
        at: new Date().toISOString(),
        version: 1,
        count: 52,
        pass: true,
        compacted: true,
      },
    ];

    const probe = {
      id: `verify-${Date.now()}`,
      title: marker,
      idea: "sonde du vérificateur",
      mode: "nouvelle",
      prompt: "# QUI TU ES\nsonde\n# SORTIE\nSinon tu continues.",
      count: 52,
      limit: 3000,
      version: 1,
      chat: thread,
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const written = await call("/api/prompts", "PUT", { items: [probe, ...existing] });
    assert("PUT /api/prompts accepté", written.status === 200, `reçu ${written.status}`);

    const reread = await call("/api/prompts");
    const saved = (reread.body?.items || []).find((i) => i.title === marker);
    assert("prompt relu après écriture", Boolean(saved));

    /* Le fil, dans le profil, après un vrai aller-retour serveur. */
    assert("le fil est conservé par le serveur", saved?.chat?.length === 3, `${saved?.chat?.length ?? 0}/3 tours`);
    assert("la demande revient intacte", saved?.chat?.[0]?.text === "durcis l'escalade");
    assert("le rôle est préservé", saved?.chat?.[0]?.role === "moi");
    assert(
      "la réponse revient avec sa version et sa mesure",
      saved?.chat?.[1]?.version === 2 && saved?.chat?.[1]?.count === 58 && saved?.chat?.[1]?.pass === true,
      `v${saved?.chat?.[1]?.version} · ${saved?.chat?.[1]?.count} car.`
    );
    assert("le texte du prompt corrigé revient entier", saved?.chat?.[1]?.text?.includes("sonde corrigée"));
    assert("un tour coupé reste marqué comme tel", saved?.chat?.[2]?.compacted === true);

    const cleaned = await call("/api/prompts", "PUT", { items: existing });
    assert("suppression acceptée", cleaned.status === 200);
    const after = await call("/api/prompts");
    assert(
      "sonde effacée",
      !(after.body?.items || []).some((i) => i.title === marker),
      `${(after.body?.items || []).length} entrées restantes`
    );

    /* compteur de dépense : lire, créditer, relire */
    const usage0 = await call("/api/usage");
    assert("GET /api/usage répond 200", usage0.status === 200, `reçu ${usage0.status}`);
    const before0 = Number(usage0.body?.total) || 0;
    const credited = await call("/api/usage", "POST", { delta: 0.000123 });
    assert("POST /api/usage accepté", credited.status === 200, `reçu ${credited.status}`);
    const usage1 = await call("/api/usage");
    const grew = Number(usage1.body?.total) - before0;
    assert("total incrémenté du delta", Math.abs(grew - 0.000123) < 1e-9, `+${grew.toFixed(6)} $`);
    const bad = await call("/api/usage", "POST", { delta: 999 });
    assert("delta absurde refusé", bad.status === 400, `reçu ${bad.status}`);
    const nakedUsage = await callRaw("/api/usage");
    assert("compteur fermé sans session", nakedUsage.status === 401, `reçu ${nakedUsage.status}`);

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

/* `--window-size` est ignoré par ce Chrome headless : le viewport reste
   à 485 px quoi qu'on demande. On force donc la largeur de mise en page
   depuis la page elle-même, puis on cherche un élément plus large que
   son conteneur — la signature d'un `min-width: auto` non maîtrisé. */
const PROBE_SCRIPT = `<script>
  /* Un élément en position fixe se dimensionne sur le VRAI viewport, jamais
     sur la largeur qu'on force ici : mesuré contre 320 px il paraîtrait
     toujours trop large, et il ne déborde pourtant rien — il ne participe
     pas au flux horizontal du document. On l'écarte de cette passe et on le
     contrôle à part, contre la largeur réelle de la fenêtre.
     (Pas d'accent grave dans ce commentaire : il vit dans un gabarit de
     chaîne, et le moindre backtick le refermerait.) */
  window.__mesure = (id) => {
    const out = [];
    for (const W of [320, 360, 390, 430]) {
      document.documentElement.style.width = W + "px";
      document.documentElement.style.overflowX = "visible";
      document.body.style.overflowX = "visible";
      void document.body.offsetWidth;
      let over = 0;
      document.querySelectorAll("*").forEach((el) => {
        if (el.id.startsWith("PROBE")) return;
        if (getComputedStyle(el).position === "fixed") return;
        if (el.getBoundingClientRect().width > W + 1) over += 1;
      });
      out.push(W + ":" + over);
    }
    document.documentElement.style.width = "";

    /* Les fixes, contre la fenêtre réelle : eux non plus n'ont pas le droit
       de dépasser, c'est simplement une autre référence. */
    void document.body.offsetWidth;
    let fixes = 0;
    document.querySelectorAll("*").forEach((el) => {
      if (getComputedStyle(el).position !== "fixed") return;
      if (el.getBoundingClientRect().width > window.innerWidth + 1) fixes += 1;
    });
    out.push("fixes:" + fixes);

    const p = document.createElement("pre");
    p.id = id;
    p.textContent = out.join(" ");
    document.body.appendChild(p);
  };
  /* Une surface qui met en scène (ouvrir un tiroir, charger un fil) prend
     la main : elle mesure quand SON état est en place, pas avant. */
  setTimeout(() => { if (!window.__manuel) window.__mesure("PROBE"); }, 1500);
</script>`;

/* DEUX surfaces, pas une.
   Jusqu'ici la sonde répondait « non authentifié » avec zéro prénom : elle
   ne mesurait donc qu'un portail vide, et l'atelier — ses cartes, leurs neuf
   boutons — n'avait jamais été mesuré à 320 px. Chaque surface porte un
   marqueur : sans lui dans le DOM, la mesure ne veut rien dire et un zéro
   débordement serait un faux vert. */
const CARTE_SONDE = {
  id: "sonde-verif",
  title: "Une conciergerie de copropriétés pilotée par des agents autonomes",
  idea: "une conciergerie de copropriétés pilotée par des agents",
  /* Le dernier tour de l'atelier porte EXACTEMENT le prompt de l'entrée :
     c'est l'état réel après une correction, et c'est celui qui affichait le
     prompt deux fois — une fois dans la feuille, une fois dans le fil. Le
     jeton ci-dessous permet de compter où il apparaît. */
  prompt: "# QUI TU ES\nsonde JETONPROMPT\n# SORTIE\nSinon tu continues.",
  count: 52,
  limit: 3900,
  version: 2,
  chat: [
    { role: "moi", text: "durcis l'escalade", at: "2026-08-01T10:00:00.000Z" },
    {
      role: "atelier",
      text: "# QUI TU ES\nsonde JETONPROMPT\n# SORTIE\nSinon tu continues.",
      at: "2026-08-01T10:00:30.000Z",
      version: 2,
      count: 52,
      pass: true,
    },
  ],
  savedAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const SURFACES = [
  {
    label: "portail",
    marker: "Karl",
    routes: {
      "/api/session": {
        ok: true,
        authenticated: false,
        user: null,
        users: [
          { id: "gabriel", name: "Gabriel", initial: "G" },
          { id: "karl", name: "Karl", initial: "K" },
          { id: "raphaelle", name: "Raphaëlle", initial: "R" },
          { id: "gabriela", name: "Gabriela", initial: "G" },
          { id: "cecile", name: "Cécile", initial: "C" },
        ],
      },
    },
  },
  {
    label: "atelier",
    marker: "La casse",
    routes: {
      "/api/session": {
        ok: true,
        authenticated: true,
        user: { id: "sonde", name: "Sonde", email: "" },
        users: [],
      },
      "/api/prompts": { ok: true, items: [CARTE_SONDE] },
      "/api/usage": { ok: true, total: 0.4237 },
    },
    /* Impression, pour de vrai : on clique le bouton et on regarde si la
       feuille est montée hors du #root avec le prompt dedans.
       `window.print` est neutralisé AVANT tout — ce script classique
       s'exécute avant le module différé de l'application. Sans cela, une
       boîte d'impression suspendrait Chrome, et le vérificateur avec. */
    /* Cette surface se met en scène avant de se laisser mesurer : le tiroir
       de la casse ouvert et un cassetin déplié d'abord — c'est là qu'un
       panneau de 340 px peut déborder un écran de 320 — puis le fil chargé,
       qui n'existe qu'une fois un prompt remis sur le marbre. */
    action: `<script>
      window.__manuel = true;
      window.print = () => { window.__printed = (window.__printed || 0) + 1; };
      const boutons = () => [...document.querySelectorAll("button")];

      setTimeout(() => {
        document.querySelector(".casse-toggle")?.click();
        document.querySelector(".casse-more")?.click();
      }, 900);

      setTimeout(() => window.__mesure("PROBE-CASSE"), 1400);

      setTimeout(() => {
        document.querySelector(".casse-open")?.click();

        setTimeout(() => {
          window.__mesure("PROBE");

          const btn = boutons().find((b) => b.textContent.trim() === "Imprimer");
          if (btn) btn.click();

          setTimeout(() => {
            const sheet = document.querySelector(".print-only");
            const fil = document.querySelector(".thread");
            const out = document.createElement("pre");
            out.id = "PRINT";
            out.textContent = JSON.stringify({
              bouton: Boolean(btn),
              feuille: Boolean(sheet),
              prompt: Boolean(sheet && sheet.textContent.includes("# QUI TU ES")),
              titre: Boolean(sheet && sheet.textContent.includes("conciergerie")),
              appels: window.__printed || 0,
              fil: Boolean(fil),
              tours: fil ? fil.querySelectorAll(".turn").length : 0,
              demande: Boolean(fil && fil.textContent.includes("durcis l'escalade")),
              saisie: Boolean(fil && fil.querySelector("textarea")),
              cassetins: document.querySelectorAll(".cassetin").length,
              gestes: Boolean(document.querySelector(".cassetin-acts")),
              feuilles: [...document.querySelectorAll(".prompt-sheet")]
                .filter((el) => el.textContent.includes("JETONPROMPT")).length,
              filRepete: Boolean(fil && fil.textContent.includes("JETONPROMPT")),
            });
            document.body.appendChild(out);
          }, 400);
        }, 500);
      }, 1700);
    </script>`,
    check(dom) {
      const found = /id="PRINT">([^<]*)</.exec(dom);
      if (!found) return assert("atelier — sonde d'impression muette", false);
      const r = JSON.parse(found[1]);
      assert("le bouton Imprimer est là", r.bouton);
      assert("la feuille d'impression se monte hors du #root", r.feuille);
      assert("elle porte le prompt entier", r.prompt);
      assert("et son titre", r.titre);
      assert("window.print appelé une fois exactement", r.appels === 1, `${r.appels} appel(s)`);

      /* La casse, et le fil rendu depuis une entrée de bibliothèque. */
      assert("la casse tient ses cassetins", r.cassetins === 1, `${r.cassetins}`);
      assert("« ⋯ » déplie les gestes du cassetin", r.gestes);
      assert("ouvrir un cassetin remet le prompt sur le marbre", r.fil);
      assert("les tours du fil sont affichés", r.tours === 2, `${r.tours} tour(s)`);
      assert("la demande enregistrée est relue", r.demande);
      assert("la zone de correction est là", r.saisie);

      /* Le prompt s'affiche UNE fois. Le dernier tour du fil porte le même
         texte que la feuille : le répéter le montrait deux fois. */
      assert("le prompt n'est affiché qu'une fois", r.feuilles === 1, `${r.feuilles} feuille(s)`);
      assert("le fil ne répète pas la version en cours", !r.filRepete);

      /* Mesure supplémentaire, tiroir ouvert : c'est l'état où un panneau
         de 340 px peut déborder un écran de 320. */
      const casse = /id="PROBE-CASSE">([^<]*)</.exec(dom);
      if (!casse) return assert("atelier — mesure tiroir ouvert obtenue", false, "sonde muette");
      for (const pair of casse[1].trim().split(" ")) {
        const [width, over] = pair.split(":");
        assert(
          `casse ouverte — aucun débordement à ${width} px`,
          Number(over) === 0,
          `${over} élément(s) trop large(s)`
        );
      }
    },
  },
];

if (!existsSync(CHROME) || !bundle) {
  console.log("… ignoré : Chrome ou dist/ introuvable.");
} else {
  for (const surface of SURFACES) {
    const measured = await measureOverflow(surface);
    if (!measured) continue;
    assert(
      `${surface.label} — la surface s'est bien rendue`,
      measured.dom.includes(surface.marker),
      `« ${surface.marker} » attendu dans le DOM`
    );
    for (const [width, over] of measured.widths) {
      assert(
        `${surface.label} — aucun débordement à ${width} px`,
        over === 0,
        `${over} élément(s) trop large(s)`
      );
    }
    assert(
      `${surface.label} — aucun élément fixe plus large que la fenêtre`,
      measured.fixes === 0,
      `${measured.fixes} élément(s)`
    );
    surface.check?.(measured.dom);
  }
}

/* ---------- 4. le générateur, contre la vraie API ---------- */

section("Générateur (appel direct Anthropic)");

if (!ANTHROPIC) {
  console.log("… ignoré : ANTHROPIC_TEST_KEY non fourni.");
} else {
  const limit = 3900;
  const { buildMeta, targetWindow } = await import("../src/meta.js");
  const { runVerifiedGeneration } = await import("../src/generate.js");

  const base = [
    {
      role: "user",
      content:
        buildMeta(limit) +
        "\n\nIDÉE :\nune conciergerie de copropriétés pilotée par des agents",
    },
  ];

  let httpOk = true;

  /* On appelle `callClaude` — celui de l'atelier, flux compris — et non une
     copie du fetch. Le vérificateur a déjà déclaré rouge une boucle qu'il
     avait recopiée : il ne recopie plus rien. */
  const { callClaude } = await import("../src/api.js");

  let deltas = 0;
  let onlyGrows = true;
  let seen = 0;
  let lastUsage = null;
  let firstDeltaMs = 0;
  const t0 = Date.now();

  /* Exactement la boucle de l'atelier : générer, mesurer, réparer. */
  const run = await runVerifiedGeneration({
    ask: async (convo) => {
      /* Le compteur repart à CHAQUE appel : une réparation en lance un
         second, dont le texte recommence à zéro. La croissance se juge à
         l'intérieur d'un appel, pas d'un appel à l'autre. */
      seen = 0;
      try {
        const { text, usage } = await callClaude(convo, {
          apiKey: ANTHROPIC,
          model: "claude-sonnet-5",
          maxTokens: 2700,
          onDelta: (partial) => {
            deltas += 1;
            if (!firstDeltaMs) firstDeltaMs = Date.now() - t0;
            if (partial.length < seen) onlyGrows = false;
            seen = partial.length;
          },
        });
        lastUsage = usage;
        return text;
      } catch (error) {
        httpOk = false;
        throw error;
      }
    },
    baseConvo: base,
    instruction:
      "ÉTAPE 2 — Génère MAINTENANT le system prompt final. Texte brut uniquement : pas de backticks, " +
      "pas de commentaire, pas de préambule. Huit sections '# EN MAJUSCULES', " +
      `moins de ${limit} caractères, vise ${targetWindow(limit).lo} à ${targetWindow(limit).hi}.`,
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

    /* Le flux : c'est lui qui rend une génération lente lisible plutôt que
       muette. Sans morceaux, l'atelier retomberait dans l'attente aveugle
       qui a fait croire à un blocage de trois minutes. */
    assert("la réponse arrive en flux", deltas > 5, `${deltas} morceau(x)`);
    assert("le texte ne fait que croître", onlyGrows);
    assert(
      "le premier morceau arrive vite",
      firstDeltaMs > 0 && firstDeltaMs < 30000,
      `${(firstDeltaMs / 1000).toFixed(1)} s`
    );
    assert(
      "la consommation est mesurée malgré le flux",
      Number(lastUsage?.input_tokens) > 0 && Number(lastUsage?.output_tokens) > 0,
      `${lastUsage?.input_tokens} entrée / ${lastUsage?.output_tokens} sortie`
    );

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

/* Sert une copie de dist/ instrumentée, avec des réponses d'API en dur, et
   rend ce que Chrome a mesuré. Une surface = un serveur, un Chrome. */
async function measureOverflow({ label, routes, action }) {
  const probe = join(tmpdir(), `bpg-probe-${process.pid}-${label}`);
  rmSync(probe, { recursive: true, force: true });
  cpSync("dist", probe, { recursive: true });
  appendFileSync(join(probe, "index.html"), PROBE_SCRIPT + (action || ""));

  const server = createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    if (url.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(routes[url] ?? { ok: true }));
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
          "--virtual-time-budget=8000",
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
    assert(`${label} — Chrome a répondu`, false, error.message.split("\n")[0]);
  }

  server.close();
  rmSync(probe, { recursive: true, force: true });

  if (!dom) return null;

  const found = /id="PROBE">([^<]*)</.exec(dom);
  if (!found) {
    assert(`${label} — mesure du débordement obtenue`, false, "sonde muette");
    return null;
  }

  const widths = found[1]
    .trim()
    .split(" ")
    .filter((pair) => !pair.startsWith("fixes:"))
    .map((pair) => pair.split(":").map(Number));
  const fixes = Number(/fixes:(\d+)/.exec(found[1])?.[1] ?? -1);
  return { dom, widths, fixes };
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
