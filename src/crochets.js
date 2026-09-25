/* ================================================================
   LA PILE DE CROCHETS — la troisième technique de l'atelier.

   Inspirée des « Function Hooks » de Claude Code : une proposition
   d'Anthropic, non livrée, mise en discussion publique le 2026-09-03
   (Alice Poteat, « Function Hooks: Core Architecture », août 2026 ;
   github.com/anthropics/claude-code/issues/91870 ; annonce
   x.com/ClaudeDevs/status/2095572891941351550). Ce n'est pas une
   technique de prompt à l'origine : c'est une architecture de plugin.
   Ce fichier en transpose l'algèbre en mandat d'agent. Ce qui est
   emprunté, mot pour mot dans l'esprit :

   - `$`, le monde : tout ce qu'un agent peut voir et faire est une
     liste finie de capacités, et « rien d'ambiant » — ce qu'il a fait,
     c'est exactement les appels qu'il a passés.
   - Le RETRAIT : une interdiction en prose tient la plupart du temps et
     lâche au pire moment ; une capacité RETIRÉE ne peut pas être
     invoquée. Le prompt ne dit pas « ne déploie pas en prod », il dit
     que `deploy.run` vers la prod n'existe pas dans son monde.
   - Le crochet `($, e, next)` : une règle est attachée à un ÉVÉNEMENT
     nommé (`fs.write`, `mail.send`, `session.stop`), avec un PLACEMENT
     — avant, après, pendant, à la place, modifiant — et une décision
     qui est un résultat, jamais un silence.
   - L'ORDRE EST L'EMBOÎTEMENT : le premier crochet enveloppe tous les
     autres ; rien en dessous ne peut le contourner. L'audit et les
     refus se mettent en haut, les défauts en bas.
   - Le crochet sur `*` : une seule règle qui voit tout, et un journal
     qui contient les refus autant que les succès.
   - `⊥`, le fond : sous la pile, le travail lui-même — ce qui se passe
     quand aucun crochet n'intercepte.

   Ce que cette technique change par rapport aux deux autres : Boris
   écrit un mandat de patron dont la preuve est DEDANS ; le gantelet
   écrit un mandat de compétiteur dont la preuve est DEHORS. La pile de
   crochets écrit un mandat de GARDE : chaque règle est accrochée au
   geste qu'elle gouverne, dans un ordre qui est une autorité, et ce que
   l'agent ne doit jamais faire n'est pas une consigne — c'est une
   absence. C'est ce qu'il faut quand ce qui compte le plus est ce que
   l'agent ne doit PAS faire : données réelles, argent, envois, prod.
   ================================================================ */

import { countChars, targetWindow, HARD_LIMIT } from "./meta.js";
import { conversationDe } from "./harnais.js";

export { HARD_LIMIT, countChars };

/* ---------- la mesure ----------
   Même unité que Boris — des caractères, le plafond dur commun de
   l'atelier (aucun prompt au-dessus n'en sort, DECISIONS § 19). Le
   défaut est plus bas que celui de Boris : cinq sections au lieu de
   huit, et des crochets qui tiennent chacun sur une ligne. */
export const LIMITE_MIN = 1500;
export const LIMITE_DEFAUT = 3000;

export const capLimit = (limit) => {
  const n = Number(limit);
  return Math.min(HARD_LIMIT, Math.max(LIMITE_MIN, Number.isFinite(n) ? Math.round(n) : LIMITE_DEFAUT));
};

/* ---------- le vocabulaire ----------
   Les cinq sections, dans l'ordre. Les titres sont la structure : le
   vérificateur les cherche, le méta-prompt les impose, l'aide les
   traduit — depuis cette seule liste. */
export const SECTIONS = ["# LE MONDE", "# RETIRÉ", "# CROCHETS", "# LE FOND", "# SORTIE"];

/* Les cinq placements de l'architecture d'origine (§ 2.2), traduits.
   C'est un vocabulaire FERMÉ : un crochet dont le placement n'est pas
   l'un de ces cinq n'est pas un crochet, et le vérificateur le refuse. */
export const PLACEMENTS = [
  ["avant", "fais quelque chose, puis laisse le geste se faire"],
  ["après", "laisse le geste se faire, puis agis sur son résultat"],
  ["pendant", "lance le geste et travaille à côté sans l'attendre"],
  ["à la place", "le geste n'a pas lieu ; ce que tu rends à la place est le résultat"],
  ["modifiant", "le geste a lieu, mais avec un argument que tu as changé — et tu dis ce que tu as changé"],
];

/* Les événements proposés au modèle. La liste est OUVERTE — le prompt
   peut nommer un événement du métier (`facture.emise`, `billet.publie`)
   pourvu qu'il garde la forme `nom.verbe` — mais deux sont obligatoires :
   `*`, sans quoi rien n'est journalisé, et `session.stop`, sans quoi
   l'agent peut rendre la main avec du rouge. */
export const EVENEMENTS = [
  ["*", "tout événement, y compris ceux des crochets eux-mêmes — le seul endroit d'où l'on voit tout"],
  ["tool.call", "tout appel d'outil, quel qu'il soit"],
  ["fs.read", "lire un fichier"],
  ["fs.write", "écrire ou modifier un fichier"],
  ["process.spawn", "lancer une commande"],
  ["http.fetch", "appeler le réseau"],
  ["git.push", "pousser vers le dépôt distant"],
  ["deploy.run", "mettre en ligne"],
  ["secret.read", "lire un secret"],
  ["data.delete", "supprimer des données"],
  ["mail.send", "envoyer un message à quelqu'un"],
  ["agent.spawn", "lancer un sous-agent"],
  ["question.ask", "l'agent veut poser une question à l'humain"],
  ["session.stop", "l'agent s'apprête à rendre la main"],
];

export const OBLIGATOIRES = ["*", "session.stop"];
export const CROCHETS_MIN = 3;
export const CROCHETS_MAX = 8;
export const DERNIERE_LIGNE = "Sinon la chaîne continue.";

/* Les tirets et apostrophes rendus par un modèle varient — cadratin,
   demi-cadratin, trait d'union ; apostrophe droite ou typographique. On
   normalise avant de chercher, jamais le texte rendu. */
const norm = (text) =>
  String(text || "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[—–]/g, "—")
    /* Un trait d'union entouré d'espaces au milieu d'une ligne est un
       tiret ; en tête de ligne c'est une puce, et on n'y touche pas. */
    .replace(/(?<=\S)[ \t]+-[ \t]+/g, " — ");

/* Un crochet, sur une ligne :
     N. sur <événement> [{filtre}] — <placement> : <décision>
   `sur` est la traduction de `on(...)`. Le filtre entre accolades est le
   matcher de l'architecture (§ 6.1) : optionnel, libre. */
const CROCHET =
  /^[ \t]*(\d+)\.[ \t]+sur[ \t]+(\*|[a-zà-ü0-9_-]+\.[a-zà-ü0-9_-]+)(?:[ \t]*\{[^}\n]*\})?[ \t]*—[ \t]*(avant|après|pendant|à la place|modifiant)[ \t]*:[ \t]*(\S.*)$/i;
const LIGNE_NUMEROTEE = /^[ \t]*\d+\.[ \t]+\S/;

/* Découpe le prompt en sections par titre. Rend `null` pour une section
   absente — c'est la faute, et elle se nomme. */
function sections(text) {
  const out = {};
  const lines = String(text || "").split("\n");
  let courante = null;
  for (const line of lines) {
    const titre = SECTIONS.find((s) => line.trim() === s);
    if (titre) {
      courante = titre;
      out[titre] = [];
    } else if (courante) {
      out[courante].push(line);
    }
  }
  return out;
}

/* Les crochets lus dans # CROCHETS : chaque ligne numérotée est un
   candidat ; ceux qui ne se lisent pas comme un crochet sont rendus à
   part, parce que c'est une faute distincte — un placement hors
   vocabulaire, un événement sans point. */
export function lireCrochets(text) {
  const bloc = sections(norm(text))[SECTIONS[2]] || [];
  const crochets = [];
  const illisibles = [];
  for (const line of bloc) {
    if (!LIGNE_NUMEROTEE.test(line)) continue;
    const m = CROCHET.exec(line);
    if (m) {
      crochets.push({
        numero: Number(m[1]),
        evenement: m[2].toLowerCase(),
        placement: m[3].toLowerCase(),
        decision: m[4].trim(),
      });
    } else {
      illisibles.push(line.trim());
    }
  }
  return { crochets, illisibles, intro: bloc.filter((l) => l.trim() && !LIGNE_NUMEROTEE.test(l)).join(" ") };
}

export function verifyPrompt(text, limit) {
  const cap = capLimit(limit);
  const brut = String(text || "");
  const fails = [];
  const n = countChars(brut);
  const over = n >= cap;
  if (over) fails.push("longueur : " + n + " caractères pour une limite de " + cap);

  const t = norm(brut);
  const parts = sections(t);
  const manquantes = SECTIONS.filter((s) => !(s in parts));
  if (manquantes.length) fails.push("sections absentes : " + manquantes.join(", "));
  else {
    const rangs = SECTIONS.map((s) => t.indexOf("\n" + s + "\n") >= 0 ? t.indexOf("\n" + s + "\n") : t.indexOf(s));
    if (!rangs.every((r, i) => i === 0 || r > rangs[i - 1])) fails.push("sections dans le désordre");
  }
  if (!t.trim().startsWith(SECTIONS[0])) fails.push(`ne commence pas par ${SECTIONS[0]}`);

  const retire = (parts[SECTIONS[1]] || []).filter((l) => /^[ \t]*[-•*]\s*\S/.test(l));
  if (SECTIONS[1] in parts && retire.length === 0)
    fails.push("rien n'est retiré — une interdiction en prose n'est pas un retrait");

  const { crochets, illisibles, intro } = lireCrochets(brut);
  if (SECTIONS[2] in parts) {
    if (!/enveloppe/i.test(intro + " " + (parts[SECTIONS[2]] || []).join(" ")))
      fails.push("l'ordre n'est pas posé — « le premier enveloppe tous les autres » manque");
    if (illisibles.length)
      fails.push(
        "crochet illisible (placement hors vocabulaire ou événement sans point) : " +
          illisibles[0].slice(0, 60)
      );
    if (crochets.length < CROCHETS_MIN) fails.push(`${crochets.length} crochet(s) — il en faut au moins ${CROCHETS_MIN}`);
    if (crochets.length > CROCHETS_MAX) fails.push(`${crochets.length} crochets — au plus ${CROCHETS_MAX}, chaque crochet en trop est une décision retirée à l'agent`);
    if (!crochets.every((c, i) => c.numero === i + 1)) fails.push("les crochets ne sont pas numérotés de 1 en 1 — l'ordre est l'autorité");
    for (const ev of OBLIGATOIRES) {
      if (!crochets.some((c) => c.evenement === ev))
        fails.push(
          ev === "*"
            ? "aucun crochet sur * — rien ne voit tout, rien n'est journalisé"
            : "aucun crochet sur session.stop — l'agent peut rendre la main avec du rouge"
        );
    }
    /* L'audit doit envelopper : un journal placé sous un refus ne voit
       pas le refus. C'est l'argument central de l'architecture (§ 5). */
    const etoile = crochets.findIndex((c) => c.evenement === "*");
    if (etoile > 0) fails.push("le crochet sur * n'est pas le premier — un journal sous un refus ne voit pas le refus");
    if (!crochets.some((c) => c.placement === "à la place"))
      fails.push("aucun crochet « à la place » — rien ne refuse, tout passe");
  }

  if (!t.trim().endsWith(DERNIERE_LIGNE))
    fails.push(`ne finit pas par « ${DERNIERE_LIGNE} »`);

  return { pass: fails.length === 0, fails, count: n, over, limit: cap, crochets: crochets.length };
}

/* ---------- l'exemple de référence ----------
   Montré au modèle comme cible de forme, et passé à son propre
   vérificateur par une assertion. */
export const PROMPT_REFERENCE = `# LE MONDE
Tu tiens le site et le blog d'un cabinet d'architectes. Ce que tu vois et ce que tu peux faire tient dans cette liste, et rien d'ambiant ne s'y ajoute : le dépôt site-cabinet sur GitHub (Astro, contenu en Markdown), la CLI Vercel authentifiée sur le projet de preview, une boîte mail de test qui reçoit vraiment les formulaires, une clé Anthropic de test dans .env, et un modèle pour rédiger. Ce que tu as fait, c'est exactement la liste des appels que tu as passés sur ce monde : un geste qui n'y figure pas n'a pas eu lieu.

# RETIRÉ
Absent, pas interdit — un crochet ne peut pas invoquer ce qui n'existe pas :
- deploy.run vers la production : tu déploies en preview, la mise en ligne se dépose en validation.
- secret.read hors des variables Vercel prévues : aucune clé ne passe par un fichier suivi.
- data.delete sur un billet publié : un billet se dépublie, il ne se supprime pas.
- mail.send vers une adresse réelle : seule la boîte de test reçoit.

# CROCHETS
Du plus haut au plus bas : le premier enveloppe tous les autres, et rien en dessous ne peut le contourner.
1. sur * — après : journalise l'événement, son origine et son résultat dans JOURNAL.md, refus compris.
2. sur git.push — avant : build et vérificateur au vert, sinon refuse et nomme l'assertion rouge.
3. sur fs.write {.env, *.key, fichiers suivis contenant un code} — à la place : refuse ; écris la variable manquante dans ETAT.md et continue.
4. sur mail.send — modifiant : réécris le destinataire vers la boîte de test, et note le destinataire d'origine dans le journal.
5. sur question.ask — à la place : tranche par l'hypothèse la plus raisonnable, écris-la dans DECISIONS.md, continue.
6. sur session.stop — avant : rejoue tous les parcours en preview ; s'il en reste un rouge, ne rends pas la main, ouvre le chantier.

# LE FOND
Sous les crochets, le travail lui-même — ce qui se passe quand rien n'intercepte. Tu publies un billet par semaine tiré des chantiers du cabinet, tu tiens les pages projets à jour, tu fais entrer les formulaires de contact dans la boîte, et tu rejoues chaque parcours en preview réelle : lecteur sur mobile, formulaire envoyé et reçu, billet publié puis dépublié. Chaque cassure est ton chantier suivant. Un chantier sans assertion n'est pas fini.

# SORTIE
Tous les parcours passent en preview, le journal montre chaque refus avec sa raison, et la mise en ligne est déposée en validation, seule. Sinon la chaîne continue.`;

export function buildMeta(limit) {
  const cap = capLimit(limit);
  const fenetre = targetWindow(cap);
  return (
    "Tu es un générateur de mandats d'agent selon la « pile de crochets », une technique transposée de " +
    "l'architecture Function Hooks de Claude Code (Anthropic, 2026) : chaque règle est un crochet accroché à " +
    "un événement, dans un ordre qui est une autorité. Le prompt que tu produis sera donné tel quel à un " +
    "agent autonome. Tu n'écris pas le travail : tu écris son monde, ses crochets et son fond.\n\n" +
    "CE QUI FAIT TOUT — LE RETRAIT ET L'ORDRE. Une interdiction en prose (« ne déploie jamais en prod ») tient " +
    "la plupart du temps et lâche au pire moment. Une capacité RETIRÉE du monde ne peut pas être invoquée. Et " +
    "un crochet placé en haut enveloppe tout ce qui est dessous : rien en dessous ne peut le contourner. " +
    "L'audit et les refus se mettent en haut, les défauts en bas.\n\n" +
    "STRUCTURE OBLIGATOIRE — cinq sections dans cet ordre, titres exacts '# EN MAJUSCULES', en français, agent tutoyé :\n" +
    `1. ${SECTIONS[0]} — ce que l'agent voit et peut faire, en liste finie : dépôt, outils, comptes, boîtes, clés de test, modèle. ` +
    "Termine par la règle : ce qu'il a fait, c'est exactement les appels qu'il a passés ; rien d'ambiant.\n" +
    `2. ${SECTIONS[1]} — les capacités ABSENTES, une par ligne commençant par « - », chacune sous la forme « événement.verbe + portée : ce qu'on fait à la place ». ` +
    "Absent, pas interdit. Au moins une. Ce sont les actions engageantes du domaine : prod, argent, envois réels, suppression, secrets.\n" +
    `3. ${SECTIONS[2]} — une phrase d'ouverture qui pose l'ordre (« le premier enveloppe tous les autres »), puis ${CROCHETS_MIN} à ${CROCHETS_MAX} crochets numérotés de 1 en 1, ` +
    "UN par ligne, à cette forme exacte : « N. sur <événement> {filtre facultatif} — <placement> : <décision> ».\n" +
    "   Placements — vocabulaire FERMÉ : " +
    PLACEMENTS.map(([p, quoi]) => `« ${p} » (${quoi})`).join(" ; ") +
    ".\n   Événements — forme nom.verbe, libres, dont : " +
    EVENEMENTS.map(([e, quoi]) => `${e} (${quoi})`).join(" ; ") +
    ".\n   Deux crochets sont obligatoires : « sur * », EN PREMIER, qui journalise tout, refus compris ; et « sur session.stop — avant », " +
    "qui rejoue la vérification et refuse de rendre la main s'il reste du rouge. Au moins un crochet « à la place » qui refuse quelque chose. " +
    "Un crochet « modifiant » dit ce qu'il a changé. Une décision est un résultat, jamais un silence.\n" +
    `4. ${SECTIONS[3]} — le travail lui-même, ce qui se passe quand aucun crochet n'intercepte : le but, les événements réels du métier ` +
    "qui déclenchent le travail, et la règle « chaque cassure est ton chantier suivant ». Jamais une liste de tâches.\n" +
    `5. ${SECTIONS[4]} — la condition de fin, vérifiable, verrouillée des deux bords, et la dernière ligne exacte : « ${DERNIERE_LIGNE} »\n\n` +
    "RÈGLES DE REMPLISSAGE : tout ce qui est retiré l'est parce que c'est engageant dans CE domaine, pas par réflexe. " +
    "Chaque crochet gouverne UN geste précis ; un crochet qui dit « fais attention » n'en est pas un. " +
    "Rien d'autre n'entre : ni architecture, ni pile technique imposée, ni consigne de comportement (« ne t'arrête pas », « journalise en détail ») — " +
    "le crochet sur * journalise déjà, et chaque instruction en trop est une décision retirée à l'agent.\n\n" +
    `LONGUEUR : moins de ${cap} caractères, vise ${fenetre.lo} à ${fenetre.hi}. Phrases denses, un crochet par ligne.\n\n` +
    "EXEMPLE DE RÉFÉRENCE (forme, densité et voix à reproduire, adaptés au nouveau but) :\n---\n" +
    PROMPT_REFERENCE +
    "\n---\n"
  );
}

/* ---------- étape 1 ----------
   Même forme que celle de Boris — des questions, trois au plus, et
   seulement si la réponse change le prompt. Ici ce qui est matériel,
   c'est le MONDE et le RETRAIT : ce que l'agent a sous la main, et ce
   qui, dans ce domaine, engage vraiment. */
export function etape1Instruction() {
  return (
    "ÉTAPE 1 — Avant d'écrire le prompt, détermine s'il manque une information qui changerait MATÉRIELLEMENT " +
    "le monde de l'agent (ce qu'il a sous la main), ce qui doit lui être retiré (ce qui engage dans ce domaine), " +
    "ou la sortie. Tout ce qui peut être tranché par une hypothèse raisonnable doit l'être, sans question. " +
    'Réponds UNIQUEMENT avec ce JSON, sans autre texte : {"questions":["..."]} — 3 questions maximum, tableau vide si rien de matériel ne manque.'
  );
}

export function etape2Instruction({ limit, questions, answers }) {
  const cap = capLimit(limit);
  const fenetre = targetWindow(cap);
  let instruction =
    "ÉTAPE 2 — Génère MAINTENANT le prompt final. Texte brut uniquement : pas de backticks, pas de commentaire, pas de préambule. " +
    `Les cinq sections dans l'ordre (${SECTIONS.join(", ")}), les crochets un par ligne à la forme exacte, ` +
    `« sur * » en premier, « sur session.stop » présent, dernière ligne « ${DERNIERE_LIGNE} ». ` +
    `Moins de ${cap} caractères, vise ${fenetre.lo} à ${fenetre.hi}.`;

  if (answers) {
    const lines = (questions || [])
      .map(
        (q, i) =>
          `Q${i + 1} : ${q}\nR : ` +
          (answers[i] || "(sans réponse — tranche par hypothèse raisonnable et signale-la dans LE FOND)")
      )
      .join("\n");
    instruction = `RÉPONSES :\n${lines}\n\n${instruction}`;
  }
  return instruction;
}

/* La réparation serre comme chez Boris — même mécanique mesurée, même
   raison : un modèle estime sa longueur, il ne la compte pas. Mais
   elle nomme CINQ sections et la forme des crochets, pas huit sections. */
const TARGET_RATIO = [0.85, 0.75, 0.65, 0.55];

export function repairInstruction(check, limit, attempt) {
  const cap = capLimit(limit);
  const ratio = TARGET_RATIO[Math.min(Math.max(attempt - 2, 0), TARGET_RATIO.length - 1)];
  const target = Math.max(LIMITE_MIN, Math.round(cap * ratio));
  const excess = check.count - cap;
  const cut = Math.max(0, check.count - target);
  const longueur =
    excess > 0
      ? `Tu es à ${check.count} caractères pour une limite de ${cap} : ${excess} de trop. ` +
        `Récris en RETIRANT environ ${cut} caractères, pour atterrir vers ${target} — coupe dans LE MONDE et LE FOND, jamais dans les crochets. `
      : "";
  return (
    `ASSERTION ÉCHOUÉE : ${check.fails.join(" ; ")}. ` +
    longueur +
    `Régénère le prompt COMPLET, texte brut uniquement : les cinq sections dans l'ordre (${SECTIONS.join(", ")}), ` +
    "chaque crochet sur UNE ligne à la forme « N. sur <événement> — <placement> : <décision> » avec un placement du vocabulaire " +
    `(${PLACEMENTS.map(([p]) => p).join(", ")}), « sur * » en premier, « sur session.stop — avant » présent, au moins un « à la place », ` +
    `et la dernière ligne exacte « ${DERNIERE_LIGNE} ».`
  );
}

/* ---------- le juge ----------
   Six critères, aucune clé commune avec les deux autres grilles — le
   juge reconstruit PAR CLÉ, et un homonyme ferait recomposer une note
   de crochets à moitié contre une autre grille. Une assertion le tient. */
export const CRITERES = [
  { cle: "monde", nom: "Le monde", quoi: "une liste FINIE de ce que l'agent voit et peut faire — dépôt, outils, comptes, clés de test — et la règle « rien d'ambiant » ; jamais un décor vague" },
  { cle: "retrait", nom: "Le retrait", quoi: "ce qui engage dans CE domaine (prod, argent, envois réels, suppression, secrets) est ABSENT du monde, sous la forme événement.verbe + portée + ce qu'on fait à la place ; une interdiction en prose ne compte pas" },
  { cle: "ordre", nom: "L'ordre", quoi: "l'emboîtement est posé, « sur * » est le premier crochet, les refus sont au-dessus des défauts, la numérotation est continue ; un journal placé sous un refus ne voit pas le refus" },
  { cle: "crochets", nom: "Les crochets", quoi: "chaque crochet gouverne UN geste précis avec un placement du vocabulaire et une décision qui est un résultat ; un « modifiant » dit ce qu'il a changé ; « session.stop — avant » rejoue la vérification et refuse de rendre la main s'il reste du rouge" },
  { cle: "fond", nom: "Le fond", quoi: "le travail lui-même dérive d'événements réels du métier et de « chaque cassure est ton chantier suivant » ; jamais une liste de tâches ni une architecture imposée" },
  { cle: "fermeture", nom: "La fermeture", quoi: `# SORTIE vérifiable et verrouillée des deux bords, dernière ligne « ${DERNIERE_LIGNE} » ; rien de comportemental ailleurs (« ne t'arrête pas », « journalise en détail ») — le crochet sur * le fait déjà` },
];

export function auditInstruction() {
  const grille = CRITERES.map((c, i) => `${i + 1}. ${c.cle} — ${c.nom} : ${c.quoi}`).join("\n");
  return (
    "ÉTAPE 3 — Juge le prompt ci-dessus contre la technique de la pile de crochets, et NOTE-LE.\n\n" +
    "GRILLE — six critères, chacun sur 10 :\n" +
    grille +
    "\n\nLa note globale n'est PAS la moyenne : elle ne dépasse pas de plus de 2 points le plus faible " +
    "des critères. Un retrait écrit en prose (« ne fais pas ») au lieu d'une absence est la faute qui tue la " +
    "technique — la règle tiendra jusqu'au jour où elle compte — donc un prompt qui interdit au lieu de retirer " +
    "n'est pas un bon prompt, même si tout le reste est parfait. Note 8 à 10 seulement ce qu'on peut lancer tel quel.\n\n" +
    'Réponds UNIQUEMENT avec ce JSON, sans autre texte :\n' +
    '{"note":7.5,"verdict":"une phrase","criteres":[{"cle":"monde","note":8,"mot":"six mots"}],' +
    '"failles":["..."],"hypotheses":["..."]}\n' +
    "Un objet par critère, les six, dans l'ordre de la grille ; `mot` tient en une demi-ligne et dit CE QUI " +
    "manque, pas que c'est bien. Maximum 3 failles réelles (tableau vide si aucune), maximum 3 hypothèses " +
    "implicites que l'utilisateur doit connaître. Phrases courtes."
  );
}

export function auditApplyInstruction(corrections, limit) {
  const cap = capLimit(limit);
  const fenetre = targetWindow(cap);
  return (
    "ÉTAPE 4 — Applique chacune de ces corrections au prompt ci-dessus :\n" +
    corrections +
    "\nRégénère le prompt COMPLET corrigé, texte brut uniquement, sans backticks ni commentaire, " +
    `les cinq sections dans l'ordre, les crochets un par ligne à la forme exacte, « sur * » en premier, ` +
    `dernière ligne « ${DERNIERE_LIGNE} », moins de ${cap} caractères, vise ${fenetre.lo} à ${fenetre.hi}.`
  );
}

export function correctionInstruction(demand, limit) {
  const cap = capLimit(limit);
  const fenetre = targetWindow(cap);
  return (
    `CORRECTION DEMANDÉE :\n${String(demand).trim()}\n\n` +
    "Applique-la au prompt ci-dessus et régénère-le COMPLET. Texte brut uniquement : pas de backticks, " +
    "pas de commentaire, pas de préambule, aucune phrase qui parle de la correction. Ne change QUE ce qui " +
    "est demandé ; garde le reste mot pour mot tant que la longueur le permet. Les cinq sections dans l'ordre, " +
    `les crochets un par ligne à la forme exacte, « sur * » en premier, dernière ligne « ${DERNIERE_LIGNE} », ` +
    `moins de ${cap} caractères, vise ${fenetre.lo} à ${fenetre.hi}.`
  );
}

/* Le fil reconstruit : premier tour commun aux quatre techniques (idée
   enveloppée, bloc en cache — harnais.js). */
export function baseConvoFor({ idea, prompt, limit, id }) {
  return conversationDe({ meta: buildMeta(limit), etiquette: "IDÉE", idee: idea, id, prompt });
}
