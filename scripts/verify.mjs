/* Vérificateur — il tourne AVANT qu'on déclare quoi que ce soit.
   Rejoue les parcours contre un déploiement réel et fouille le bundle.

     vercel env pull .env.local
     BASE_URL=https://…vercel.app VERIFY_USER=karl VERIFY_CODE=… npm run verify
     VERIFY_API=1 npm run verify   # + les générations réelles, PAYANTES sur la clé API

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
/* Les générations réelles coûtent sur une clé API — la même que celle du
   site. Elles ne partent QUE sur demande explicite (`VERIFY_API=1`) : la
   clé présente dans `.env` ne suffit plus. Règle « abonnement d'abord »,
   posée le 2026-09-23 après qu'un banc a vidé cette clé. */
const ANTHROPIC =
  process.env.VERIFY_API === "1" ? process.env.ANTHROPIC_TEST_KEY || process.env.ANTHROPIC_API_KEY || "" : "";

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

/* ---------- 1 bis 2 ter. les quatre techniques ----------

   L'atelier produit maintenant deux objets différents. Ce qui se vérifie
   ici n'est pas « le gantelet marche » mais la seule chose qui puisse
   casser en silence : qu'une règle de l'une soit appliquée au prompt de
   l'autre. Un vérificateur qui cherche huit sections dans un prompt de
   170 mots dit « à refaire » sans que rien soit à refaire — et personne
   ne va relire le code pour un verdict qui a l'air d'un avis. */

section("Les quatre techniques");

{
  const { DEFAULT_TECHNIQUE, TECHNIQUES, estTechnique, techniqueOf } = await import("../src/techniques.js");
  const gaunt = await import("../src/gauntlet.js");
  const croch = await import("../src/crochets.js");

  assert("il y a quatre techniques", TECHNIQUES.length === 4, TECHNIQUES.map((t) => t.id).join(", "));
  assert("Boris reste celle par défaut", DEFAULT_TECHNIQUE === "boris", DEFAULT_TECHNIQUE);
  assert("un identifiant inconnu retombe sur Boris", techniqueOf("inventée").id === "boris");
  assert("un identifiant absent aussi", techniqueOf(undefined).id === "boris");
  assert("estTechnique refuse ce qui n'en est pas une", !estTechnique("inventée") && estTechnique("gauntlet") && estTechnique("hooks") && estTechnique("opus55"));

  /* LE contrat. Un champ manquant ne se voit pas au chargement : il se
     voit à la génération, une fois l'appel payé. */
  const CONTRAT = [
    "id", "nom", "resume", "quand", "cleReglage", "noteLimite", "hardLimit", "limiteMin", "limiteDefaut",
    "capLimit", "fenetre", "buildMeta", "etape1", "etape2Instruction", "verifyPrompt",
    "CRITERES", "auditInstruction", "auditApplyInstruction", "correctionInstruction", "baseConvoFor",
    "exempleIdee", "exempleContraintes", "exempleCorrection", "bandeau", "accroche",
  ];
  for (const t of TECHNIQUES) {
    const manque = CONTRAT.filter((k) => t[k] === undefined || t[k] === null || t[k] === "");
    assert(`« ${t.nom} » remplit le contrat`, manque.length === 0, manque.join(", "));
    assert(`« ${t.nom} » a six critères de juge`, t.CRITERES.length === 6, `${t.CRITERES.length}`);
    assert(
      `« ${t.nom} » a des clés de critères uniques`,
      new Set(t.CRITERES.map((c) => c.cle)).size === 6
    );
  }

  /* Les deux ne règlent PAS la même case : un curseur partagé aurait fait
     suivre à l'une le réglage choisi pour l'autre, sans rien à l'écran. */
  assert(
    "chacune a sa propre case de réglage",
    new Set(TECHNIQUES.map((t) => t.cleReglage)).size === TECHNIQUES.length,
    TECHNIQUES.map((t) => t.cleReglage).join(", ")
  );
  /* Deux à deux, pas seulement Boris contre gantelet : une troisième
     grille qui partagerait une clé avec l'une des deux aurait le même
     défaut, et l'assertion à deux termes l'aurait laissé passer. */
  const toutesCles = TECHNIQUES.flatMap((t) => t.CRITERES.map((c) => c.cle));
  assert(
    "et les grilles du juge n'ont aucune clé commune",
    new Set(toutesCles).size === toutesCles.length,
    toutesCles.filter((k, i) => toutesCles.indexOf(k) !== i).join(", ") || "toutes distinctes"
  );

  /* ---- l'oracle du gantelet ---- */

  const G = techniqueOf("gauntlet");
  const bon = gaunt.PROMPT_REFERENCE;
  const vu = G.verifyPrompt(bon, G.limiteDefaut);
  assert("l'exemple de référence passe son propre vérificateur", vu.pass, vu.fails.join(" ; "));
  /* La fenêtre vient de la technique, pas d'un chiffre recopié : écrite
     à la main, l'assertion a survécu au changement de fenêtre du
     2026-08-26 en vérifiant l'ancienne. */
  const fen = G.fenetre();
  assert(
    "et il est dans la fenêtre visée",
    vu.mots >= fen.lo && vu.mots <= fen.hi,
    `${vu.mots} mots pour ${fen.lo}–${fen.hi}`
  );

  /* Chaque faute mortelle nommée par la technique est une assertion, pas
     un conseil. On les provoque une par une sur un texte par ailleurs
     valide : c'est le seul moyen de savoir laquelle est vraiment tenue. */
  const casse = [
    ["la barre disparue", bon.replace(/barre/gi, "cible"), "barre"],
    ["la comparaison à l'aveugle retirée", bon.replace(/à l'aveugle/g, ""), "aveugle"],
    ["le contexte neuf retiré", bon.replace(/au contexte neuf/g, ""), "contexte neuf"],
    ["« /loop » retiré", bon.replace("/loop", "boucle"), "/loop"],
    ["« ultracode » retiré", bon.replace("et ultracode", ""), "ultracode"],
    ["un nombre de tours fixé", bon + "\nArrête après trois tours.", "tours"],
    ["une puce ajoutée", bon + "\n- un point de plus", "puces"],
  ];
  for (const [nom, texte, attendu] of casse) {
    const v = G.verifyPrompt(texte, G.limiteDefaut);
    assert(`refusé : ${nom}`, !v.pass, "accepté à tort");
    assert(
      `et la raison le nomme (${attendu})`,
      v.fails.some((f) => f.toLowerCase().includes(attendu.toLowerCase())),
      v.fails.join(" ; ")
    );
  }

  const court = G.verifyPrompt("La barre, c'est Nike. À l'aveugle, contexte neuf, critique. /loop ultracode.", G.limiteDefaut);
  assert("un prompt trop court est refusé", !court.pass);
  assert("et la longueur est nommée", court.fails.some((f) => f.startsWith("longueur")), court.fails.join(" ; "));

  const long = G.verifyPrompt(bon + " " + "mot ".repeat(400), G.limiteDefaut);
  assert("un prompt qui déborde le plafond est marqué hors limite", long.over === true);

  /* Le vérificateur de Boris appliqué à un prompt de gantelet doit
     échouer — et c'est exactement pourquoi il ne doit jamais lui être
     appliqué. L'assertion existe pour que la confusion soit visible ici
     plutôt qu'à l'écran d'un utilisateur. */
  const B = techniqueOf("boris");
  assert(
    "l'oracle de Boris rejetterait un prompt de gantelet",
    !B.verifyPrompt(bon, 3900).pass,
    "les deux oracles seraient interchangeables — ils ne le sont pas"
  );
  assert(
    "et celui du gantelet rejetterait un prompt de Boris",
    !G.verifyPrompt("# QUI TU ES\nx\n# SORTIE\nSinon tu continues.", G.limiteDefaut).pass
  );

  /* L'apostrophe typographique : mesurée comme le piège le plus bête et
     le plus certain — le modèle écrit « l’aveugle », l'assertion cherche
     « l'aveugle », et un prompt juste est déclaré faux. */
  const typo = bon.replace(/'/g, "’");
  assert("une apostrophe typographique ne fait pas échouer", G.verifyPrompt(typo, G.limiteDefaut).pass);

  /* Le choix de la meilleure tentative. Celui de Boris rend la plus
     COURTE ; ici la plus courte peut être la plus mutilée. */
  /* Les trois tentatives se DÉDUISENT de la fenêtre. Écrites en dur avec
     60/240/200, elles ont continué de passer après le 2026-08-26 en
     mesurant la fenêtre d'avant : l'assertion restait verte pour une
     règle que le code n'appliquait plus. */
  const milieu = (gaunt.VISEE.lo + gaunt.VISEE.hi) / 2;
  const faute = (m) =>
    `longueur : ${m} mots — ${m < milieu ? "trop court" : "trop long"} (vise ${gaunt.VISEE.lo} à ${gaunt.VISEE.hi})`;
  const tries = [
    { text: "a", check: { pass: false, fails: [faute(gaunt.MOTS_MIN - 50)], mots: gaunt.MOTS_MIN - 50 } },
    { text: "b", check: { pass: false, fails: [faute(gaunt.MOTS_MAX + 40)], mots: gaunt.MOTS_MAX + 40 } },
    { text: "c", check: { pass: false, fails: [faute(gaunt.MOTS_MAX - 20)], mots: gaunt.MOTS_MAX - 20 } },
  ];
  assert(
    "la meilleure tentative est la plus proche de la fenêtre, pas la plus courte",
    G.choisirMeilleure(tries).text === "c",
    G.choisirMeilleure(tries).text
  );
  const avecVert = [...tries, { text: "vert", check: { pass: true, fails: [], mots: 170 } }];
  assert("une tentative au vert gagne toujours", G.choisirMeilleure(avecVert).text === "vert");

  /* La grille du juge se reconstruit avec les clés de SA technique. Sans
     le troisième argument, six lignes vides sous une note juste. */
  const { normalizeNote } = await import("../src/meta.js");
  const noteG = normalizeNote(
    { note: 8, criteres: G.CRITERES.map((c) => ({ cle: c.cle, note: 8, mot: "ok" })) },
    "claude-opus-5",
    G.CRITERES
  );
  assert("les six critères du gantelet sont reconstruits", noteG.criteres.every((c) => c.note === 8));
  const noteMelangee = normalizeNote(
    { note: 8, criteres: G.CRITERES.map((c) => ({ cle: c.cle, note: 8, mot: "ok" })) },
    "claude-opus-5"
  );
  assert(
    "sans sa grille, la note du gantelet perdrait ses critères",
    noteMelangee.criteres.every((c) => c.note === null),
    "le troisième argument de normalizeNote n'est plus load-bearing"
  );

  /* La technique suit l'entrée de bibliothèque, sinon rouvrir un prompt
     de gantelet le ferait mesurer contre huit sections absentes. */
  const lib = await import("../src/library.js");
  const eG = lib.makeEntry({ idea: "une page", prompt: bon, limit: G.limiteDefaut, version: 1, technique: "gauntlet" });
  assert("une entrée garde sa technique", eG.technique === "gauntlet", eG.technique);
  const eVieille = lib.makeEntry({ idea: "x", prompt: "y", limit: 3900, version: 1 });
  assert("une entrée sans technique est de Boris", eVieille.technique === "boris", eVieille.technique);
  const imported = lib.parseBundle(JSON.stringify([{ ...eG }])).items[0];
  assert("et elle survit à l'export/import", imported.technique === "gauntlet", imported.technique);
  const bidon = lib.parseBundle(JSON.stringify([{ ...eG, technique: "inventée" }])).items[0];
  assert("une technique inventée dans un import retombe sur Boris", bidon.technique === "boris");
}

/* ---------- 1 bis 2 quater. l'oracle de la pile de crochets ----------
   Même discipline que pour le gantelet : l'exemple de référence passe,
   chaque faute mortelle nommée par la technique est provoquée une par
   une, et les trois oracles sont prouvés NON interchangeables. */

section("L'oracle de la pile de crochets");

{
  const { techniqueOf } = await import("../src/techniques.js");
  const croch = await import("../src/crochets.js");
  const H = techniqueOf("hooks");
  const bon = croch.PROMPT_REFERENCE;
  const vu = H.verifyPrompt(bon, H.limiteDefaut);
  assert("l'exemple de référence passe son propre vérificateur", vu.pass, vu.fails.join(" ; "));
  const fen = H.fenetre(H.limiteDefaut);
  assert("et il est dans la fenêtre visée", vu.count >= fen.lo && vu.count <= fen.hi, `${vu.count} car. pour ${fen.lo}–${fen.hi}`);
  assert(
    "le méta-prompt impose les cinq titres, dans l'ordre",
    (() => { const m = H.buildMeta(H.limiteDefaut); const r = croch.SECTIONS.map((t) => m.indexOf(t)); return r.every((x, i) => x >= 0 && (i === 0 || x > r[i - 1])); })()
  );
  assert("la dernière ligne n'est pas celle de Boris", croch.DERNIERE_LIGNE !== "Sinon tu continues.");

  const l1 = "1. sur * — après : journalise l'événement, son origine et son résultat dans JOURNAL.md, refus compris.";
  const l2 = "2. sur git.push — avant : build et vérificateur au vert, sinon refuse et nomme l'assertion rouge.";
  const casse = [
    ["rien de retiré", bon.replace(/^- .*\n?/gm, ""), "retiré"],
    ["le crochet sur * absent", bon.replace("1. sur * — après", "1. sur tool.call — après"), "sur *"],
    ["le crochet sur session.stop absent", bon.replace("sur session.stop", "sur session.fin"), "session.stop"],
    ["un placement hors vocabulaire", bon.replace("— avant : build", "— toujours : build"), "illisible"],
    ["le crochet sur * qui n'est pas le premier", bon.replace(l1 + "\n" + l2, l2.replace("2.", "1.") + "\n" + l1.replace("1.", "2.")), "premier"],
    ["la dernière ligne de Boris à la place de la sienne", bon.replace(croch.DERNIERE_LIGNE, "Sinon tu continues."), "finit"],
    ["l'ordre non posé", bon.replace("enveloppe", "domine"), "enveloppe"],
    ["aucun crochet « à la place »", bon.replace(/— à la place :/g, "— avant :"), "à la place"],
    ["une section absente", bon.replace("# LE FOND\n", ""), "sections absentes"],
  ];
  for (const [nom, texte, attendu] of casse) {
    const v = H.verifyPrompt(texte, H.limiteDefaut);
    assert(`refusé : ${nom}`, !v.pass, "accepté à tort");
    assert(
      `et la raison le nomme (${attendu})`,
      v.fails.some((f) => f.toLowerCase().includes(attendu.toLowerCase())),
      v.fails.join(" ; ")
    );
  }
  assert("neuf crochets sont trop", !H.verifyPrompt(bon.replace("6. sur session.stop", "6. sur fs.read — après : rien.\n7. sur fs.read — après : rien.\n8. sur fs.read — après : rien.\n9. sur session.stop"), H.limiteDefaut).pass);

  /* Ce qu'un modèle rend et qu'un vérificateur bête refuserait à tort. */
  assert("un trait d'union entouré d'espaces vaut un tiret", H.verifyPrompt(bon.replace(/—/g, "-"), H.limiteDefaut).pass);
  assert("un demi-cadratin aussi", H.verifyPrompt(bon.replace(/—/g, "–"), H.limiteDefaut).pass);
  assert("une apostrophe typographique ne fait pas échouer", H.verifyPrompt(bon.replace(/'/g, "’"), H.limiteDefaut).pass);

  const long = H.verifyPrompt(bon + " " + "mot ".repeat(600), H.limiteDefaut);
  assert("un prompt qui déborde le plafond est marqué hors limite", long.over === true);
  assert("et la faute commence par « longueur »", long.fails.some((f) => f.startsWith("longueur")));
  assert("le plafond dur est celui de l'atelier", H.hardLimit === (await import("../src/meta.js")).HARD_LIMIT);

  const B = techniqueOf("boris");
  const G = techniqueOf("gauntlet");
  /* L'oracle de Boris ACCEPTE un prompt de crochets — il ne teste que la
     première section et « # SORTIE », et laisse le reste à son juge. C'est
     précisément pourquoi la technique doit suivre l'entrée de bibliothèque :
     rouvert sous Boris, un prompt de crochets serait jugé contre huit
     sections qu'il n'a pas, sans qu'aucune pastille rouge ne le dise. */
  assert("l'oracle de Boris laisse passer un prompt de crochets — la technique DOIT suivre l'entrée", B.verifyPrompt(bon, 3900).pass);
  assert("celui du gantelet le rejette", !G.verifyPrompt(bon, G.limiteDefaut).pass);
  assert("et celui des crochets rejetterait un prompt de Boris", !H.verifyPrompt((await import("../src/meta.js")).PROMPT_REFERENCE, H.limiteDefaut).pass);
  assert("et un prompt de gantelet", !H.verifyPrompt((await import("../src/gauntlet.js")).PROMPT_REFERENCE, H.limiteDefaut).pass);

  /* La réparation nomme CINQ sections et la forme des crochets : celle
     de Boris, laissée par défaut, aurait demandé huit sections. */
  const rep = H.repairInstruction({ count: 3500, fails: ["x"], over: true }, H.limiteDefaut, 2);
  assert("la réparation parle de cinq sections", /cinq sections/.test(rep) && !/huit sections/.test(rep));
  assert("et nomme le vocabulaire des placements", croch.PLACEMENTS.every(([p]) => rep.includes(p)));

  const lib = await import("../src/library.js");
  const eH = lib.makeEntry({ idea: "un agent", prompt: bon, limit: H.limiteDefaut, version: 1, technique: "hooks" });
  assert("une entrée de bibliothèque garde la technique", eH.technique === "hooks");
  assert("et survit à l'export/import", lib.parseBundle(JSON.stringify([{ ...eH }])).items[0].technique === "hooks");
}

/* ---------- 1 bis 2 quinquies. l'oracle de la méthode Opus 5.5 ----------
   Même discipline que pour les deux précédentes : l'exemple passe, chaque
   faute que le guide nomme est provoquée une par une, et les quatre
   oracles sont prouvés NON interchangeables. */

section("L'oracle de la méthode Opus 5.5");

{
  const { techniqueOf } = await import("../src/techniques.js");
  const o55 = await import("../src/opus55.js");
  const O = techniqueOf("opus55");
  const bon = o55.PROMPT_REFERENCE;
  const vu = O.verifyPrompt(bon, O.limiteDefaut);
  assert("l'exemple de référence passe son propre vérificateur", vu.pass, vu.fails.join(" ; "));
  const fen = O.fenetre();
  assert("et il est dans la fenêtre visée", vu.mots >= fen.lo && vu.mots <= fen.hi, `${vu.mots} mots pour ${fen.lo}–${fen.hi}`);
  /* La leçon du gantelet : la fourchette de mots mord AVANT le plafond,
     sinon un curseur monte sans rien changer. Au rapport le plus bavard
     qu'on ait mesuré (6,2 car./mot), le haut de la fourchette tient sous
     le défaut, et le haut de la visée sous le plancher. */
  assert("la fourchette de mots tient sous le réglage par défaut", o55.MOTS_MAX * 6.2 < o55.LIMITE_DEFAUT, `${o55.MOTS_MAX * 6.2} car.`);
  assert("et la visée sous le plancher du curseur", o55.VISEE.hi * 6.2 < o55.LIMITE_MIN, `${o55.VISEE.hi * 6.2} car.`);

  const meta = O.buildMeta(O.limiteDefaut);
  for (const phrase of [o55.FINI, o55.CONTINUE, o55.ARRET, o55.DERNIERE_LIGNE]) {
    assert(`le méta-prompt impose « ${phrase.slice(0, 40)}… »`, meta.includes(phrase));
  }
  assert("le méta-prompt nomme les styles par défaut du guide", o55.STYLES_PAR_DEFAUT.every((st) => meta.includes(st)));
  /* Le méta-prompt ne doit rien demander de ce qu'il interdit : il nomme
     « réfléchis bien » dans sa liste noire, jamais comme consigne. */
  assert(
    "l'étape 1 et l'étape 2 ne demandent jamais de réfléchir",
    !/r[ée]fl[ée]chis/i.test(O.etape1.instruction() + O.etape2Instruction({ limit: O.limiteDefaut }))
  );

  const casse = [
    ["la ligne d'arrivée retirée", bon.replace("Fini veut dire :", "Il faudra que"), "fini veut dire"],
    ["la règle de continuer retirée", bon.replace(o55.CONTINUE, ""), "même message"],
    ["la règle d'arrêt retirée", bon.replace("Arrête-toi et demande-moi seulement si", "Préviens-moi si"), "arrête-toi"],
    ["un arrêt propre glissé dans la phrase fixe", bon.replace("sans moi, ou avant", "sans moi, si un test échoue, ou avant"), "phrase fixe"],
    ["un critère d'arrivée flou", bon.replace("et la suite de tests passe en entier", "et le code reste clair"), "constater"],
    ["une tâche qui commence par « Améliore »", bon.replace("Migre tous", "Améliore tous"), "améliore"],
    ["aucun geste destructeur nommé", bon.replace(/(geste destructeur :)[^.]*\./, "$1."), "destructeur"],
    ["« décris ton raisonnement »", bon.replace("Migre", "Décris ton raisonnement en détail. Migre"), "raisonnement"],
    ["un « réfléchis bien »", bon.replace("Migre", "Réfléchis bien, puis migre"), "réflexion"],
    ["un « étape par étape »", bon.replace("Migre", "Procède étape par étape et migre"), "réflexion"],
    ["une demande de montrer son raisonnement", bon.replace("Migre", "Montre ton raisonnement complet. Migre"), "raisonnement"],
    ["un « évite le look générique »", bon.replace("Migre", "Évite un look générique. Migre"), "générique"],
    ["des sous-agents sans preuves", bon.replace("et vérifie ses preuves avant de les accepter ", ""), "preuves"],
    ["la dernière ligne de Boris", bon.replace(o55.DERNIERE_LIGNE, "Sinon tu continues."), "autre technique"],
    ["une puce ajoutée", bon.replace("Fini veut dire :", "- Fini veut dire :"), "puces"],
    ["un titre ajouté", "# TÂCHE\n" + bon, "titres"],
  ];
  for (const [nom, texte, attendu] of casse) {
    const v = O.verifyPrompt(texte, O.limiteDefaut);
    assert(`refusé : ${nom}`, !v.pass, "accepté à tort");
    assert(
      `et la raison le nomme (${attendu})`,
      v.fails.some((f) => f.toLowerCase().includes(attendu.toLowerCase())),
      v.fails.join(" ; ")
    );
  }

  /* Ce qu'un modèle rend et qu'un vérificateur bête refuserait à tort :
     l'apostrophe typographique, l'espace fine insécable que la
     typographie française met devant les deux-points. */
  assert("une apostrophe typographique ne fait pas échouer", O.verifyPrompt(bon.replace(/'/g, "’"), O.limiteDefaut).pass);
  assert("une espace insécable avant les deux-points non plus", O.verifyPrompt(bon.replace(/ :/g, "\u202f:"), O.limiteDefaut).pass);
  /* « une étape » dans la règle de continuer n'est pas « étape par étape ». */
  /* Faux positifs trouvés à la relecture du 2026-09-23. */
  assert("« un guide pas à pas » est un livrable, pas une consigne de réflexion", O.verifyPrompt(bon.replace("pas un plan", "avec un guide pas à pas dans MIGRATION.md, pas un plan"), O.limiteDefaut).pass);
  assert("un prompt sans saut de paragraphe passe encore", O.verifyPrompt(bon.replace(/\n\n/g, " "), O.limiteDefaut).pass, O.verifyPrompt(bon.replace(/\n\n/g, " "), O.limiteDefaut).fails.join(" ; "));
  assert("un texte en Unicode décomposé aussi", O.verifyPrompt(bon.normalize("NFD"), O.limiteDefaut).pass);
  assert("et un trait d'union insécable dans « Arrête-toi »", O.verifyPrompt(bon.replace("Arrête-toi", "Arrête\u2011toi"), O.limiteDefaut).pass);
  assert("la règle de continuer n'est pas prise pour une consigne de réflexion", !o55.verifyPrompt(bon, O.limiteDefaut).fails.some((f) => f.includes("réflexion")));

  const court = O.verifyPrompt("Migre le dépôt. Fini veut dire : les tests passent. " + o55.DERNIERE_LIGNE, O.limiteDefaut);
  assert("un prompt trop court est refusé", !court.pass && court.fails.some((f) => f.startsWith("longueur")), court.fails.join(" ; "));
  const long = O.verifyPrompt(bon + " " + "mot ".repeat(500), O.limiteDefaut);
  assert("un prompt qui déborde le plafond est marqué hors limite", long.over === true);

  const B = techniqueOf("boris");
  const G = techniqueOf("gauntlet");
  const H = techniqueOf("hooks");
  assert("l'oracle de Boris rejette un prompt Opus 5.5", !B.verifyPrompt(bon, 3900).pass);
  assert("celui du gantelet aussi", !G.verifyPrompt(bon, G.limiteDefaut).pass);
  assert("celui des crochets aussi", !H.verifyPrompt(bon, H.limiteDefaut).pass);
  for (const [nom, ref] of [
    ["Boris", (await import("../src/meta.js")).PROMPT_REFERENCE],
    ["gantelet", (await import("../src/gauntlet.js")).PROMPT_REFERENCE],
    ["crochets", (await import("../src/crochets.js")).PROMPT_REFERENCE],
  ]) {
    assert(`et celui d'Opus 5.5 rejette un prompt ${nom}`, !O.verifyPrompt(ref, O.limiteDefaut).pass);
  }

  /* Tentatives DÉDUITES de la fenêtre — écrites en dur (60/340/305), elles
     ont viré au rouge dès que la visée est descendue de 150–240 à 120–230 :
     la leçon du § 29, rejouée le jour même. */
  const t = (id, mots) => ({ text: id, check: { pass: false, fails: [`longueur : ${mots} mots`], mots } });
  const tries = [t("a", Math.round(o55.MOTS_MIN / 3)), t("b", o55.MOTS_MAX + 40), t("c", o55.MOTS_MAX + 5)];
  assert("la meilleure tentative est la plus proche de la fenêtre", O.choisirMeilleure(tries).text === "c", O.choisirMeilleure(tries).text);

  const rep = O.repairInstruction({ count: 2400, mots: 330, fails: ["x"], over: true }, O.limiteDefaut, 2);
  assert("la réparation redemande les cinq mouvements, pas huit sections", /cinq mouvements/.test(rep) && !/huit sections/.test(rep));
  assert("et la dernière ligne exacte", rep.includes(o55.DERNIERE_LIGNE));

  const lib = await import("../src/library.js");
  const e = lib.makeEntry({ idea: "une migration", prompt: bon, limit: O.limiteDefaut, version: 1, technique: "opus55" });
  assert("une entrée de bibliothèque garde la technique", e.technique === "opus55");
  assert("et survit à l'export/import", lib.parseBundle(JSON.stringify([{ ...e }])).items[0].technique === "opus55");

  /* Le modèle lui-même. Opus 5.5 refuse `thinking: disabled` (400) et sa
     réflexion se compte dans max_tokens : l'atelier doit l'omettre ET lui
     rendre la place. Opus 5, lui, l'accepte encore — il ne doit pas être
     pris dans le même filet. */
  const api = await import("../src/api.js");
  const { MODELS, PRICES, costOf } = await import("../src/meta.js");
  assert("Opus 5.5 est proposé au choix des modèles", MODELS.some((m) => m.id === "claude-opus-5-5"));
  assert("il a son tarif", PRICES["claude-opus-5-5"]?.in === 4 && PRICES["claude-opus-5-5"]?.out === 20);
  assert(
    "et sa lecture en cache est comptée à son prix, pas au dixième",
    Math.abs(costOf("claude-opus-5-5", { cache_read_input_tokens: 1e6 }) - 0.2) < 1e-9,
    `${costOf("claude-opus-5-5", { cache_read_input_tokens: 1e6 })}`
  );
  /* Les tarifs, relus le 2026-09-23 sur la page officielle. Chaque modèle
     proposé a ses quatre prix : un modèle sans ligne coûterait « 0 $ » à
     l'écran sans que rien le signale. */
  const CHAMPS_PRIX = ["in", "out", "cacheWrite5m", "cacheWrite1h", "cacheRead"];
  const sansPrix = MODELS.filter((m) => !CHAMPS_PRIX.every((k) => Number(PRICES[m.id]?.[k]) > 0)).map((m) => m.id);
  assert("chaque modèle proposé a ses quatre prix", sansPrix.length === 0, sansPrix.join(", ") || "tous");
  assert("Sonnet 5 est facturé 2 $ / 10 $, plus 3 $ / 15 $", PRICES["claude-sonnet-5"].in === 2 && PRICES["claude-sonnet-5"].out === 10);
  /* L'écriture en cache vaut 1,25 fois l'entrée (5 min) et 2 fois (1 h),
     sur tous les modèles — la règle de la page, tenue ligne par ligne. */
  assert(
    "les écritures en cache suivent 1,25× et 2× l'entrée",
    MODELS.every((m) => {
      const p = PRICES[m.id];
      return Math.abs(p.cacheWrite5m - p.in * 1.25) < 1e-9 && Math.abs(p.cacheWrite1h - p.in * 2) < 1e-9;
    })
  );
  const million = { input_tokens: 1e6, output_tokens: 1e6 };
  assert("un million d'entrée et de sortie sur Sonnet 5 coûte 12 $", Math.abs(costOf("claude-sonnet-5", million) - 12) < 1e-9, `${costOf("claude-sonnet-5", million)}`);
  assert(
    "une écriture en cache d'une heure est comptée au double de l'entrée",
    Math.abs(costOf("claude-sonnet-5", { cache_creation_input_tokens: 1e6, cache_creation: { ephemeral_1h_input_tokens: 1e6 } }) - 4) < 1e-9
  );
  assert(
    "et sans détail, au tarif 5 minutes",
    Math.abs(costOf("claude-sonnet-5", { cache_creation_input_tokens: 1e6 }) - 2.5) < 1e-9
  );
  assert("Opus 5.5 est reconnu comme pensant toujours", api.PENSE_TOUJOURS.test("claude-opus-5-5"));
  /* La méthode impose son rédacteur (mesuré au banc) ; il doit exister au
     choix des modèles, sinon l'écran afficherait un identifiant nu. */
  /* Tout en Opus 5.5, un effort par rôle (demande de Gabriel, 2026-09-23). */
  const { MODELE, ROLES, contexteNeuf } = await import("../src/meta.js");
  assert("un seul modèle, Opus 5.5", MODELE === "claude-opus-5-5" && MODELS.length === 1 && MODELS[0].id === MODELE);
  assert(
    "chaque rôle a un effort que l'API connaît",
    ["questions", "redaction", "juge"].every((r) => ["low", "medium", "high", "xhigh", "max"].includes(ROLES[r]?.effort)),
    JSON.stringify(ROLES)
  );
  assert("aucune technique n'impose plus son propre rédacteur", (await import("../src/techniques.js")).TECHNIQUES.every((x) => !("redacteur" in x)));

  /* Le juge en contexte neuf : c'est ce qui remplace « le juge n'est pas
     le modèle qui a produit ». Il ne doit voir ni l'instruction de l'étape
     1, ni les tentatives, et il doit voir les précisions de l'utilisateur. */
  {
    const e1 = O.etape1.instruction();
    const convo = [
      { role: "user", content: O.buildMeta(O.limiteDefaut) + "\n\nIDÉE :\nmigrer billing-api\n\n" + e1 },
      { role: "assistant", content: '{"questions":["Où est le dépôt ?"]}' },
      { role: "user", content: "RÉPONSES :\nQ1 : Où est le dépôt ?\nR : github.com/acme/billing-api\n\nÉTAPE 2 — Écris MAINTENANT…" },
      { role: "assistant", content: "brouillon raté" },
      { role: "user", content: "ASSERTION ÉCHOUÉE : longueur" },
      { role: "assistant", content: bon },
      { role: "user", content: "CORRECTION DEMANDÉE :\najoute forcer un push\n\nApplique-la au prompt ci-dessus…" },
    ];
    const neuf = contexteNeuf({ convo, texte: bon, etape1: e1, audit: O.auditInstruction() });
    const c = neuf[0].content;
    assert("le juge reçoit UN message neuf", neuf.length === 1 && neuf[0].role === "user");
    assert("sans l'instruction de l'étape 1", !c.includes(e1));
    assert("sans les tentatives ratées ni les réparations", !c.includes("brouillon raté") && !c.includes("ASSERTION ÉCHOUÉE"));
    assert("avec les réponses et les corrections de l'utilisateur", c.includes("github.com/acme/billing-api") && c.includes("ajoute forcer un push"));
    assert("avec le prompt, présenté comme l'œuvre d'un autre", c.includes(bon) && /écrit par un autre agent/.test(c));
    assert("et la grille du juge à la fin", c.trimEnd().endsWith(O.auditInstruction().trimEnd()));
  }
  assert("Opus 5 ne l'est pas", !api.PENSE_TOUJOURS.test("claude-opus-5"));

  /* Le corps réellement envoyé, lu sur un fetch intercepté : c'est lui que
     l'API refuserait, pas une constante. */
  const envoye = async (model, effort) => {
    const vrai = globalThis.fetch;
    let corps = null;
    globalThis.fetch = async (_url, init) => {
      corps = JSON.parse(init.body);
      throw new Error("intercepté");
    };
    try {
      await api.callClaude([{ role: "user", content: "x" }], { apiKey: "k", model, maxTokens: 1200, effort });
    } catch {
      /* attendu : l'appel est intercepté */
    } finally {
      globalThis.fetch = vrai;
    }
    return corps;
  };
  const c55 = await envoye("claude-opus-5-5", "high");
  assert("à Opus 5.5, aucun réglage de réflexion n'est envoyé", c55 && !("thinking" in c55), JSON.stringify(c55?.thinking));
  assert("et la place de sa réflexion s'ajoute au budget", c55?.max_tokens === 1200 + api.MARGE_REFLEXION, `${c55?.max_tokens}`);
  assert("l'effort du rôle part dans output_config", c55?.output_config?.effort === "high", JSON.stringify(c55?.output_config));
  /* Crédit épuisé : le message dit quoi faire, en français, au lieu de
     l'erreur brute de l'API. */
  {
    const vrai = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { message: "Your credit balance is too low to access the Anthropic API." } }), { status: 400 });
    let msg = "";
    try {
      await api.callClaude([{ role: "user", content: "x" }], { apiKey: "k", model: "claude-opus-5-5", maxTokens: 10 });
    } catch (e) {
      msg = e.message;
    } finally {
      globalThis.fetch = vrai;
    }
    assert("un crédit épuisé se dit en français, avec le geste à faire", /plus de crédit/.test(msg) && /ta propre clé/.test(msg), msg);
  }
  const c5 = await envoye("claude-sonnet-5");
  assert("aux autres, la réflexion reste coupée et le budget inchangé", c5?.thinking?.type === "disabled" && c5?.max_tokens === 1200);
  assert("et sans effort demandé, aucun output_config", !("output_config" in c5));
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
  const { CHAPITRES, MOUVEMENTS_GANTELET, MOUVEMENTS_OPUS55, PIED, SECTIONS_BORIS, SECTIONS_CROCHETS } = await import("../src/aide.js");
  const { buildMeta, HARD_LIMIT } = await import("../src/meta.js");

  const NB_CHAPITRES = 16;
  assert("l'aide a seize chapitres", CHAPITRES.length === NB_CHAPITRES, `${CHAPITRES.length}`);
  assert("chacun porte un numéro unique", new Set(CHAPITRES.map((c) => c.num)).size === NB_CHAPITRES);
  assert("chacun porte une clé unique", new Set(CHAPITRES.map((c) => c.cle)).size === NB_CHAPITRES);
  /* Le numéro se déduit du rang : c'est ce qui permet d'insérer un
     chapitre sans renuméroter, et c'est donc ça qu'il faut tenir. */
  assert(
    "les numéros suivent le rang, sans trou",
    CHAPITRES.every((c, i) => c.num === String(i + 1).padStart(2, "0")),
    CHAPITRES.map((c) => c.num).join(" ")
  );
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
  for (const cle of ["porte", "idee", "techniques", "questions", "marbre", "epreuve", "note", "fil", "casse", "reglages", "cout", "methode", "gantelet", "crochets", "opus55", "securite"]) {
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

  /* Le chapitre du gantelet annonce sept mouvements, et les quatre qui
     sont des phrases LITTÉRALES du prompt doivent se retrouver dans
     l'exemple de référence — même contrôle que les huit sections de
     Boris contre son méta-prompt, et pour la même raison : une aide qui
     promet une forme que l'atelier ne produit plus se lit comme vraie. */
  {
    const gaunt = await import("../src/gauntlet.js");
    assert("l'aide annonce sept mouvements", MOUVEMENTS_GANTELET.length === 7, `${MOUVEMENTS_GANTELET.length}`);
    assert(
      "chaque mouvement est traduit en français courant",
      MOUVEMENTS_GANTELET.every(([, quoi]) => quoi && quoi.length > 40)
    );
    const litterales = ["La barre, c'est", "Le critique est dur.", "/loop", "Déploie des sous-agents et ultracode."];
    for (const phrase of litterales) {
      assert(
        `« ${phrase} » est bien dans le prompt produit`,
        gaunt.PROMPT_REFERENCE.includes(phrase)
      );
      assert(
        `et annoncée par l'aide`,
        MOUVEMENTS_GANTELET.some(([titre]) => titre.includes(phrase.replace(/\.$/, "")) || phrase.includes(titre.replace(/…$/, "").trim()))
      );
    }
    /* La licence CC BY impose l'attribution : elle est due, elle se
       vérifie. Dans le code ET dans l'écran que l'utilisateur lit. */
    const attribution = CHAPITRES.find((c) => c.cle === "techniques").points.join(" ");
    assert("l'aide attribue la technique à son auteur", /Matt Shumer/.test(attribution));
    assert("et nomme la licence", /CC BY/.test(attribution));
    /* La pile de crochets n'est pas sous licence, mais elle est
       transposée d'une proposition publique : la source se cite. */
    assert("l'aide cite la source des crochets", /Function Hooks/.test(attribution) && /91870/.test(attribution));
  }

  /* Le chapitre des crochets annonce cinq sections, et ce sont celles
     que la technique impose — lues dans `crochets.js`, pas recopiées. */
  {
    const croch = await import("../src/crochets.js");
    assert("l'aide annonce cinq sections de crochets", SECTIONS_CROCHETS.length === 5, `${SECTIONS_CROCHETS.length}`);
    assert(
      "ce sont exactement celles de la technique, dans l'ordre",
      SECTIONS_CROCHETS.every(([titre], i) => titre === croch.SECTIONS[i])
    );
    assert(
      "chaque section est traduite en français courant",
      SECTIONS_CROCHETS.every(([, quoi]) => quoi && quoi.length > 40)
    );
    assert("et la dernière ligne annoncée est la vraie", SECTIONS_CROCHETS[4][1].includes(croch.DERNIERE_LIGNE));
  }

  /* Le chapitre Opus 5.5 annonce cinq mouvements ; ses trois phrases
     littérales viennent de `opus55.js` et doivent être dans l'exemple de
     référence — une aide qui promet une phrase que l'atelier n'écrit plus
     se lit comme vraie. */
  {
    const o55 = await import("../src/opus55.js");
    assert("l'aide annonce cinq mouvements Opus 5.5", MOUVEMENTS_OPUS55.length === 5, `${MOUVEMENTS_OPUS55.length}`);
    assert(
      "chaque mouvement est traduit en français courant",
      MOUVEMENTS_OPUS55.every(([, quoi]) => quoi && quoi.length > 40)
    );
    for (const phrase of [o55.FINI, o55.CONTINUE, o55.ARRET, o55.DERNIERE_LIGNE]) {
      assert(`« ${phrase.slice(0, 40)}… » est dans le prompt de référence`, o55.PROMPT_REFERENCE.includes(phrase));
      assert("et l'aide la cite", MOUVEMENTS_OPUS55.some(([t, q]) => t.includes(phrase) || q.includes(phrase)));
    }
    const attribution = CHAPITRES.find((c) => c.cle === "techniques").points.join(" ");
    assert("l'aide cite le guide d'Anthropic sur Opus 5.5", /Getting the most out of Opus 5\.5/.test(attribution));
  }

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
  /* TROISIÈME surface, et elle manquait : les deux autres ouvrent sur un
     prompt déjà là, donc la carte de l'idée y est REPLIÉE — et le choix de
     la technique, qui vit dedans, n'était mesuré à aucune largeur. C'est
     exactement la forme du défaut que ce dépôt a déjà payé une fois (la
     barre supérieure qui débordait de 15 px à 320). Une grille à deux
     colonnes qui ne retombe pas sur une seule ne se voit pas autrement. */
  {
    label: "atelier neuf",
    marker: "Boucle du gantelet",
    routes: {
      "/api/session": {
        ok: true,
        authenticated: true,
        user: { id: "sonde", name: "Sonde", email: "" },
        users: [],
      },
      "/api/prompts": { ok: true, items: [] },
      "/api/usage": { ok: true, total: 0 },
    },
    /* Le gantelet est armé AVANT l'application : c'est la technique qui
       n'existait pas, donc celle dont l'écran n'a jamais été mesuré. */
    action: `<script>
      localStorage.setItem("atelier-boris:reglages", JSON.stringify({
        writer: "claude-sonnet-5", judge: "claude-opus-5",
        technique: "gauntlet", charLimit: 3900, charLimitGauntlet: 2500
      }));
    </script>`,
    check(dom) {
      const tuiles = (dom.match(/class="technique(?: technique-active)?"/g) || []).length;
      assert("les quatre techniques sont proposées", tuiles === 4, `${tuiles} tuile(s)`);
      const active = /class="technique technique-active"[\s\S]{0,400}?technique-nom">([^<]*)</.exec(dom);
      assert(
        "celle qui est armée est celle qui est marquée",
        active?.[1] === "Boucle du gantelet",
        active?.[1] || "aucune tuile active"
      );
      /* L'écran suit la technique : bandeau, accroche et exemple du champ
         vide viennent d'elle. Laissés en dur, ils parlaient d'échecs et de
         « TON PRODUIT » à quelqu'un venu écrire une page de tarifs. */
      assert("le bandeau est celui du gantelet", dom.includes("But — Barre — Critique — Victoire"));
      assert("l'accroche aussi", dom.includes("des références réelles à battre"));
      assert("et l'exemple du champ vide", dom.includes("aussi bonne que celle de Stripe"));
      assert("la limite affichée est la sienne", /limite 2500 car\./.test(dom));
    },
  },
  /* QUATRIÈME surface, et la seule à ouvrir une VRAIE grande fenêtre.

     Au-delà de 1400 px l'atelier tient exactement dans l'écran : la
     coquille ne défile plus, et chaque colonne défile chez elle. Ce
     palier n'était éprouvé par AUCUN instrument automatique — le harnais
     force la largeur du document, les media queries s'évaluent sur le
     vrai viewport (§ 18), et le pilotage demande Playwright. Il a laissé
     passer un défaut qui est allé en production le 2026-08-23 : la
     colonne de droite débordait sa rangée de 187 px, donc son corps
     n'avait aucune hauteur à contraindre, donc `overflow-y: auto` ne
     produisait aucune barre — et le bouton « Appliquer l'audit → v2 »
     était dans le DOM, son bas à 1018 px pour une fenêtre de 913,
     INATTEIGNABLE à la souris. Le juge reprochait des choses qu'on ne
     pouvait plus corriger.

     `--window-size` est honoré par ce Chrome : la disposition à trois
     panneaux se rend pour de bon. La sonde de débordement est donc
     désactivée ici (elle forcerait le document à 320 px et détruirait ce
     qu'on vient éprouver) et la surface mesure elle-même. */
  {
    label: "trois panneaux (1800 px)",
    marker: "Travail en cours",
    taille: "1800,1000",
    sansMesure: true,
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
    action: `<script>
      window.__manuel = true;
      setTimeout(() => {
        /* On charge la colonne de droite comme la vie la charge : le
           cassetin rouvert met le prompt au marbre, et « ⋯ » déplie les
           six critères du juge. Mesurer une colonne vide prouverait
           qu'une colonne vide tient dans l'écran. */
        document.querySelector(".casse-toggle")?.click();
        setTimeout(() => {
          document.querySelector(".casse-open")?.click();
          setTimeout(() => {
            document.querySelector(".note-plus")?.click();
            setTimeout(() => {
              const h = (sel) => {
                const el = document.querySelector(sel);
                return el ? Math.round(el.getBoundingClientRect().height) : -1;
              };
              const corps = document.querySelector(".epreuve-corps");
              const pupitre = document.querySelector(".pupitre-corps");
              const p = document.createElement("pre");
              p.id = "PROBE-LARGE";
              p.textContent = [
                "largeur:" + window.innerWidth,
                "shell:" + h(".shell"),
                "epreuve:" + h(".epreuve"),
                "pupitre:" + h(".pupitre"),
                "corpsClient:" + (corps ? corps.clientHeight : -1),
                "corpsScroll:" + (corps ? corps.scrollHeight : -1),
                "pupitreClient:" + (pupitre ? pupitre.clientHeight : -1),
                "pupitreScroll:" + (pupitre ? pupitre.scrollHeight : -1),
                "page:" + Math.round(document.documentElement.scrollHeight),
              ].join(" ");
              document.body.appendChild(p);
            }, 500);
          }, 500);
        }, 500);
      }, 1400);
    </script>`,
    check(dom) {
      const found = /id="PROBE-LARGE">([^<]*)</.exec(dom);
      if (!found) return assert("trois panneaux — mesure obtenue", false, "sonde muette");
      const m = Object.fromEntries(
        found[1].trim().split(" ").map((pair) => {
          const [k, v] = pair.split(":");
          return [k, Number(v)];
        })
      );

      assert("la disposition à trois panneaux est bien celle rendue", m.largeur >= 1400, `${m.largeur} px`);

      /* L'invariant qui a manqué. Un élément de grille vaut
         `min-height: auto` : sans `min-height: 0`, il refuse de descendre
         sous la hauteur de son contenu et cette valeur l'emporte sur le
         `height: 100%`. Le panneau déborde alors sa rangée, la coquille le
         coupe, et son corps n'a plus rien à contraindre. */
      assert(
        "la colonne de droite ne déborde pas sa rangée",
        m.epreuve <= m.shell + 1,
        `épreuve ${m.epreuve} px pour une rangée de ${m.shell}`
      );
      assert(
        "celle de gauche non plus",
        m.pupitre <= m.shell + 1,
        `pupitre ${m.pupitre} px pour une rangée de ${m.shell}`
      );

      /* Et « défile chez elle » doit vouloir dire quelque chose : le corps
         est BORNÉ. Un corps qui vaut exactement son contenu n'a jamais de
         barre, quoi qu'en dise `overflow-y: auto`. */
      assert(
        "et son corps est borné — donc il défile vraiment",
        m.corpsClient > 0 && m.corpsClient < m.shell,
        `corps ${m.corpsClient} px, rangée ${m.shell}`
      );
      assert(
        "tout ce que le corps contient reste atteignable",
        m.corpsScroll >= m.corpsClient,
        `${m.corpsScroll} à parcourir dans ${m.corpsClient}`
      );

      /* Et la promesse du palier : la page elle-même ne défile pas. */
      assert(
        "la page tient dans l'écran, sans défilement",
        m.page <= 1000 + 1,
        `${m.page} px pour 1000`
      );
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
    if (!surface.sansMesure) {
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
    }
    surface.check?.(measured.dom);
  }
}

/* ---------- 4. le générateur, contre la vraie API ---------- */

section("Générateur (appel direct Anthropic)");

if (!ANTHROPIC) {
  console.log(
    process.env.VERIFY_API === "1"
      ? "… ignoré : VERIFY_API=1 mais aucune clé (ANTHROPIC_TEST_KEY) fournie."
      : "… ignoré : les générations réelles coûtent sur la clé API — VERIFY_API=1 pour les lancer."
  );
} else {
  const limit = 3900;
  const { techniqueOf } = await import("../src/techniques.js");
  const B = techniqueOf("boris");
  const { MAX_ATTEMPTS: MAX_TENTATIVES, runVerifiedGeneration } = await import("../src/generate.js");

  const base = [
    {
      role: "user",
      content:
        B.buildMeta(limit) +
        "\n\nIDÉE :\nune conciergerie de copropriétés pilotée par des agents",
    },
  ];

  let httpOk = true;

  /* On appelle `callClaude` — celui de l'atelier, flux compris — et non une
     copie du fetch. Le vérificateur a déjà déclaré rouge une boucle qu'il
     avait recopiée : il ne recopie plus rien. */
  const { callClaude, STALL_MS_PENSEUR } = await import("../src/api.js");
  const { MODELE: MODELE_ECRAN, ROLES: ROLES_ECRAN } = await import("../src/meta.js");

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
          /* Le modèle et l'effort de l'écran — le harnais éprouve le circuit
             que l'utilisateur obtient, pas un autre. */
          model: MODELE_ECRAN,
          effort: ROLES_ECRAN.redaction.effort,
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
    /* L'instruction vient de la TECHNIQUE, elle n'est plus recopiée ici :
       une copie d'instruction vieillit toute seule, et le vérificateur
       aurait alors éprouvé une méthode que l'atelier n'applique plus. */
    instruction: B.etape2Instruction({ limit }),
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
      /* Opus 5.5 pense avant son premier mot, en silence : la borne est
         celle que l'atelier tolère, pas les 30 s d'un modèle sans réflexion. */
      firstDeltaMs > 0 && firstDeltaMs < STALL_MS_PENSEUR,
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

  /* ---- la même boucle, pour la seconde technique ----
     Ce qui est éprouvé ici n'est pas la qualité du prompt mais le fait
     qu'un modèle réel, avec CE méta-prompt, sorte quelque chose que CET
     oracle accepte. C'est la seule façon de savoir si les assertions du
     gantelet sont tenables — un vérificateur trop strict ne se voit pas
     sur un texte écrit à la main pour lui plaire. */
  const G = techniqueOf("gauntlet");
  const limitG = G.limiteDefaut;
  const baseG = G.baseConvoFor({
    idea: "une page de tarifs pour un logiciel de facturation destiné aux indépendants",
    limit: limitG,
  });

  const runG = await runVerifiedGeneration({
    ask: async (convo) => {
      const { text } = await callClaude(convo, {
        apiKey: ANTHROPIC,
        model: MODELE_ECRAN,
        effort: ROLES_ECRAN.redaction.effort,
        maxTokens: 1400,
      });
      return text;
    },
    baseConvo: baseG,
    instruction: G.etape2Instruction({
      limit: limitG,
      barre: "la page de tarifs de Stripe (stripe.com/pricing)",
      mesure: "",
    }),
    limit: limitG,
    verify: G.verifyPrompt,
    repair: G.repairInstruction,
    choisir: G.choisirMeilleure,
    onLog: (line) => console.log(`   · [gantelet] ${line}`),
  }).catch((error) => {
    assert("le gantelet obtient une réponse", false, error.message);
    return null;
  });

  if (runG) {
    assert(
      `le prompt du gantelet passe son oracle en ${MAX_TENTATIVES} tentatives au plus`,
      runG.check.pass,
      `${runG.check.mots} mots — ${runG.check.fails.join(" ; ") || "au vert"}`
    );
    /* Bornes lues dans la technique : recopiées, elles ont survécu au
       changement de fenêtre du 2026-08-26 en vérifiant l'ancienne. */
    const bornes = await import("../src/gauntlet.js");
    assert(
      "il tient dans la fenêtre de mots",
      runG.check.mots >= bornes.MOTS_MIN && runG.check.mots <= bornes.MOTS_MAX,
      `${runG.check.mots} mots pour ${bornes.MOTS_MIN}–${bornes.MOTS_MAX}`
    );
    assert("il nomme la barre demandée", /stripe/i.test(runG.text), runG.text.slice(0, 120));
    assert(
      "il finit par la ligne des sous-agents",
      /ultracode/i.test(runG.text.trim().split("\n").filter(Boolean).pop()),
      runG.text.trim().split("\n").filter(Boolean).pop()
    );
    assert("il ne contient ni titre ni puce", !/^[ \t]*(#{1,6}\s|[-*•]\s)/m.test(runG.text));
  }

  /* ---- la même boucle, pour la troisième technique ----
     Un oracle qui exige une forme de ligne exacte (« N. sur x.y — placement : … »)
     est précisément le genre qui peut être intenable pour un modèle réel
     sans qu'un texte écrit à la main le montre. */
  const H = techniqueOf("hooks");
  const limitH = H.limiteDefaut;
  const runH = await runVerifiedGeneration({
    ask: async (convo) => {
      const { text } = await callClaude(convo, { apiKey: ANTHROPIC, model: MODELE_ECRAN, effort: ROLES_ECRAN.redaction.effort, maxTokens: 2200 });
      return text;
    },
    baseConvo: H.baseConvoFor({
      idea: "un agent qui tient la boîte support d'une boutique en ligne Shopify : il répond aux clients, prépare les avoirs, mais ne rembourse jamais lui-même",
      limit: limitH,
    }),
    instruction: H.etape2Instruction({ limit: limitH }),
    limit: limitH,
    verify: H.verifyPrompt,
    repair: H.repairInstruction,
    onLog: (line) => console.log(`   · [crochets] ${line}`),
  }).catch((error) => {
    assert("la pile de crochets obtient une réponse", false, error.message);
    return null;
  });

  if (runH) {
    assert(
      `le prompt de crochets passe son oracle en ${MAX_TENTATIVES} tentatives au plus`,
      runH.check.pass,
      `${runH.check.count} car., ${runH.check.crochets} crochet(s) — ${runH.check.fails.join(" ; ") || "au vert"}`
    );
    const croch = await import("../src/crochets.js");
    const { crochets } = croch.lireCrochets(runH.text);
    assert("le premier crochet est sur *", crochets[0]?.evenement === "*", crochets[0]?.evenement);
    assert("un crochet retient session.stop", crochets.some((c) => c.evenement === "session.stop"));
    assert("le remboursement est retiré ou refusé", /rembours/i.test(runH.text), runH.text.slice(0, 200));
    assert(`il finit par « ${croch.DERNIERE_LIGNE} »`, runH.text.trim().endsWith(croch.DERNIERE_LIGNE));
  }

  /* ---- la même boucle, pour la méthode Opus 5.5 ----
     Une idée d'audit à grande échelle : c'est le cas où la clause des
     sous-agents s'applique, donc celui où son exigence (« vérifie ses
     preuves ») peut devenir intenable pour un modèle réel. L'écriture
     passe par Opus 5.5 lui-même — c'est aussi la preuve que l'atelier
     sait lui parler (réflexion omise, place rendue). */
  const O = techniqueOf("opus55");
  const limitO = O.limiteDefaut;
  const runO = await runVerifiedGeneration({
    ask: async (convo) => {
      const { text } = await callClaude(convo, { apiKey: ANTHROPIC, model: MODELE_ECRAN, effort: ROLES_ECRAN.redaction.effort, maxTokens: 1600 });
      return text;
    },
    baseConvo: O.baseConvoFor({
      idea: "auditer chaque service du dossier services/ de notre monorepo pour le bug de reconnexion Redis décrit dans le ticket OPS-412, et me dire lesquels sont touchés",
      limit: limitO,
    }),
    instruction: O.etape2Instruction({ limit: limitO }),
    limit: limitO,
    verify: O.verifyPrompt,
    repair: O.repairInstruction,
    choisir: O.choisirMeilleure,
    onLog: (line) => console.log(`   · [opus55] ${line}`),
  }).catch((error) => {
    assert("la méthode Opus 5.5 obtient une réponse d'Opus 5.5", false, error.message);
    return null;
  });

  if (runO) {
    const o55 = await import("../src/opus55.js");
    assert(
      `le prompt Opus 5.5 passe son oracle en ${MAX_TENTATIVES} tentatives au plus`,
      runO.check.pass,
      `${runO.check.mots} mots — ${runO.check.fails.join(" ; ") || "au vert"}`
    );
    assert("il nomme le ticket de l'idée", /OPS-412/.test(runO.text), runO.text.slice(0, 160));
    assert("la clause d'audit s'y applique : sous-agents et tableau", /sous-agent/i.test(runO.text) && /tableau/i.test(runO.text));
    assert(`il finit par « ${o55.DERNIERE_LIGNE} »`, runO.text.trim().endsWith(o55.DERNIERE_LIGNE));
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
async function measureOverflow({ label, routes, action, taille, sansMesure }) {
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
          /* `--window-size` EST honoré par ce Chrome, contrairement à ce que
             disait DECISIONS § 18 — vérifié le 2026-08-23, une fenêtre de
             1800 px rend bien la disposition à trois panneaux. C'est ce qui
             permet enfin d'éprouver un palier au-dessus de 1100 px sans
             Playwright. La sonde de débordement, elle, continue de forcer la
             largeur du document : elle mesure autre chose. */
          ...(taille ? [`--window-size=${taille}`] : []),
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

  /* Une surface qui mesure elle-même n'a pas de sonde de débordement : la
     forcer à 320 px détruirait précisément la disposition qu'elle vient
     éprouver. */
  if (sansMesure) return { dom, widths: [], fixes: 0 };

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
