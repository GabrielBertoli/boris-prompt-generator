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
import { execFile, execFileSync } from "node:child_process";
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

/* ---------- 1 bis 0. le DÉPÔT non plus ----------

   L'invariant ne disait que « le bundle ». Le 2026-08-02 on a mesuré que
   les cinq codes d'accès étaient en clair dans ETAT.md, CLAUDE.md et le
   skill de vérification — d'un dépôt GitHub PUBLIC, depuis le premier
   commit. Le bundle était propre, et l'invariant tenu ; il regardait à
   côté. Un code lisible ouvre une session, et une session valide reçoit
   la clé Anthropic commune : dépôt public = clé publique.

   Le contrôle est exact plutôt que générique : on cherche le code
   RÉELLEMENT en service (celui de `VERIFY_CODE`). Une expression qui
   devinerait « ce qui ressemble à un code » se serait fait piéger par
   n'importe quel changement de format. */

if (CODE) {
  const suivis = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const coupables = suivis.filter((f) => {
    try {
      return readFileSync(f, "utf8").includes(CODE);
    } catch {
      return false; // binaire ou illisible : rien à y lire en clair
    }
  });
  assert(
    "aucun code d'accès dans un fichier suivi par git",
    coupables.length === 0,
    coupables.length ? coupables.join(", ") : `${suivis.length} fichiers relus`
  );
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

/* ---------- 1 bis 2. le plafond de longueur ----------
   Mesuré le 2026-08-02 : un prompt de plus de 4000 caractères est sorti « au
   vert » parce que le curseur des réglages montait à 8000. Les assertions
   ci-dessous portent sur le code qui mesure, pas sur le curseur : c'est la
   seule façon qu'elles tiennent quand quelqu'un rouvrira le réglage. */

section("Plafond de longueur");

{
  const { HARD_LIMIT, capLimit, verifyPrompt } = await import("../src/meta.js");
  const { runVerifiedGeneration } = await import("../src/generate.js");

  assert("le plafond vaut 3950", HARD_LIMIT === 3950, `${HARD_LIMIT}`);
  assert("une limite au-dessus est rabattue", capLimit(8000) === HARD_LIMIT, `${capLimit(8000)}`);
  assert("une limite en dessous est gardée", capLimit(3000) === 3000);
  assert("une limite absurde retombe sur un plancher", capLimit(-5) === 1500, `${capLimit(-5)}`);
  assert("une limite illisible ne devient pas Infinity", capLimit("abc") === 3000, `${capLimit("abc")}`);

  const long = "# QUI TU ES\n" + "x".repeat(4200) + "\n# SORTIE\nSinon tu continues.";
  const surLimite = verifyPrompt(long, 8000);
  assert("un prompt de 4200 caractères échoue MÊME sous une limite de 8000", !surLimite.pass);
  assert("et il est marqué hors plafond", surLimite.over === true);
  assert("la limite rendue est le plafond, pas le réglage", surLimite.limit === HARD_LIMIT, `${surLimite.limit}`);

  const court = "# QUI TU ES\nsonde\n# SORTIE\nSinon tu continues.";
  assert("un prompt court passe", verifyPrompt(court, 3900).pass);
  assert("et n'est pas marqué hors plafond", verifyPrompt(court, 3900).over === false);

  /* Une faute de STRUCTURE n'est pas un dépassement : elle se répare à la
     main, et l'atelier a le droit d'afficher le prompt. Les deux drapeaux
     doivent donc se distinguer. */
  const tronque = "# QUI TU ES\nsonde, sans la dernière section.";
  assert("une sortie tronquée échoue", !verifyPrompt(tronque, 3900).pass);
  assert("sans être un dépassement", verifyPrompt(tronque, 3900).over === false);

  /* Ce que rend la boucle quand rien ne passe : la MEILLEURE tentative, pas
     la dernière. On lui sert cinq réponses de longueurs décroissantes puis
     une remontée — la 4ᵉ est la plus courte, c'est elle qu'on doit revoir. */
  const tailles = [4600, 4400, 4200, 4000, 4300];
  const servis = [];
  let appel = 0;
  const faux = await runVerifiedGeneration({
    ask: async () => {
      const n = tailles[Math.min(appel++, tailles.length - 1)];
      const t = "# QUI TU ES\n" + "x".repeat(n - 40) + "\n# SORTIE\nSinon tu continues.";
      servis.push(t);
      return t;
    },
    baseConvo: [],
    instruction: "peu importe",
    limit: 3900,
  });
  const plusCourt = Math.min(...servis.map((t) => [...t].length));
  const dernier = [...servis[servis.length - 1]].length;
  assert("cinq tentatives ont été faites", appel === 5, `${appel} appel(s)`);
  assert(
    "la boucle rend la plus courte, pas la dernière",
    faux.check.count === plusCourt && plusCourt !== dernier,
    `rendu ${faux.check.count}, plus court ${plusCourt}, dernier ${dernier}`
  );
  assert("et elle la rend marquée hors plafond", faux.check.over === true);
  assert(
    "le dernier tour de la conversation porte ce texte-là",
    faux.convo[faux.convo.length - 1].content === faux.text
  );
}

/* ---------- 1 bis 3. la note du juge ----------
   Le juge répond en JSON libre. Tout ce qui suit porte sur ce qu'on en
   RECONSTRUIT : une note de 47 — déjà vue quand un modèle note sur 100 —
   ferait sortir l'aiguille de la jauge sans que rien ne le signale. */

section("La note du juge");

{
  const { BANDES, CRITERES, auditInstruction, bandeDe, normalizeNote } = await import("../src/meta.js");
  const lib = await import("../src/library.js");
  const { Arret, callClaude } = await import("../src/api.js");

  const brut = {
    note: 7.5,
    verdict: "Tient la méthode, l'oracle est faible.",
    criteres: CRITERES.map((c, i) => ({ cle: c.cle, note: 6 + i * 0.5, mot: `mot ${i}` })),
    failles: ["a", "b"],
  };
  const n = normalizeNote(brut, "claude-opus-5");
  assert("une réponse du juge se relit", n.note === 7.5, `${n.note}`);
  assert("les six critères sont reconstruits", n.criteres.length === 6, `${n.criteres.length}`);
  assert("dans l'ordre de la grille", n.criteres.every((c, i) => c.cle === CRITERES[i].cle));
  assert("le juge est retenu", n.juge === "claude-opus-5");

  assert("une note de 47 est ramenée à 10", normalizeNote({ note: 47 }, "j").note === 10);
  assert("une note négative est ramenée à 0", normalizeNote({ note: -3 }, "j").note === 0);
  assert("une note illisible ne passe pas", normalizeNote({ note: "beaucoup" }, "j") === null);
  assert("une réponse vide ne passe pas", normalizeNote(null, "j") === null);

  /* Sans note globale, c'est le MAILLON FAIBLE qui la remplace — jamais la
     moyenne : cinq critères à 9 et un vérificateur à 2 donneraient 7,8, soit
     « bon prompt » pour un prompt sans oracle. */
  const sansGlobale = normalizeNote(
    { criteres: CRITERES.map((c, i) => ({ cle: c.cle, note: i === 3 ? 2 : 9 })) },
    "j"
  );
  assert("sans note globale, le plus faible fait foi", sansGlobale.note === 2, `${sansGlobale.note}`);

  const inconnu = normalizeNote({ note: 8, criteres: [{ cle: "inventé", note: 10 }] }, "j");
  assert("un critère inconnu est ignoré", inconnu.criteres.every((c) => c.note === null));

  /* Les bandes : c'est ce que l'œil lit sur la jauge. */
  assert("10 est vert", bandeDe(10).ton === "var(--signal)");
  assert("8 est vert — la bande commence à 8", bandeDe(8).ton === "var(--signal)");
  assert("7,9 est orange", bandeDe(7.9).ton === "var(--ember)");
  assert("6 est orange", bandeDe(6).ton === "var(--ember)");
  assert("5,9 est rouge", bandeDe(5.9).ton === "var(--alarm)");
  assert("0 est rouge", bandeDe(0).ton === "var(--alarm)");
  assert("les bandes descendent", BANDES.every((b, i) => i === 0 || b.min < BANDES[i - 1].min));

  /* La consigne du juge doit VRAIMENT porter la grille et la règle : sans
     elles, le modèle note à vue et la jauge affiche une opinion. */
  const consigne = auditInstruction();
  assert("la consigne cite les six clés", CRITERES.every((c) => consigne.includes(c.cle)));
  assert("elle interdit la moyenne", consigne.includes("n'est PAS la moyenne"));
  assert("elle borne l'écart au plus faible", consigne.includes("2 points"));
  assert("elle réclame du JSON seul", consigne.includes("UNIQUEMENT avec ce JSON"));

  /* La note se pose sur le dernier tour d'ATELIER, pas sur le dernier tour.
     Un refus « trop long » laisse un tour compacté en queue : le noter
     rattacherait le jugement à un texte qui n'existe pas. */
  let fil = [];
  fil = lib.appendTurn(fil, { role: "atelier", text: "V1", version: 1, count: 10, pass: true });
  fil = lib.appendTurn(fil, { role: "moi", text: "corrige" });
  fil = lib.appendTurn(fil, { role: "atelier", text: "V2", version: 2, count: 12, pass: true });
  fil = lib.appendTurn(fil, { role: "moi", text: "encore" });
  fil = lib.appendTurn(fil, { role: "atelier", text: "Refusé — trop long", version: 2, count: 4200, pass: false, compacted: true });
  const noté = lib.noterDernierTour(fil, n);
  assert("la note va au dernier tour d'atelier réel", noté[2].note?.note === 7.5);
  assert("pas au tour compacté", !noté[4].note);
  assert("pas à une demande", !noté[1].note && !noté[3].note);
  assert("le fil garde sa longueur", noté.length === fil.length);

  /* Ce qui survit à la coupe : le chiffre, pas les six critères. */
  let long = [];
  for (let i = 1; i <= 6; i += 1) {
    long = lib.appendTurn(long, { role: "moi", text: `demande ${i}` });
    long = lib.appendTurn(long, {
      role: "atelier",
      text: `PROMPT-${i}`,
      version: i,
      count: 3200,
      pass: true,
      note: normalizeNote({ note: 5 + i * 0.5, criteres: brut.criteres }, "j"),
    });
  }
  const coupé = long.find((t) => t.compacted);
  assert("un tour coupé garde son chiffre", coupé.note?.note != null, `${coupé.note?.note}`);
  assert("mais plus ses critères", coupé.note.criteres.length === 0);
  assert("et la ligne d'état le dit", coupé.text.includes("noté"), coupé.text);

  /* Aller-retour d'export : la note suit le prompt d'un appareil à l'autre. */
  const entree = lib.makeEntry({ idea: "sonde", prompt: "# QUI TU ES\nx\n# SORTIE\nSinon tu continues.", limit: 3900, version: 2, chat: noté, note: n });
  const relu = lib.parseBundle(lib.exportBundle([entree], "sonde")).items[0];
  assert("la note de l'entrée survit à l'export", relu.note?.note === 7.5, `${relu.note?.note}`);
  assert("celle du fil aussi", relu.chat.find((t) => t.note)?.note.note === 7.5);
  const trafiqué = lib.parseBundle(
    JSON.stringify([{ ...entree, note: { ...n, note: 47 } }])
  ).items[0];
  assert("un fichier trafiqué ne pose pas 47 dans une jauge sur 10", trafiqué.note.note === 10);

  /* L'arrêt : un signal déjà avorté ne doit RIEN envoyer sur le réseau — et
     se distinguer d'une panne, sinon un arrêt voulu s'affiche en rouge. */
  const ctrl = new AbortController();
  ctrl.abort();
  let levée = null;
  try {
    await callClaude([{ role: "user", content: "x" }], { apiKey: "sk-ant-faux", model: "claude-sonnet-5", signal: ctrl.signal });
  } catch (e) {
    levée = e;
  }
  assert("un signal déjà avorté arrête avant l'appel", levée instanceof Arret);
  assert("et se reconnaît comme un arrêt", levée?.arret === true && levée?.name === "Arret");
}

/* ---------- 1 bis 4. l'aide et le pied de page ----------

   L'aide est écrite en DONNÉES précisément pour être relue ici. Le
   contrôle qui compte n'est pas « elle existe » mais « elle décrit ce
   produit-ci » : les huit sections qu'elle annonce sont comparées à
   celles que `buildMeta()` impose réellement au modèle. Une aide qui
   promet une structure que l'atelier ne produit plus est pire que pas
   d'aide — elle se lit comme vraie. */

section("L'aide");

{
  const { CHAPITRES, PIED, SECTIONS_BORIS } = await import("../src/aide.js");
  const { buildMeta, HARD_LIMIT } = await import("../src/meta.js");

  assert("l'aide a douze chapitres", CHAPITRES.length === 12, `${CHAPITRES.length}`);
  assert("chacun porte un numéro unique", new Set(CHAPITRES.map((c) => c.num)).size === 12);
  assert("chacun porte une clé unique", new Set(CHAPITRES.map((c) => c.cle)).size === 12);
  assert(
    "chacun dit à quoi sa partie SERT",
    CHAPITRES.every((c) => c.sert && c.sert.trim().length > 20),
    CHAPITRES.filter((c) => !c.sert || c.sert.trim().length <= 20).map((c) => c.cle).join(", ") || "tous"
  );
  assert(
    "aucun chapitre n'est vide",
    CHAPITRES.every((c) => Array.isArray(c.points) && c.points.length >= 3),
    CHAPITRES.filter((c) => (c.points || []).length < 3).map((c) => c.cle).join(", ") || "tous garnis"
  );

  /* Toutes les parties de l'écran sont couvertes. Sans cette liste, on
     ajoute un panneau et l'aide vieillit en silence. */
  for (const cle of ["porte", "idee", "questions", "marbre", "epreuve", "note", "fil", "casse", "reglages", "cout", "methode", "securite"]) {
    assert(`le chapitre « ${cle} » est là`, CHAPITRES.some((c) => c.cle === cle));
  }

  /* LE contrôle : les huit sections annoncées sont celles qu'impose le
     méta-prompt, dans le même ordre. */
  const meta = buildMeta(3900);
  assert("l'aide annonce huit sections", SECTIONS_BORIS.length === 8, `${SECTIONS_BORIS.length}`);
  assert(
    "ce sont exactement celles qu'impose le méta-prompt",
    SECTIONS_BORIS.every(([titre]) => meta.includes(titre)),
    SECTIONS_BORIS.filter(([t]) => !meta.includes(t)).map(([t]) => t).join(", ") || "les huit"
  );
  const rangs = SECTIONS_BORIS.map(([titre]) => meta.indexOf(titre));
  assert("et dans le même ordre", rangs.every((r, i) => i === 0 || r > rangs[i - 1]));
  assert(
    "chaque section est traduite en français courant",
    SECTIONS_BORIS.every(([, quoi]) => quoi && quoi.length > 40)
  );

  /* Le chapitre « méthode » cite le plafond réel : un chiffre écrit à la
     main aurait vieilli au premier changement de HARD_LIMIT. */
  const methode = CHAPITRES.find((c) => c.cle === "methode");
  assert(
    "le plafond annoncé est le vrai plafond",
    methode.points.some((p) => p.includes(String(HARD_LIMIT))),
    `${HARD_LIMIT} attendu`
  );

  /* L'aide ne doit pas retomber dans le jargon qu'elle est censée
     traduire — c'est la demande, et c'est ce qui se perd le plus vite. */
  const prose = CHAPITRES.flatMap((c) => [c.sert, ...c.points]).join(" ").toLowerCase();
  for (const mot of ["oracle", "invariant", "idempot", "serverless", "webhook"]) {
    assert(`sans jargon « ${mot} »`, !prose.includes(mot));
  }

  /* Le pied de page. */
  assert("le pied nomme son propriétaire", PIED.proprietaire === "Gabriel Bertoli", PIED.proprietaire);
  assert("il porte une année", Number(PIED.annee) >= 2026);
  assert("il réserve les droits", /tous droits réservés/i.test(PIED.droits));
  assert("il porte une note de sécurité", PIED.securite.length > 100, `${PIED.securite.length} caractères`);
  assert(
    "elle dit où reste la clé et comment sont gardés les codes",
    /navigateur/i.test(PIED.securite) && /empreinte/i.test(PIED.securite)
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

/* ---------- 1 quater. poser un code et le reconnaître ----------

   Deux chemins touchent le même secret : `scripts/seed.mjs` l'ÉCRIT,
   `/api/login` le RELIT. Ils normalisaient différemment — la porte coupait
   les blancs de bord, la graine non — donc la graine pouvait poser un code
   que la porte ne pouvait plus jamais accepter, et le refus s'affichait
   « Code refusé ». Ces assertions tournent en Node, sans réseau ni magasin :
   c'est la seule façon de prouver l'accord des deux chemins sans essayer un
   vrai code sur une vraie porte. */

section("Codes — écrire et relire");

{
  const { hashCode, verifyCode } = await import("../api/_lib/crypto.js");
  const { normalizeCode } = await import("../api/_lib/http.js");

  /* Ce que la graine pose passe la porte, y compris quand la saisie est sale. */
  for (const brut of ["1234abcd", "  1234abcd  ", "1234abcd\n", "\t1234abcd"]) {
    const clean = normalizeCode(brut);
    const hash = await hashCode(clean);
    assert(
      `un code semé depuis « ${JSON.stringify(brut)} » ouvre la porte`,
      Boolean(clean) && (await verifyCode(normalizeCode(brut), hash))
    );
  }

  /* Et le piège d'origine, énoncé tel qu'il s'est produit : un condensat pris
     sur le code BRUT ne reconnaît plus le code que l'utilisateur tape. */
  const naif = await hashCode("  1234abcd  ");
  assert(
    "hacher le code brut rend le compte inaccessible",
    !(await verifyCode(normalizeCode("  1234abcd  "), naif)),
    "c'est le défaut que la graine ne doit plus pouvoir commettre"
  );

  assert("normalizeCode est idempotente", normalizeCode(normalizeCode("  1234abcd ")) === "1234abcd");
  assert("un code de 3 caractères est refusé", normalizeCode("abc") === null);
  assert("un code de 4 caractères passe", normalizeCode("abcd") === "abcd");
  assert("65 caractères sont refusés", normalizeCode("x".repeat(65)) === null);
  /* La casse compte, et c'est un piège de saisie, pas un défaut : un code qui
     finit par une lettre majuscule doit être tapé avec sa majuscule. Sur
     téléphone, un champ de type mot de passe ne met JAMAIS de majuscule
     automatique — la même personne entre le même code et se voit refusée.
     Aucun code réel n'apparaît ici : le dépôt est public. */
  assert("la casse n'est PAS neutralisée", normalizeCode("motDePasse") === "motDePasse");
  assert(
    "deux casses différentes donnent deux codes différents",
    !(await verifyCode("motdepasse", await hashCode("motDePasse"))),
    "un code avec une majuscule doit être tapé avec sa majuscule"
  );
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

  /* ---------- chaque prénom de la porte a VRAIMENT un code ----------

     L'assertion au-dessus disait « ajouter quelqu'un et oublier de le semer
     ne doit pas passer inaperçu ». Elle ne le prouvait pas : elle relit la
     liste servie par /api/session, donc le contenu de USERS — pas le magasin.
     Une carte se dessine à la porte pour qui n'a aucun code, et la seule
     personne à le découvrir est celle qui essaie d'entrer.

     Mesuré le 2026-08-05 sur Cécile. Les cinq codes avaient été réémis le
     2026-08-02 et l'état du dépôt le dit lui-même : « vérifié en production
     sur TROIS comptes ». Les deux autres n'ont jamais été essayés, et rien
     ici ne les essayait non plus.

     La sonde n'a besoin d'AUCUN code : elle envoie un code délibérément faux
     et lit la différence que le serveur fait déjà entre les deux situations —
     401 « Code refusé » = un code est posé ; 409 = ce compte n'en a pas. */
  for (const { id, name } of anon.body?.users || []) {
    const probe = await call("/api/login", "POST", { id, code: "sonde-deliberement-fausse" });
    if (probe.status === 429) {
      assert(`${name} — code en place`, false, "429 du limiteur : sonde non concluante, réessaie dans dix minutes");
      continue;
    }
    assert(
      `${name} — un code est bien posé dans le magasin`,
      probe.status === 401,
      probe.status === 401
        ? "401 sur un code faux"
        : probe.status === 409
          ? `409 — AUCUN code posé : lance \`node scripts/seed.mjs ${id}=<code>\``
          : `reçu ${probe.status} ${probe.body?.error || ""}`
    );
    assert(`${name} — aucun cookie sur échec`, !probe.cookie);
  }

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

/* ---------- 3. mobile : aucun débordement horizontal ----------

   CE QUE CETTE SONDE NE PEUT PAS FAIRE, et qu'il faut savoir avant de
   lui faire confiance : elle force `documentElement.style.width`, mais
   les media queries, elles, s'évaluent sur le VRAI viewport — 485 px
   ici. Aucun palier responsive n'est donc exercé. Mesuré le 2026-08-01 :
   `--window-size=320,720` laisse `window.innerWidth` à 500, ce Chrome
   l'ignore pour de bon.

   Conséquence : un défaut qui ne se produit qu'à un palier (une rangée
   trop chargée à 320 px, par exemple) lui est invisible, et un vrai
   viewport de 320 px lui ferait au contraire crier au loup sur des
   éléments que le palier corrige. Ce qu'elle mesure reste utile — une
   largeur intrinsèque non maîtrisée sort ici — mais la vérification
   responsive demande un pilote qui règle vraiment le viewport
   (Playwright, `newContext({ viewport })`). C'est comme cela que le
   débordement de l'avatar à 320 px a été trouvé, et c'est là qu'il faut
   le revérifier. */

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
      /* On NOMME le coupable. Un compteur nu — « 1 élément trop large » —
         dit qu'il y a un défaut sans dire où : mesuré le 2026-08-02, il a
         fallu deviner deux fois avant de trouver la barre. Le nom du
         premier fautif suffit : les suivants sont presque toujours ses
         parents, qu'il déborde par en dessous. */
      let over = 0;
      let qui = "";
      document.querySelectorAll("*").forEach((el) => {
        if (el.id.startsWith("PROBE")) return;
        if (getComputedStyle(el).position === "fixed") return;
        if (el.getBoundingClientRect().width > W + 1) {
          over += 1;
          if (!qui) {
            /* Aucune espace dans le nom : les mesures sont jointes par des
               espaces, et un nom qui en contient casserait la lecture — un
               « 320:1 » devenait deux mesures dont une à « NaN px ». */
            qui = (
              el.tagName.toLowerCase() +
              (el.className && typeof el.className === "string"
                ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
                : "") +
              "@" +
              Math.round(el.getBoundingClientRect().width)
            ).replace(/\s+/g, "_");
          }
        }
      });
      out.push(W + ":" + over + (qui ? "|" + qui : ""));
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
    /* Une version ANTÉRIEURE, celle qu'on ne peut plus lire ailleurs que
       dans le fil : c'est elle qui n'avait aucun bouton copier. Son jeton
       est distinct de celui de la version en cours — copier le mauvais
       texte est exactement la panne à surveiller. */
    {
      role: "atelier",
      text: "# QUI TU ES\nsonde ANCIENNEVERSION\n# SORTIE\nSinon tu continues.",
      at: "2026-08-01T09:59:00.000Z",
      version: 1,
      count: 57,
      pass: true,
    },
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
  /* La note du juge, telle qu'elle est ENREGISTRÉE : c'est elle qui doit
     remplir la jauge à la réouverture, sans nouvel appel au juge. */
  note: {
    note: 7.5,
    verdict: "Tient la méthode, l'oracle est faible.",
    juge: "claude-opus-5",
    pourVersion: 2,
    criteres: [
      { cle: "structure", nom: "Structure", note: 9, mot: "huit sections, ordre tenu" },
      { cle: "boucle", nom: "Boucle empirique", note: 8, mot: "événements concrets" },
      { cle: "invariants", nom: "Invariants", note: 8, mot: "file de validation posée" },
      { cle: "verificateur", nom: "Vérificateur", note: 5.5, mot: "assertions trop vagues" },
      { cle: "sortie", nom: "Escalade et sortie", note: 8, mot: "verrouillée aux deux bords" },
      { cle: "economie", nom: "Économie", note: 7, mot: "une redite en INVARIANTS" },
    ],
    at: "2026-08-01T10:01:00.000Z",
  },
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

      /* Le presse-papiers est remplacé AVANT l'application : sans cela on
         saurait qu'un bouton existe, pas ce qu'il dépose. */
      window.__copie = "";
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (t) => {
            window.__copie = t;
            return Promise.resolve();
          },
        },
      });

      setTimeout(() => {
        document.querySelector(".casse-toggle")?.click();
        document.querySelector(".casse-more")?.click();
      }, 900);

      setTimeout(() => window.__mesure("PROBE-CASSE"), 1400);

      setTimeout(() => {
        document.querySelector(".casse-open")?.click();

        setTimeout(() => {
          window.__mesure("PROBE");

          /* Le premier bouton copier du fil est celui de la version
             ANTÉRIEURE : on le presse pour lire ce qui part vraiment. */
          const filBtns = [...document.querySelectorAll(".pupitre button")];
          const copieBtns = filBtns.filter((b) => b.textContent.trim().startsWith("Copier"));
          const remises = filBtns.filter(
            (b) => b.textContent.trim() === "Remettre cette version"
          ).length;
          copieBtns[0]?.click();

          /* La jauge est là sans qu'on ait rien demandé ; le « ⋯ » ouvre
             le détail. On mesure les deux : une jauge qui s'affiche mais
             ne s'explique pas est un chiffre tombé du ciel. */
          const jaugeAvant = Boolean(document.querySelector(".jauge-note"));
          const chiffre = (document.querySelector(".jauge-chiffre")?.textContent || "").trim();
          const detailAvant = Boolean(document.querySelector(".note-detail"));

          /* ---- les trois panneaux, et le haut de la page ----
             Un prompt vient d'être rappelé de la casse : c'est exactement
             le cas où l'écran de travail doit commencer sous la barre. On
             mesure DEUX choses distinctes — que chaque chose est dans le
             bon panneau, et qu'aucune n'est poussée sous le pli. */
          const marbre = document.querySelector(".atelier-main");
          const carte = document.querySelector(".atelier-main .prompt-sheet");
          const yPrompt = carte
            ? Math.round(carte.getBoundingClientRect().top + window.scrollY)
            : -1;

          document.querySelector(".note-plus")?.click();

          const btn = boutons().find((b) => b.textContent.trim() === "Imprimer");
          if (btn) btn.click();

          setTimeout(() => {
            const sheet = document.querySelector(".print-only");
            /* Le pupitre existe TOUJOURS — c'est le bord gauche. Ce qui dit
               qu'un prompt est bien revenu sur le marbre, c'est son corps :
               il n'est monté que lorsqu'il y a un prompt. Mesurer la
               présence du pupitre aurait rendu l'assertion vraie même sans
               rien avoir ouvert. */
            const pupitre = document.querySelector(".pupitre");
            const fil = document.querySelector(".pupitre-corps");
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
              saisie: Boolean(pupitre && pupitre.querySelector("textarea")),
              cassetins: document.querySelectorAll(".cassetin").length,
              gestes: Boolean(document.querySelector(".cassetin-acts")),
              feuilles: [...document.querySelectorAll(".prompt-sheet")]
                .filter((el) => el.textContent.includes("JETONPROMPT")).length,
              filRepete: Boolean(pupitre && pupitre.textContent.includes("JETONPROMPT")),
              jauge: jaugeAvant,
              chiffre,
              detailAvant,
              /* Trois panneaux : le fil à gauche, la pièce au centre,
                 l'état du travail à droite. Chaque chose à sa place — et
                 surtout, PAS aux deux. */
              epreuve: Boolean(document.querySelector(".epreuve")),
              epreuveTitre: (document.querySelector(".epreuve-head")?.textContent || "").trim(),
              jaugeDansEpreuve: Boolean(document.querySelector(".epreuve .jauge-note")),
              jaugeDansMarbre: Boolean(document.querySelector(".atelier-main .jauge-note")),
              promptDansMarbre: Boolean(carte),
              promptDansEpreuve: Boolean(document.querySelector(".epreuve .prompt-sheet")),
              filDansPupitre: Boolean(document.querySelector(".pupitre .turn")),
              filDansMarbre: Boolean(document.querySelector(".atelier-main .turn")),
              /* Le haut de la page : manchette repliée, idée en une ligne. */
              manchette: Boolean(marbre && marbre.textContent.includes("Bonjour")),
              ideeRepliee: Boolean(document.querySelector(".idee-repliee")),
              composeurOuvert: Boolean(document.querySelector(".atelier-main textarea")),
              yPrompt,
              detailApres: Boolean(document.querySelector(".note-detail")),
              criteres: document.querySelectorAll(".note-detail .critere").length,
              repere: Boolean(document.querySelector(".jauge-note .repere")),
              bandes: document.querySelectorAll(".jauge-note .bande").length,
              compte: (document.querySelector(".note-flanc .tag")?.textContent || "").trim(),
              copies: copieBtns.length,
              remises,
              copieAncienne: (window.__copie || "").includes("ANCIENNEVERSION"),
              copieCourante: (window.__copie || "").includes("JETONPROMPT"),
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
      assert("les tours du fil sont affichés", r.tours === 3, `${r.tours} tour(s)`);
      assert("la demande enregistrée est relue", r.demande);
      assert("la zone de correction est là", r.saisie);

      /* Tout prompt sorti de l'atelier se copie — la version en cours comme
         les antérieures. Deux tours d'atelier dans la sonde, donc deux
         boutons ; une seule version antérieure, donc une seule remise. */
      /* ---- les trois panneaux ----
         Chaque chose dans son panneau, et dans UN SEUL : une jauge présente
         des deux côtés passerait « au vert » sur la seule vérification de
         présence, alors que ce serait précisément le défaut qu'on répare. */
      assert("l'épreuve tient le troisième panneau", r.epreuve);
      assert("elle s'annonce comme le travail en cours", r.epreuveTitre.includes("Travail en cours"), r.epreuveTitre);
      assert("la note du juge est à l'épreuve", r.jaugeDansEpreuve);
      assert("et plus dans le marbre", !r.jaugeDansMarbre);
      assert("le prompt est au marbre", r.promptDansMarbre);
      assert("et pas à l'épreuve", !r.promptDansEpreuve);
      assert("le fil est au pupitre", r.filDansPupitre);
      assert("et pas au marbre", !r.filDansMarbre);

      /* ---- l'écran de travail commence en haut ----
         Un prompt vient d'être rappelé de la casse. La manchette d'accueil
         n'a plus rien à faire là, l'idée tient en une ligne, et le prompt
         n'est pas repoussé sous le pli. Le seuil est mesuré, pas choisi :
         avant le repli, le prompt naissait au-delà de 800 px. */
      assert("la manchette d'accueil s'efface pendant le travail", !r.manchette);
      assert("l'idée est repliée en une ligne", r.ideeRepliee);
      assert("son composeur est bien refermé", !r.composeurOuvert);
      assert("le prompt commence en haut de la page", r.yPrompt >= 0 && r.yPrompt < 420, `${r.yPrompt} px`);

      /* La note : affichée d'office, dépliable à la demande. */
      assert("la jauge de la note est là sans rien demander", r.jauge);
      assert("elle porte les trois bandes du barème", r.bandes === 3, `${r.bandes} bande(s)`);
      assert("et le repère sur la note", r.repere);
      assert("le chiffre enregistré est réaffiché", r.chiffre.startsWith("7,5"), r.chiffre);
      assert("la longueur reste lisible, en puce", r.compte.includes("car."), r.compte);
      assert("le détail est replié d'office", !r.detailAvant);
      assert("« ⋯ » l'ouvre", r.detailApres);
      assert("avec les six critères", r.criteres === 6, `${r.criteres} critère(s)`);

      assert("chaque prompt du fil porte son bouton copier", r.copies === 2, `${r.copies} bouton(s)`);
      assert("seule une version antérieure se remet", r.remises === 1, `${r.remises} bouton(s)`);
      assert("copier un tour copie CE tour", r.copieAncienne);
      assert("et surtout pas la version en cours", !r.copieCourante);

      /* Le prompt s'affiche UNE fois. Le dernier tour du fil porte le même
         texte que la feuille : le répéter le montrait deux fois. */
      assert("le prompt n'est affiché qu'une fois", r.feuilles === 1, `${r.feuilles} feuille(s)`);
      assert("le fil ne répète pas la version en cours", !r.filRepete);

      /* Mesure supplémentaire, tiroir ouvert : c'est l'état où un panneau
         de 340 px peut déborder un écran de 320. */
      const casse = /id="PROBE-CASSE">([^<]*)</.exec(dom);
      if (!casse) return assert("atelier — mesure tiroir ouvert obtenue", false, "sonde muette");
      for (const pair of casse[1].trim().split(" ")) {
        const [tete, qui = ""] = pair.split("|");
        const [width, over] = tete.split(":");
        assert(
          `casse ouverte — aucun débordement à ${width} px`,
          Number(over) === 0,
          Number(over) === 0
            ? "0 élément(s) trop large(s)"
            : `${over} trop large(s), à commencer par ${qui}`
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
    for (const [width, over, qui] of measured.widths) {
      assert(
        `${surface.label} — aucun débordement à ${width} px`,
        over === 0,
        over === 0 ? "0 élément(s) trop large(s)" : `${over} trop large(s), à commencer par ${qui}`
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

  /* « 320:1|div.pied-inner@340 » — largeur, compte, et le NOM du premier
     fautif avec sa largeur réelle. Sans ce nom, un compteur nu dit qu'il y
     a un défaut sans dire où. */
  const widths = found[1]
    .trim()
    .split(" ")
    .filter((pair) => !pair.startsWith("fixes:"))
    .map((pair) => {
      const [tete, qui = ""] = pair.split("|");
      const [w, over] = tete.split(":").map(Number);
      return [w, over, qui];
    });
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
