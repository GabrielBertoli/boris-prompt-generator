/* ================================================================
   LA BOUCLE DU GANTELET — la seconde technique de l'atelier.

   Technique de Matt Shumer (le « gauntlet loop », écrit en construisant
   Claude of Duty), empaquetée en skill par Jay E / RoboNuggets —
   github.com/robonuggets/gauntlet-loop, CC BY 4.0. Reprise ici en
   français : l'attribution est une obligation de la licence, pas une
   politesse, et elle vit AUSSI dans l'aide, où l'utilisateur la lit.

   Ce que cette technique change par rapport à la méthode Boris :
   Boris écrit le mandat d'un agent qui fait tourner un produit et dérive
   son travail de là où la chaîne casse — prompt long, huit sections, un
   oracle interne. Le gantelet écrit le mandat d'un agent qui vise une
   RÉFÉRENCE RÉELLE et recommence jusqu'à la battre — prompt court, sans
   la moindre section, dont toute la force tient dans une seule chose :
   la barre. L'oracle n'est pas dans le prompt, il est dehors, et c'est
   ce qui rend la comparaison indiscutable.

   Les deux ne sont donc pas deux styles du même objet : elles répondent
   à deux questions différentes, et rien de ce qui est vrai de l'une
   (huit sections, plafond à 3950, grille du juge) ne l'est de l'autre.
   D'où ce fichier séparé plutôt qu'un drapeau dans `meta.js`.
   ================================================================ */

import { countChars } from "./meta.js";

export { countChars };

/* ---------- la mesure ----------

   Le skill d'origine dit « around 120 to 180 words ». Le français est
   plus long d'environ 15 % à contenu égal : la fenêtre visée est donc
   140–190 mots, et la fourchette acceptée 110–210. Le compte se fait en
   MOTS, parce que c'est la règle de la technique — mais le plafond dur
   reste en caractères, comme pour Boris, parce que c'est ce que toute la
   plomberie de l'atelier mesure et enregistre déjà. Les deux vivent ici,
   dans le vérificateur, et nulle part ailleurs. */

export const HARD_LIMIT = 1600;
export const MOTS_MIN = 110;
export const MOTS_MAX = 210;
export const VISEE = { lo: 140, hi: 190 };
export const LIMITE_DEFAUT = 1300;
export const LIMITE_MIN = 800;

export const capLimit = (limit) => {
  const n = Number(limit);
  return Math.min(HARD_LIMIT, Math.max(LIMITE_MIN, Number.isFinite(n) ? Math.round(n) : LIMITE_DEFAUT));
};

export const countMots = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

/* Les modèles rendent tantôt « l'aveugle » tantôt « l’aveugle » : une
   apostrophe typographique fait échouer une assertion qui a pourtant
   raison sur le fond. On normalise avant de chercher, jamais le texte
   rendu — ce qu'on livre garde l'apostrophe que le modèle a écrite. */
const norm = (text) => String(text || "").replace(/[‘’ʼ]/g, "'");

/* Un nombre de tours fixé est la faute qui tue la technique : la boucle
   sort quand le nôtre gagne, ou quand l'humain arrête. Jamais après N. */
const TOURS =
  /\b(\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(tours?|rounds?|it[ée]rations?|passes?|cycles?|manches?)\b/i;

/* Titres et puces : le skill d'origine en fait un test de longueur
   déguisé — « si le prompt a besoin d'un titre pour rester lisible, il
   est trop long ». On le prend au mot, c'est une assertion. */
const STRUCTURE = /^[ \t]*(#{1,6}\s|[-*•]\s|\d+[.)]\s)/m;

export function verifyPrompt(text, limit) {
  const cap = capLimit(limit);
  const brut = String(text || "");
  const t = norm(brut);
  const fails = [];
  const n = countChars(brut);
  const mots = countMots(brut);
  const over = n >= cap;

  if (over) fails.push("longueur : " + n + " caractères pour une limite de " + cap);
  /* Ces deux-là commencent par « longueur » comme celle du plafond, et
     ce n'est pas cosmétique : c'est à ce préfixe que le choix de la
     meilleure tentative reconnaît une faute de longueur — réparable en
     redemandant — d'une faute de fond, qui ne l'est pas. */
  if (mots < MOTS_MIN) fails.push(`longueur : ${mots} mots — trop court (vise ${VISEE.lo} à ${VISEE.hi})`);
  else if (mots > MOTS_MAX) fails.push(`longueur : ${mots} mots — trop long (vise ${VISEE.lo} à ${VISEE.hi})`);
  if (STRUCTURE.test(brut)) fails.push("titres ou puces : le prompt est fait de phrases pleines");
  if (!/\bbarres?\b/i.test(t)) fails.push("la barre n'est pas posée — c'est toute la technique");
  if (!/a l'aveugle|à l'aveugle/i.test(t)) fails.push("la comparaison à l'aveugle est absente");
  if (!/critique/i.test(t)) fails.push("aucun critique séparé du constructeur");
  if (!/contexte neuf/i.test(t)) fails.push("le critique n'a pas de contexte neuf");
  if (!/\/loop\b/.test(t)) fails.push("« /loop » absent — la boucle n'est pas armée");
  if (!/ultracode/i.test(t)) fails.push("« ultracode » absent — pas de sous-agents en parallèle");
  if (TOURS.test(t)) fails.push("un nombre de tours est fixé — on sort en gagnant, pas en comptant");

  /* Même forme que le vérificateur Boris — `pass`, `fails`, `count`,
     `over`, `limit` — parce que tout l'atelier lit CE contrat : le
     marbre, le fil, la casse, le journal des tentatives. `mots` s'y
     ajoute pour l'affichage, il n'est jamais requis. */
  return { pass: fails.length === 0, fails, count: n, over, limit: cap, mots };
}

/* ---------- l'exemple de référence ----------
   Le cas « visuel » du skill d'origine, transposé en français. Il sert
   deux fois : montré au modèle comme cible de style, et passé à son
   propre vérificateur par une assertion — un exemple qui ne passerait
   pas le test qu'il illustre apprendrait la faute au modèle. */
export const PROMPT_REFERENCE = `Construis une page d'accueil pour une marque de course à pied. Sportive, vert et sombre, énergique, pour un public jeune. Elle doit être interactive et reconnaissable entre mille.

La barre, c'est la page de campagne running actuelle de Nike. Capture-la en grand écran et en mobile, et compare-toi à ces captures, jamais à une description d'elles.

Découpe en les plus petits morceaux qu'on peut juger séparément — l'accroche, le mouvement, la typographie, la couleur, les images, le mobile. Sur chacun, lance un constructeur et, à côté, un critique au contexte neuf. Le critique ouvre la vraie page, met notre capture à côté de celle de Nike à l'aveugle, étiquettes retirées, dit laquelle est la meilleure et nomme le seul plus gros manque qui reste. Puis il rend la main au constructeur.

Le critique est dur. La louange ne sert à rien. Tant que la nôtre ne gagne pas, il continue.

/loop sur chaque morceau jusqu'à ce que le critique choisisse la nôtre à l'aveugle. Ne t'arrête pas avant.

Tiens une page d'avancement vivante que je puisse regarder pendant que ça travaille.

Déploie des sous-agents et ultracode.`;

/* ---------- ce qu'est une barre ----------
   Les trois tests du skill d'origine, mot pour mot dans leur esprit.
   Ils sont ici en données parce que l'écran des barres les affiche et
   que le méta-prompt les récite : une seule source. */
export const TESTS_BARRE = [
  ["Nommée", "Une chose précise, pas une catégorie. « La page tarifs de Stripe » est une barre ; « les beaux sites SaaS » n'en est pas une."],
  ["Récupérable", "Le critique peut vraiment l'obtenir : capturer la page, lire l'article, exécuter le binaire, ouvrir le dépôt. S'il ne peut pas l'atteindre, il invente la comparaison et approuve tout."],
  ["Comparable", "Les deux peuvent tenir côte à côte et un juge peut en désigner une. Si tu n'imagines pas le A/B, ce n'est pas une barre."],
];

export function buildMeta(limit) {
  const cap = capLimit(limit);
  return (
    "Tu es un générateur de prompts « boucle du gantelet » (gauntlet loop, technique de Matt Shumer). " +
    "Le prompt que tu produis sera collé tel quel dans une session d'agent neuve. Tu n'écris pas le travail : " +
    "tu écris le prompt qui fait qu'un autre agent s'acharne jusqu'à battre une référence réelle.\n\n" +
    "CE QUI FAIT TOUT — LA BARRE. Le reste n'est que de l'échafaudage : la boucle ne produit de la qualité que si " +
    "la chose à laquelle elle se compare est réelle. Une barre passe trois tests :\n" +
    TESTS_BARRE.map(([nom, quoi]) => `- ${nom} : ${quoi}`).join("\n") +
    "\n\nSi le but a une moitié MESURABLE (temps de chargement, coût en jetons, score de benchmark, nombre de mots, " +
    "taux de réussite), nomme-la à côté de la référence : le goût plus un chiffre bat le goût seul.\n\n" +
    "FORME DU PROMPT — sept mouvements, dans cet ordre, en phrases pleines et SANS titre ni puce :\n" +
    "1. Ce qu'on construit, en une ou deux phrases, avec ce qui compte pour le demandeur.\n" +
    "2. « La barre, c'est … » — la référence concrète, plus l'ordre d'aller chercher la vraie chose et de s'y comparer directement, jamais à une description d'elle.\n" +
    "3. Le découpage en plus petits morceaux jugeables séparément, et sur chacun un constructeur plus un critique SÉPARÉ au contexte neuf ; le critique ouvre la sortie réelle, la met à côté de la barre à l'aveugle, étiquettes retirées, dit laquelle est la meilleure et nomme le seul plus gros manque restant, puis rend la main.\n" +
    "4. « Le critique est dur. La louange ne sert à rien. » et la reprise tant que le nôtre ne gagne pas.\n" +
    "5. « /loop sur chaque morceau jusqu'à ce que le critique choisisse le nôtre à l'aveugle. Ne t'arrête pas avant. »\n" +
    "6. Une page d'avancement vivante, à regarder pendant que ça travaille.\n" +
    "7. « Déploie des sous-agents et ultracode. » — dernière ligne, toujours.\n\n" +
    "RÈGLES DE REMPLISSAGE : la barre entre en dur, concrète et récupérable (URL, nom de produit, dépôt, titre). " +
    "Un plafond de budget ou de coût UNIQUEMENT si le demandeur en a nommé un — aucun par défaut. " +
    "Des noms d'outils uniquement si le but l'exige (génération d'image ou de vidéo, navigateur, cible de déploiement). " +
    "Rien d'autre n'entre : ni architecture, ni arborescence, ni découpage imposé, ni choix de pile, ni nombre de tours. " +
    "L'agent tranche ces choses-là, et il les tranche mieux qu'une spécification écrite avant le travail. " +
    "Chaque instruction en trop est une décision retirée à l'agent.\n\n" +
    "LANGUE ET VOIX : français, agent tutoyé, phrases simples. Aucune puce, aucun titre à l'intérieur du prompt. " +
    "Ça doit se lire comme quelqu'un qui dit à un agent à quoi ressemble le parfait et refuse moins.\n\n" +
    `LONGUEUR : ${VISEE.lo} à ${VISEE.hi} mots, et moins de ${cap} caractères. ` +
    "Un prompt qui aurait besoin d'un titre pour rester lisible est trop long.\n\n" +
    "EXEMPLE DE RÉFÉRENCE (forme, densité et voix à reproduire, adaptés au nouveau but) :\n---\n" +
    PROMPT_REFERENCE +
    "\n---\n"
  );
}

/* ---------- étape 1 : la barre ----------
   L'équivalent des questions de la méthode Boris, et le même contrat :
   si le demandeur a déjà nommé sa référence, on ne lui pose rien et on
   génère. Sinon deux ou trois candidates, une ligne chacune, et on
   s'arrête — le skill d'origine insiste : ne pas écrire le prompt avant
   d'avoir le choix. */
export function etape1Instruction() {
  return (
    "ÉTAPE 1 — Ne rédige PAS encore le prompt. Détermine la barre.\n" +
    "Si l'idée nomme déjà une référence précise et récupérable, reprends-la telle quelle. " +
    "Sinon, propose DEUX ou TROIS barres candidates, une ligne chacune, chacune passant les trois tests " +
    "(nommée, récupérable, comparable). Préfère la plus dure que l'agent puisse réellement atteindre : " +
    "une barre trop facile fait sortir la boucle au premier tour.\n" +
    'Réponds UNIQUEMENT avec ce JSON, sans autre texte : ' +
    '{"barreImposee":"…","barres":[{"titre":"…","pourquoi":"…"}],"mesure":"…"} — ' +
    "`barreImposee` seulement si l'idée en nommait une (sinon chaîne vide), `barres` vide dans ce cas ; " +
    "`titre` est la référence elle-même (nom exact, URL ou dépôt), `pourquoi` dit en une demi-ligne ce qu'elle " +
    "met à l'épreuve ; `mesure` est la moitié mesurable s'il y en a une, chaîne vide sinon."
  );
}

export function etape2Instruction({ barre, mesure, limit }) {
  const cap = capLimit(limit);
  return (
    "ÉTAPE 2 — Écris MAINTENANT le prompt final. Texte brut uniquement : pas de backticks, pas de préambule, " +
    "pas de commentaire après.\n" +
    `LA BARRE RETENUE : ${String(barre || "").trim()}\n` +
    (String(mesure || "").trim() ? `MOITIÉ MESURABLE : ${String(mesure).trim()}\n` : "") +
    `Les sept mouvements dans l'ordre, en phrases pleines, sans titre ni puce, ${VISEE.lo} à ${VISEE.hi} mots, ` +
    `moins de ${cap} caractères. La dernière ligne est « Déploie des sous-agents et ultracode. »`
  );
}

export function repairInstruction(check, limit, attempt) {
  const cap = capLimit(limit);
  /* Chaque tour resserre la cible, comme chez Boris et pour la même
     raison mesurée : un modèle n'a pas conscience de sa longueur, il
     l'estime — une cible fixe le fait converger par asymptote sans
     jamais franchir la barre. Ici la cible est en MOTS, l'unité dans
     laquelle la faute est commise. */
  const cibles = [VISEE.hi, 175, 160, 145];
  const cible = cibles[Math.min(Math.max(attempt - 2, 0), cibles.length - 1)];
  const longueur =
    check.mots > MOTS_MAX || check.over
      ? `Tu es à ${check.mots} mots et ${check.count} caractères. Récris en visant ${cible} mots : ` +
        "coupe les redites et les adjectifs, garde les sept mouvements entiers. "
      : check.mots < MOTS_MIN
        ? `Tu es à ${check.mots} mots : il manque des mouvements. Vise ${cible} mots. `
        : "";

  return (
    `ASSERTION ÉCHOUÉE : ${check.fails.join(" ; ")}. ` +
    longueur +
    "Régénère le prompt COMPLET, texte brut uniquement, les sept mouvements dans l'ordre, " +
    "en phrases pleines, sans titre ni puce, et termine par « Déploie des sous-agents et ultracode. » " +
    `Moins de ${cap} caractères.`
  );
}

/* ---------- le juge ----------
   Six critères, comme pour Boris, et la même règle qui empêche la
   moyenne de masquer un trou. Aucune clé n'est commune avec la grille de
   Boris, et c'est délibéré : le juge reconstruit ses critères PAR CLÉ, et
   deux clés homonymes dans deux grilles différentes laisseraient une note
   de gantelet se recomposer à moitié contre la grille de Boris — deux
   lignes justes, quatre vides, et rien pour le dire. Une assertion tient
   cette disjonction. Mais ce sont les six fautes que le skill
   d'origine nomme comme mortelles — une barre vague, le constructeur
   qui se juge lui-même, un critique mou, un nombre de tours, la
   sur-spécification — plus la comparabilité, qui les précède toutes. */
export const CRITERES = [
  { cle: "barre", nom: "La barre", quoi: "une référence NOMMÉE et précise — une page, un dépôt, un article, un produit identifié ; jamais une catégorie ni un superlatif (« primé », « best-in-class »)" },
  { cle: "recuperable", nom: "Récupérable", quoi: "le critique peut réellement l'obtenir et l'ordre lui en est donné : capturer, lire, exécuter, ouvrir — et se comparer à la vraie chose, jamais à une description d'elle" },
  { cle: "paire", nom: "Constructeur et critique", quoi: "deux agents distincts par morceau, le critique au CONTEXTE NEUF : il n'a pas construit et ne sait pas combien ça a coûté d'effort" },
  { cle: "aveugle", nom: "Comparaison à l'aveugle", quoi: "étiquettes retirées, choix binaire (laquelle est la meilleure) et un seul plus gros manque nommé ; jamais une note sur 10, qui dérive vers le haut à chaque tour" },
  { cle: "victoire", nom: "Sortie par la victoire", quoi: "on s'arrête quand le nôtre gagne à l'aveugle, ou quand l'humain arrête le run ; aucun nombre de tours, aucune date, aucun « quand c'est bien »" },
  { cle: "sobriete", nom: "Économie", quoi: `${VISEE.lo} à ${VISEE.hi} mots, phrases pleines, aucun titre ni puce ; ni architecture, ni arborescence, ni pile imposée — chaque instruction en trop est une décision retirée à l'agent` },
];

export function auditInstruction() {
  const grille = CRITERES.map((c, i) => `${i + 1}. ${c.cle} — ${c.nom} : ${c.quoi}`).join("\n");
  return (
    "ÉTAPE 3 — Juge le prompt ci-dessus contre la technique de la boucle du gantelet, et NOTE-LE.\n\n" +
    "GRILLE — six critères, chacun sur 10 :\n" +
    grille +
    "\n\nLa note globale n'est PAS la moyenne : elle ne dépasse pas de plus de 2 points le plus faible " +
    "des critères. Une barre vague est la faute qui tue la boucle — le critique invente alors la " +
    "comparaison et approuve tout — donc un prompt dont la barre est floue n'est pas un bon prompt, " +
    "même si tout le reste est parfait. Note 8 à 10 seulement ce qu'on peut coller tel quel.\n\n" +
    'Réponds UNIQUEMENT avec ce JSON, sans autre texte :\n' +
    '{"note":7.5,"verdict":"une phrase","criteres":[{"cle":"barre","note":8,"mot":"six mots"}],' +
    '"failles":["..."],"hypotheses":["..."]}\n' +
    "Un objet par critère, les six, dans l'ordre de la grille ; `mot` tient en une demi-ligne et dit CE QUI " +
    "manque, pas que c'est bien. Maximum 3 failles réelles (tableau vide si aucune), maximum 3 hypothèses " +
    "implicites que l'utilisateur doit connaître. Phrases courtes."
  );
}

export function auditApplyInstruction(corrections, limit) {
  const cap = capLimit(limit);
  return (
    "ÉTAPE 4 — Applique chacune de ces corrections au prompt ci-dessus :\n" +
    corrections +
    "\nRégénère le prompt COMPLET corrigé, texte brut uniquement, sans backticks ni commentaire, " +
    `les sept mouvements dans l'ordre, en phrases pleines, ${VISEE.lo} à ${VISEE.hi} mots, ` +
    `moins de ${cap} caractères, dernière ligne « Déploie des sous-agents et ultracode. »`
  );
}

export function correctionInstruction(demand, limit) {
  const cap = capLimit(limit);
  return (
    `CORRECTION DEMANDÉE :\n${String(demand).trim()}\n\n` +
    "Applique-la au prompt ci-dessus et régénère-le COMPLET. Texte brut uniquement : pas de backticks, " +
    "pas de commentaire, pas de préambule, aucune phrase qui parle de la correction. Ne change QUE ce qui " +
    "est demandé ; garde le reste mot pour mot. Les sept mouvements dans l'ordre, en phrases pleines, " +
    `${VISEE.lo} à ${VISEE.hi} mots, moins de ${cap} caractères, dernière ligne ` +
    "« Déploie des sous-agents et ultracode. »"
  );
}

export function baseConvoFor({ idea, prompt, limit }) {
  const convo = [
    {
      role: "user",
      content:
        buildMeta(limit) +
        "\n\nBUT :\n" +
        (String(idea || "").trim() || "(but non conservé — pars du prompt ci-dessous)"),
    },
  ];
  if (prompt) convo.push({ role: "assistant", content: prompt });
  return convo;
}
