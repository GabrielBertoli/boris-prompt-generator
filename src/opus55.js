/* ================================================================
   LA MÉTHODE OPUS 5.5 — la quatrième technique de l'atelier.

   Tirée du guide d'Anthropic « Getting the most out of Opus 5.5 in
   Claude and Claude Code » (Addy Osmani, claude.dev, 2026-09-22). Ce
   n'est pas une méthode inventée : c'est ce que le guide dit d'écrire à
   ce modèle-là, mis en forme de mandat. Ce qui en est retenu, et
   pourquoi le modèle le demande :

   - La tâche ENTIÈRE en un message, avec sa ligne d'arrivée (« Fini veut
     dire : les tests passent »). Opus 5.5 tient mieux qu'Opus 5 un long
     travail en plusieurs étapes ; une arrivée claire lui dit quand il a
     fini.
   - Les arrêts NOMMÉS. C'est le comportement nouveau : sur un long run,
     5.5 s'arrête parfois pour rendre compte — un résumé qui nomme
     l'étape suivante sans la faire, une offre de continuer, des choix
     qui ne bloquent rien. Il suit une consigne qui nomme ces arrêts.
   - Aucun « réfléchis bien » : il pense avant chaque réponse et dose
     lui-même. Aucune demande de montrer son raisonnement : c'est une
     catégorie de signalement, la réponse peut basculer sur un modèle
     plus ancien.
   - Des clauses PAR TYPE de tâche, et seulement celles qui s'appliquent :
     liste de tâches dans un fichier pour un run long, sous-agents dont
     on vérifie les preuves pour un audit, styles exclus NOMMÉMENT pour du
     design (« évite le générique » échange un défaut contre un autre),
     « marque ce que tu n'as pas pu confirmer » pour une recherche, « ce
     pour quoi tu bloquerais la fusion » pour une revue.
   - Un compte rendu dont la première partie est ce qui t'attend.

   Ce que cette technique change par rapport aux trois autres : Boris
   confie un produit qui tourne sans fin, le gantelet une qualité à
   battre, les crochets un périmètre à garder. Celle-ci confie une TÂCHE
   BORNÉE, livrée en un run — une migration, un audit, une page, un
   document — et sa preuve est dans la LIGNE D'ARRIVÉE.

   Et elle contredit sciemment une règle des deux méthodes à sections :
   Boris et les crochets interdisent « ne t'arrête pas » comme correction
   de comportement devenue native. Pour 5.5, le guide dit l'inverse sur
   ce seul point — nommer les arrêts est la consigne qui compte le plus.
   C'est pourquoi la règle d'arrêt est un mouvement obligatoire ici, et
   pourquoi aucune règle de ce fichier n'est partagée avec `meta.js`.
   ================================================================ */

import { countChars } from "./meta.js";
import { countMots } from "./gauntlet.js";

export { countChars, countMots };

/* ---------- la mesure ----------
   En MOTS, comme le gantelet, et pour la leçon payée le 2026-08-26 : un
   modèle estime sa longueur en mots, et un plafond en caractères monté
   seul ne change rien au prompt produit. Les exemples du guide tiennent
   en trois ou quatre lignes ; le mandat entier — tâche, arrivée, arrêts,
   clauses, compte rendu — en demande cinq fois plus, pas davantage.
   Au rapport mesuré de ~6 caractères par mot, le haut de la fourchette
   (300 mots ≈ 1 800 car.) reste sous le réglage par défaut : c'est la
   fenêtre de mots qui mord la première, jamais le plafond. */
export const HARD_LIMIT = 2600;
/* Plancher abaissé le 2026-09-23 (150 → 120 visés, 110 → 90 acceptés) :
   le juge du banc a noté qu'un renommage, correctement écrit, tombe vers
   130 mots — un plancher plus haut poussait les tâches simples au
   remplissage, exactement ce que le guide dit d'éviter. */
export const MOTS_MIN = 90;
export const MOTS_MAX = 300;
export const VISEE = { lo: 120, hi: 230 };
export const LIMITE_DEFAUT = 2200;
/* Sous 1600 caractères, le haut de la visée (230 mots ≈ 1 430 car.) ne
   tiendrait plus avec sa marge : chaque génération échouerait sur la
   longueur sans qu'un écran dise pourquoi. */
export const LIMITE_MIN = 1600;

export const capLimit = (limit) => {
  const n = Number(limit);
  return Math.min(HARD_LIMIT, Math.max(LIMITE_MIN, Number.isFinite(n) ? Math.round(n) : LIMITE_DEFAUT));
};

/* ---------- les phrases qui portent la méthode ----------
   Une seule source : le méta-prompt les impose, le vérificateur les
   cherche, l'aide les cite. */
export const FINI = "Fini veut dire :";
export const CONTINUE =
  "Quand une étape n'a pas besoin de moi, continue, et mets tes points d'avancement dans le même message que ton action suivante.";
export const ARRETE = "Arrête-toi et demande-moi seulement si";
/* La phrase d'arrêt ENTIÈRE, fixe jusqu'aux deux-points : trois bancs de
   suite ont vu le rédacteur y glisser l'arrêt propre de l'exemple (« si un
   test échoue pour une raison que tu ne sais pas expliquer ») dans des
   tâches qui ne l'avaient pas demandé — malgré une règle écrite qui
   l'interdisait. Une phrase fixe se vérifie ; une règle se contourne.
   Un arrêt demandé par l'utilisateur s'écrit à part : « Arrête-toi aussi… ». */
export const ARRET = "Arrête-toi et demande-moi seulement si tu ne peux pas continuer sans moi, ou avant tout geste destructeur :";
export const DERNIERE_LIGNE = "Termine par trois titres : Bloqué sur moi, Changé, Trouvé.";

/* Les clauses par type de tâche. Chacune est le conseil du guide pour ce
   type-là, en français, et le méta-prompt les propose TELLES QUELLES à
   adapter. `quand` dit au modèle quand elle s'applique — une clause
   plaquée sur une tâche qui n'en a pas besoin est une instruction en
   trop, et le juge la compte comme telle. */
export const CLAUSES = [
  {
    type: "run long",
    quand: "la tâche prendra des heures ou traverse beaucoup de fichiers",
    texte: "Tiens ta liste de tâches dans TASKS.md : coche chaque point fini et ajoute ce que tu découvres en chemin.",
  },
  {
    type: "audit ou migration à grande échelle",
    /* L'unité est un LOT autonome — un service, un groupe d'endpoints qui
       partagent un fichier —, jamais l'élément le plus fin : deux bancs ont
       vu « chaque endpoint à son propre sous-agent », soit des sous-agents
       parallèles qui éditent le même fichier de routes. */
    quand: "le même travail se répète sur beaucoup d'unités ; l'unité est un lot autonome (un service, un groupe d'endpoints qui partagent un fichier), jamais l'élément le plus fin",
    texte: "Confie chaque <unité> à son propre sous-agent et vérifie ses preuves avant de les accepter ; réunis le tout dans un seul tableau : <colonnes>.",
  },
  {
    type: "design",
    quand: "une page, une app, un visuel, un artefact",
    texte: "N'utilise pas : <au moins trois habitudes de style nommées précisément>.",
  },
  {
    type: "recherche ou analyse",
    quand: "la réponse dépend de sources à trouver ou à croiser",
    texte: "Marque tout ce que tu n'as pas pu confirmer, et dis où tu as cherché.",
  },
  {
    type: "revue de code",
    quand: "on relit un diff, une branche, une pull request",
    texte: "Ne liste que les problèmes pour lesquels tu bloquerais la fusion : le fichier et la ligne, pourquoi c'est faux, et comment montrer que ça échoue.",
  },
  {
    type: "document long",
    quand: "un rapport, un plan, une présentation, un tableur à partager",
    texte: "Avant de rendre, relis le tout et corrige ce qui se contredit : chiffres, dates, noms.",
  },
];

/* Les habitudes par défaut que le guide nomme lui-même. Proposées au
   modèle pour une tâche de design dont l'idée ne dit rien du style —
   c'est le point de départ du guide, qui ajoute : regarde ce qu'il a
   choisi à la place, et si ça ne te plaît pas non plus, ajoute-le. */
export const STYLES_PAR_DEFAUT = [
  "un fond crème ou blanc cassé",
  "des mots en italique dans les titres",
  "des étiquettes de section numérotées « 01 / 02 / 03 »",
  "des étiquettes en police à chasse fixe",
  "des boutons en forme de pilule",
];

/* Normalisation avant lecture, jamais du texte rendu : forme Unicode
   composée (un « é » décomposé ferait échouer les phrases fixes),
   apostrophes typographiques, espaces insécables que la typographie
   française met devant les deux-points, trait d'union insécable. */
const norm = (text) =>
  String(text || "")
    .normalize("NFC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[\u00a0\u202f\u2009]/g, " ")
    .replace(/\u2011/g, "-");

/* Ce que le guide dit de RETIRER. Chacune de ces tournures est une
   faute nommée, pas un goût. */
/* Les bornes de mot sont des gardes Unicode et non `\b` : en JavaScript,
   `\b` ne voit pas de frontière devant un « é », et « étape par étape »
   passait sous le filtre sans qu'aucune assertion le dise. */
const MOT = (corps) => new RegExp(`(?<!\\p{L})(?:${corps})(?!\\p{L})`, "iu");
/* « étape par étape » et « pas à pas » ne sont des consignes de réflexion
   que comme MANIÈRE de travailler (« procède étape par étape ») : « écris
   un guide pas à pas » est un livrable légitime, et la relecture du
   2026-09-23 l'a vu refusé à tort. */
const REFLECHIS = MOT(
  "r[ée]fl[ée]chis(?:sez)?|r[ée]fl[ée]chir|pense bien|pense attentivement|pense soigneusement|prends le temps de|think (?:hard|carefully)|step[- ]by[- ]step|" +
    "(?:proc[èe]de|avance|raisonne|travaille|pense|analyse|progresse|d[ée]compose|vas-y|va)[^.\\n]{0,20}(?:[ée]tape par [ée]tape|pas [àa] pas)|" +
    "(?:^|[.!?]\\s+)(?:[ée]tape par [ée]tape|pas [àa] pas)\\s*,"
);
const RAISONNEMENT = MOT(
  "(?:montre|expose|d[ée]taille|affiche|reproduis|restitue|[ée]cris|d[ée]cris|explique|raconte|explicite)[^.\\n]{0,40}(?:ton|tes|le|la|ta)\\s+(?:raisonnement|r[ée]flexion|cha[iî]ne de pens[ée]e|pens[ée]e interne)"
);
const VAGUE = MOT(
  "(?:[ée]vite|pas de|sans|aucun)\\s+(?:un |le |l'|d'|de )?(?:look|style|rendu|aspect|design)\\s+(?:g[ée]n[ée]rique|banal|standard|fade|IA|par d[ée]faut)"
);
/* Un critère d'arrivée se CONSTATE. Ces mots-là demandent un jugement :
   le banc du 2026-09-23 les a trouvés dans quatre prompts sur huit
   (« s'affiche correctement », « clairement lisibles », « lisible en
   l'état »), chaque fois pour une arrivée qu'aucun tiers ne peut trancher. */
const FLOU = MOT(
  "correctement|clairement|claire?s?|lisibles?|propres?|de qualit[ée]|coh[ée]rente?s?|bien fait|jolie?s?|agr[ée]ables?|soign[ée]e?s?|professionnel(?:le)?s?|fluides?|intuitifs?|intuitives?"
);
/* Le verbe de la tâche. Quatre bancs sur quatre, l'idée « améliore mon
   site » a rendu un prompt qui commence par « Améliore… » alors que les
   réponses disaient exactement quoi faire (vitesse mobile, formulaire) :
   le flou de l'idée recopié tel quel, la refonte ouverte à tout. */
const VERBE_FLOU = /^\s*(am[ée]liore|optimise|retravaille|revois|peaufine|perfectionne|modernise|rafra[iî]chis)\b/i;
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
  /* Préfixe « longueur » : c'est à lui que le choix de la meilleure
     tentative reconnaît une faute réparable en redemandant. */
  if (mots < MOTS_MIN) fails.push(`longueur : ${mots} mots — trop court (vise ${VISEE.lo} à ${VISEE.hi})`);
  else if (mots > MOTS_MAX) fails.push(`longueur : ${mots} mots — trop long (vise ${VISEE.lo} à ${VISEE.hi})`);

  if (STRUCTURE.test(brut)) fails.push("titres ou puces : le prompt est fait de phrases pleines");
  if (VERBE_FLOU.test(t))
    fails.push(`la tâche commence par « ${VERBE_FLOU.exec(t)[1]} » — dis le geste réel (« accélère », « répare », « migre »)`);
  /* L'arrivée se lit jusqu'à la fin de SA phrase, pas de la ligne : dans
     un prompt sans saut de paragraphe, la ligne court jusqu'aux clauses, et
     « son propre sous-agent » y était pris pour un critère flou. */
  const arrivee = /fini veut dire\s*:(.*?)(?:\.(?=\s+\p{Lu})|\n|$)/isu.exec(t);
  if (!arrivee) fails.push("« Fini veut dire : » absent — aucune ligne d'arrivée");
  else if (FLOU.test(arrivee[1]))
    fails.push(`un critère d'arrivée qu'on ne peut pas constater (« ${FLOU.exec(arrivee[1])[0]} ») — dis ce qu'un tiers verrait`);
  if (!/m[êe]me message que ton action suivante/i.test(t))
    fails.push("la règle de continuer (points d'avancement dans le même message que l'action suivante) est absente");
  if (!/arr[êe]te-toi et demande(-moi)? seulement si/i.test(t))
    fails.push("la règle d'arrêt (« Arrête-toi et demande-moi seulement si… ») est absente");
  else if (!t.includes(ARRET))
    fails.push(`la règle d'arrêt n'est pas la phrase fixe « ${ARRET} » — un arrêt propre demandé s'écrit à part (« Arrête-toi aussi… »)`);
  /* Le mot « destructeur » est DANS la phrase fixe : le chercher ne
     prouvait rien. Ce qui compte est ce qui la suit — au moins deux mots
     avant la fin de la phrase. */
  const apres = t.includes(ARRET) ? t.slice(t.indexOf(ARRET) + ARRET.length).split(/\.(?:\s|$)/)[0] : "";
  if (t.includes(ARRET) && countMots(apres) < 2) fails.push("aucun geste destructeur nommé après la règle d'arrêt");
  if (REFLECHIS.test(t)) fails.push("une consigne de réflexion (« réfléchis », « étape par étape ») — 5.5 pense déjà");
  if (RAISONNEMENT.test(t)) fails.push("une demande de montrer son raisonnement — catégorie de signalement");
  if (VAGUE.test(t)) fails.push("un « évite le générique » sans liste nommée — nomme les styles exclus");
  /* Une clause de sous-agents sans vérification des preuves est la moitié
     du conseil qui ne sert à rien : le guide dit « vérifie ses preuves
     avant de les accepter », et c'est ce qui fait la valeur du tableau. */
  if (/sous-agents?/i.test(t) && !/preuves?/i.test(t))
    fails.push("des sous-agents sans vérification de leurs preuves");
  if (/sinon tu continues\.|d[ée]ploie des sous-agents et ultracode|sinon la cha[iî]ne continue\./i.test(t))
    fails.push("la dernière ligne d'une autre technique");
  if (!t.trim().endsWith(DERNIERE_LIGNE)) fails.push(`ne finit pas par « ${DERNIERE_LIGNE} »`);

  return { pass: fails.length === 0, fails, count: n, over, limit: cap, mots };
}

/* ---------- les exemples de référence ----------
   DEUX, de types différents, et ce n'est pas un luxe : avec un seul
   exemple (une migration), le banc du 2026-09-23 a vu le rédacteur en
   recopier l'arrêt propre (« si un test échoue… ») et les gestes
   destructeurs (« forcer un push ») jusque dans une revue de code, et
   son critère de bout en bout dans une autre migration qui ne l'avait
   pas demandé. Deux exemples qui ne se ressemblent pas montrent ce qui
   est la FORME — et que le reste appartient à chaque tâche.
   Chacun passe son propre vérificateur (assertion). */
/* L'idée d'où chaque exemple est tiré. Montrée au rédacteur AVANT son
   prompt : le premier banc a prouvé qu'un exemple nu se recopie, critères
   et arrêts compris. Avec son idée à côté, il montre d'où vient chaque
   critère — et que l'arrêt propre (« si un test échoue… ») n'existe que
   parce que l'utilisateur l'a demandé. */
export const IDEE_REFERENCE =
  "Migre tous les endpoints de paiement de facturation-api de notre client maison lib/stripe-legacy vers le SDK officiel stripe-node. " +
  "C'est fini quand ils passent tous par le nouveau client, que l'ancien est supprimé et que les tests passent.";
export const IDEE_REFERENCE_DESIGN =
  "La page d'accueil de l'Atelier Mira, notre école de céramique à Lyon : les cours, les tarifs, un formulaire d'inscription. Juste du HTML et du CSS.";

export const PROMPT_REFERENCE = `Migre tous les endpoints de paiement du dépôt facturation-api de l'ancien client maison (lib/stripe-legacy) vers le SDK officiel stripe-node, et livre la branche prête à relire, pas un plan.

Fini veut dire : chaque endpoint de routes/paiements appelle le nouveau client, lib/stripe-legacy est supprimé du dépôt avec toutes ses références, et la suite de tests passe en entier.

Quand une étape n'a pas besoin de moi, continue, et mets tes points d'avancement dans le même message que ton action suivante. Arrête-toi et demande-moi seulement si tu ne peux pas continuer sans moi, ou avant tout geste destructeur : supprimer des données, forcer un push, toucher la configuration de production ou quoi que ce soit hors de ce dépôt.

Tiens ta liste de tâches dans TASKS.md : coche chaque point fini et ajoute ce que tu découvres en chemin. Confie chaque groupe d'endpoints à son propre sous-agent et vérifie ses preuves avant de les accepter ; réunis le tout dans un seul tableau : endpoint, migré oui ou non, test qui le prouve.

Termine par trois titres : Bloqué sur moi, Changé, Trouvé.`;

export const PROMPT_REFERENCE_DESIGN = `Construis la page d'accueil de l'Atelier Mira, notre école de céramique à Lyon, en HTML et CSS, et livre la page finie avec des textes et des tarifs provisoires, pas une maquette.

Fini veut dire : la page s'ouvre dans un navigateur sans erreur dans la console, et elle présente les cours, les tarifs et un formulaire d'inscription.

Quand une étape n'a pas besoin de moi, continue, et mets tes points d'avancement dans le même message que ton action suivante. Arrête-toi et demande-moi seulement si tu ne peux pas continuer sans moi, ou avant tout geste destructeur : écraser un fichier qui existe déjà, mettre la page en ligne, ou brancher le formulaire sur un vrai service d'inscription.

N'utilise pas : un fond crème ou blanc cassé, des mots en italique dans les titres, des étiquettes de section numérotées « 01 / 02 / 03 », des étiquettes en police à chasse fixe, des boutons en forme de pilule.

Termine par trois titres : Bloqué sur moi, Changé, Trouvé.`;

export const EXEMPLES = [PROMPT_REFERENCE, PROMPT_REFERENCE_DESIGN];

export function buildMeta(limit) {
  const cap = capLimit(limit);
  return (
    "Tu es un générateur de prompts selon la méthode Opus 5.5, tirée du guide d'Anthropic « Getting the most out of Opus 5.5 ». " +
    "Le prompt que tu produis sera donné tel quel à Claude Opus 5.5, dans Claude Code ou dans l'app Claude, pour une TÂCHE BORNÉE " +
    "qu'il mènera seul jusqu'au bout. Tu n'écris pas le travail : tu écris le message qui le confie.\n\n" +
    "CE QUE CE MODÈLE CHANGE : il tient seul un long travail en plusieurs étapes, pourvu qu'on lui dise ce que « fini » veut dire. " +
    "Il pense avant chaque réponse et dose lui-même. Sur un long run, il s'arrête parfois pour rendre compte — un résumé qui nomme " +
    "l'étape suivante sans la faire, une offre de continuer, des choix qui ne bloquent rien — et il suit une consigne qui nomme les arrêts voulus. " +
    "Son compte rendu est clair ; on veut d'abord y lire ce qui attend l'humain.\n\n" +
    "FORME DU PROMPT — cinq mouvements, dans cet ordre, en phrases pleines, SANS titre ni puce ni liste numérotée :\n" +
    "1. La tâche entière, en une ou deux phrases : ce qu'on fait, sur quoi (dépôt, dossier, fichier, site nommés s'ils sont connus), " +
    "et le livrable FINI — le fichier, la branche, la page, le tableur prêt à partager, jamais un plan ni un brouillon.\n" +
    `2. « ${FINI} » puis deux à cinq critères OBSERVABLES qu'un tiers pourrait vérifier : une suite de tests qui passe, chaque élément ` +
    "d'une liste couvert, un fichier qui existe, un nombre atteint, un parcours qui réussit. Jamais « quand c'est bien », « de qualité », « propre ».\n" +
    `3. La règle d'arrêt, deux phrases FIXES reprises mot pour mot : « ${CONTINUE} » puis « ${ARRET} » suivie des gestes destructeurs de CE travail, nommés. ` +
    "Rien ne s'insère dans la phrase fixe. Si — et seulement si — l'idée ou les réponses demandent un autre arrêt, il s'écrit dans une phrase à part : « Arrête-toi aussi si … ».\n" +
    "4. Les clauses du type de tâche — celles qui s'appliquent, et SEULEMENT celles-là ; aucune si la tâche est courte et simple. " +
    "Reprends-les en les adaptant au domaine :\n" +
    CLAUSES.map((c) => `   - ${c.type} (${c.quand}) : « ${c.texte} »`).join("\n") +
    "\n   Pour le design, si l'idée ne dit rien du style, pars des habitudes que le guide nomme lui-même : " +
    STYLES_PAR_DEFAUT.join(", ") +
    ". Jamais « évite un look générique » : une consigne vague échange un style par défaut contre un autre.\n" +
    `5. La dernière ligne, toujours, mot pour mot : « ${DERNIERE_LIGNE} »\n\n` +
    "RÈGLES DE FIDÉLITÉ — là où un prompt bien formé devient faux :\n" +
    "- La tâche dit concrètement ce qu'on fait, avec les précisions des réponses : son premier verbe est le geste réel (« accélère », « répare », « migre », « compare »), " +
    "jamais « améliore », « optimise », « retravaille » — le flou de l'idée recopié ouvre une refonte que personne n'a demandée. " +
    "Pour une revue, une analyse ou un audit, elle dit qu'on ne modifie rien de ce qu'on examine.\n" +
    "- L'arrivée vient de l'idée et des réponses : chaque critère doit pouvoir y être montré du doigt, sinon il n'entre pas. Si l'utilisateur l'a donnée, reprends SES critères, sans en retirer, sans en restreindre la portée " +
    "(« chaque page », pas « la page d'accueil »), et n'ajoute que ce qui en découle strictement (la suite de tests qui passe pour une modification de code). " +
    "N'invente aucune exigence qu'il n'a pas demandée : ni tri, ni message de confirmation, ni « sans avertissement », ni test de bout en bout qui demanderait des accès qu'il n'a pas donnés, ni nombre d'éléments, ni recommandation, ni format de fichier. " +
    "Si l'idée n'en dit pas plus, l'arrivée reprend simplement ce qu'elle demande (« la page présente X, Y et Z ») et ce qui découle du livrable (le fichier s'ouvre, les tests passent). " +
    "Pour une revue : chaque fichier modifié a été lu, et la revue dit si la fusion est possible ou quels problèmes la bloquent — aucune seconde liste de remarques.\n" +
    "- Chaque critère se constate par un tiers : jamais « correctement », « clairement », « lisible », « propre », « de qualité », « cohérent ». " +
    "Un critère reste atteignable quand une donnée manque (« ou marqué non confirmé »). L'arrivée ne redit pas une clause. " +
    "Elle tient les deux bords quand le travail transforme quelque chose : ce qui doit avoir changé ET ce qui ne doit pas s'être perdu " +
    "(dédoublonner : chaque e-mail présent au départ figure exactement une fois ; renommer : l'identifiant exact, pas une sous-chaîne).\n" +
    "- L'arrêt propre à la tâche n'existe que si le travail ne peut VRAIMENT plus avancer sans l'humain (un accès manquant, une source introuvable). " +
    "Un choix que l'agent peut trancher lui-même et signaler dans son compte rendu n'est pas un arrêt ; un accès manquant est déjà couvert par « si tu ne peux pas continuer sans moi ». " +
    "Le « Arrête-toi aussi » n'existe que si l'utilisateur l'a demandé en toutes lettres.\n" +
    "- Les gestes destructeurs partent TOUJOURS de la base du guide — supprimer des données, forcer un push s'il y a un dépôt, " +
    "changer quoi que ce soit hors du périmètre du travail : hors de ce dépôt pour du code, et sinon tout ce qui n'est ni le livrable ni ce que la tâche demande de changer — puis ajoutent ceux de CE travail, déduits de ce qu'il touche, et nommés largement : pour une revue, publier quoi que ce soit sur la pull request, l'approuver ou la fusionner ; " +
    "pour un document ou un tableur, le partager ou l'envoyer à qui que ce soit, modifier ou supprimer ses sources ; pour une recherche, écrire à qui que ce soit, créer un compte, payer ; pour une page, la mettre en ligne, écraser un fichier existant ; " +
    "pour du code, supprimer des données, forcer un push, déployer. L'arrêt précède le geste, sans condition (jamais « sans prévenir »). " +
    "Aucun geste nommé ne doit bloquer ce que la tâche ou l'arrivée exigent elles-mêmes : supprimer l'ancien client d'une migration, remplacer une image pour accélérer une page, " +
    "créer le livrable — dans un dépôt versionné, modifier ou supprimer un fichier se défait, ce n'est pas un geste destructeur.\n" +
    "- Une clause se reprend MOT POUR MOT : tu ne remplis que ses trous (<unité>, <colonnes>, les styles), tu ne la restreins pas, tu ne la reformules pas. " +
    "Run long : seulement quand l'idée parle de dizaines d'éléments ou d'heures de travail — jamais pour un site vitrine, une page, un script, une revue ou un renommage. " +
    "Design : seulement quand la tâche crée ou refait l'APPARENCE, jamais pour de la performance ou du contenu. " +
    "La liste des styles exclus est nue — aucune réserve (« générique », « sans raison ») — et aucune direction de style que l'idée ne donne pas (« une palette apaisante »). " +
    "Recherche : seulement quand il faut TROUVER ou croiser des sources ouvertes — pas quand la source est unique et désignée (un tableur, un dossier). " +
    "Recherche et document long vont souvent ensemble.\n" +
    "- Rien d'autre : aucune phrase hors des cinq mouvements (« vérifie aussi… », « ne remonte pas les détails de style… »). Une tâche courte et simple n'a AUCUNE clause.\n" +
    "- Les exemples montrent la FORME. Leurs critères, leur arrêt propre et leurs gestes destructeurs sont ceux d'une migration et d'une page : ne les recopie jamais.\n\n" +
    "CE QUI N'ENTRE JAMAIS : aucune consigne de réflexion (« réfléchis bien », « étape par étape », « prends le temps ») — le modèle pense déjà, " +
    "et la ligne le ralentit sans rien gagner. Aucune demande de montrer ou d'exposer son raisonnement : c'est une catégorie de signalement, " +
    "la réponse peut être refusée ou basculer sur un modèle plus ancien ; si une justification est utile, demande « explique ton choix en trois phrases ». " +
    "Ni architecture, ni arborescence, ni plan imposé, ni choix de pile que l'idée n'impose pas : l'agent les tranche mieux une fois le travail commencé. " +
    "Aucun rôle ni persona (« tu es un expert… ») : la tâche suffit. Chaque instruction en trop est une décision retirée à l'agent.\n\n" +
    "LANGUE ET VOIX : français, agent tutoyé, phrases simples et directes, comme un message qu'on envoie à quelqu'un de compétent. " +
    "C'est l'utilisateur qui parle : « moi », « mon associé », « notre dépôt » — jamais « ton associé ». " +
    "Les noms concrets de l'idée (outils, dépôts, fichiers, colonnes) entrent en dur, tels qu'elle les dit — sans les préciser au-delà " +
    "(« lib/stripe-legacy », pas « le dossier lib/stripe-legacy » si l'idée ne dit pas que c'est un dossier) ; ce que l'idée ne dit pas, l'agent le tranche.\n\n" +
    `LONGUEUR : ${VISEE.lo} à ${VISEE.hi} mots, et moins de ${cap} caractères. ` +
    "Une tâche simple tient dans le bas de la fourchette : n'ajoute jamais une phrase pour atteindre une longueur.\n\n" +
    "DEUX EXEMPLES DE RÉFÉRENCE, chacun avec l'idée d'où il vient. Regarde d'où sort chaque critère : de l'idée, et de rien d'autre " +
    "(l'idée de la page ne dit rien du mobile ni des champs du formulaire : l'arrivée n'en dit rien non plus). " +
    "Reproduis la forme, la densité et la voix ; jamais leur contenu.\n" +
    "--- IDÉE : " + IDEE_REFERENCE + "\n--- PROMPT (migration longue et répétitive : run long + sous-agents) :\n" +
    PROMPT_REFERENCE +
    "\n--- IDÉE : " + IDEE_REFERENCE_DESIGN + "\n--- PROMPT (une page créée de zéro : design seul) :\n" +
    PROMPT_REFERENCE_DESIGN +
    "\n---\n"
  );
}

/* ---------- étape 1 ----------
   Même forme que Boris — des questions — donc le même écran, sans
   branche nouvelle dans l'atelier. Ce qui est matériel ici se réduit à
   deux choses : l'arrivée, et les arrêts. Tout le reste — le type de
   tâche, les clauses, les styles à exclure — se tranche sans demander :
   c'est précisément ce que le guide dit de ne pas faire porter à
   l'humain. */
export function etape1Instruction() {
  return (
    "ÉTAPE 1 — Ne rédige pas encore le prompt. Deux manques, et deux seulement, justifient une question.\n" +
    "(a) L'ARRIVÉE : si l'idée ne dit pas à quoi on verra que c'est fini, et qu'aucune hypothèse raisonnable ne donne un critère qu'un tiers pourrait constater, " +
    "demande-le — c'est la question la plus importante, elle passe avant toute autre (« À quoi verras-tu que c'est réussi : un score, un parcours qui marche, une liste couverte ? »).\n" +
    "(b) L'OBJET : si l'idée suppose un existant (un site, un dépôt, une liste, un fichier, une source) sans dire où il est, demande où.\n" +
    "Ne demande JAMAIS : ce qui se lit dans l'existant une fois qu'on sait où il est (framework, pile, structure) ; le contenu que l'agent remplit en provisoire " +
    "(textes, prix, noms de formules) ; le format du livrable ; sur quoi se concentrer ; l'accès (l'agent le règle, ou s'arrête s'il ne peut pas) ; le type de tâche, les clauses, les styles, les gestes destructeurs ; " +
    "un détail que l'agent tranche et signale dans son compte rendu. Test : si « je ne sais pas, tranche » serait une réponse acceptable, la question est superflue. " +
    "Si l'idée donne déjà l'arrivée et l'objet, ne pose aucune question.\n" +
    "Une question par manque, qui se répond en quelques mots, fermée si possible. " +
    'Réponds UNIQUEMENT avec ce JSON, sans autre texte : {"questions":["..."]} — 2 questions maximum, tableau vide si l\'idée suffit.'
  );
}

/* La relecture avant de rendre. Le guide la recommande pour tout long
   document (« check this deck for anything that contradicts itself ») ;
   ici elle porte sur les fautes que le juge du banc a trouvées, tour après
   tour, dans des prompts que l'oracle déclarait verts : un critère que
   l'idée ne demandait pas, une portée rétrécie, une redite, une tautologie.
   Ce n'est pas une consigne de réflexion — c'est une liste de choses à
   constater sur son propre texte. */
export const RELECTURE =
  "Avant de rendre, relis ton texte et corrige-le : chaque critère de l'arrivée se montre du doigt dans l'idée ou les réponses, " +
  "avec la même portée et les mêmes mots (« hébergement des données » reste « hébergement des données ») ; aucune information n'est dite deux fois, " +
  "ni entre la tâche et l'arrivée ni ailleurs ; aucun critère n'est vrai par définition (« la page tient sur une page ») ; " +
  "aucun geste nommé n'est réversible dans un dépôt versionné ; aucun mot n'est ambigu pour un tiers qui vérifierait.";

export function etape2Instruction({ limit, questions, answers }) {
  const cap = capLimit(limit);
  let instruction =
    "ÉTAPE 2 — Écris MAINTENANT le prompt final. Texte brut uniquement : pas de backticks, pas de préambule, pas de commentaire après. " +
    `Les cinq mouvements dans l'ordre, en phrases pleines, sans titre ni puce, ${VISEE.lo} à ${VISEE.hi} mots, moins de ${cap} caractères. ` +
    `« ${FINI} » avec des critères observables, la règle d'arrêt reprise mot pour mot, seulement les clauses qui s'appliquent, ` +
    `et la dernière ligne « ${DERNIERE_LIGNE} » ` +
    RELECTURE;

  if (answers) {
    const lines = (questions || [])
      .map(
        (q, i) =>
          `Q${i + 1} : ${q}\nR : ` +
          (answers[i] || "(sans réponse — tranche par l'hypothèse la plus raisonnable et écris-la dans la tâche)")
      )
      .join("\n");
    instruction = `RÉPONSES :\n${lines}\n\n${instruction}`;
  }
  return instruction;
}

export function repairInstruction(check, limit, attempt) {
  const cap = capLimit(limit);
  /* La cible se resserre à chaque tour, en MOTS : un modèle estime sa
     longueur, et une cible fixe le fait converger sans jamais franchir
     la barre (mesuré chez Boris, repris au gantelet). */
  const cibles = [VISEE.hi, 205, 180, VISEE.lo + 10];
  const cible = cibles[Math.min(Math.max(attempt - 2, 0), cibles.length - 1)];
  const longueur =
    check.mots > MOTS_MAX || check.over
      ? `Tu es à ${check.mots} mots et ${check.count} caractères. Récris en visant ${cible} mots : ` +
        "coupe les redites et les clauses qui ne s'appliquent pas, garde la tâche, l'arrivée et la règle d'arrêt entières. "
      : check.mots < MOTS_MIN
        ? `Tu es à ${check.mots} mots : il manque des mouvements. Vise ${cible} mots. `
        : "";
  return (
    `ASSERTION ÉCHOUÉE : ${check.fails.join(" ; ")}. ` +
    longueur +
    "Régénère le prompt COMPLET, texte brut uniquement, les cinq mouvements dans l'ordre, en phrases pleines, sans titre ni puce : " +
    `la tâche entière, « ${FINI} » et des critères observables, « ${CONTINUE} » puis « ${ARRET} » mot pour mot, suivie des gestes nommés, ` +
    `les clauses qui s'appliquent, et la dernière ligne exacte « ${DERNIERE_LIGNE} » Moins de ${cap} caractères.`
  );
}

/* Même raison qu'au gantelet : une tentative peut pécher par le bas, et
   « la plus courte » choisirait la plus mutilée. On garde la plus
   proche de la fenêtre visée parmi celles dont seule la longueur pèche. */
export function choisirMeilleure(tries) {
  const green = tries.find((t) => t.check.pass);
  if (green) return green;
  const cible = (VISEE.lo + VISEE.hi) / 2;
  const sains = tries.filter((t) => t.check.fails.every((f) => f.startsWith("longueur")));
  const pool = sains.length ? sains : tries;
  const ecart = (t) => Math.abs((t.check.mots ?? countMots(t.text)) - cible);
  return pool.reduce((a, b) => (ecart(b) < ecart(a) ? b : a));
}

/* ---------- le juge ----------
   Six critères, aucune clé commune avec les trois autres grilles (le
   juge reconstruit PAR CLÉ ; une assertion tient la disjonction). */
export const CRITERES = [
  { cle: "livrable", nom: "La tâche entière", quoi: "tout le travail tient dans le message, son objet est nommé (dépôt, site, fichiers), et le livrable est FINI — le fichier, la branche, la page — jamais un plan ni un brouillon" },
  { cle: "arrivee", nom: "La ligne d'arrivée", quoi: `« ${FINI} » suivi de critères OBSERVABLES qu'un tiers vérifierait (tests qui passent, liste couverte, fichier livré, nombre atteint) ; jamais « quand c'est bien », « de qualité », « propre »` },
  { cle: "arrets", nom: "Les arrêts nommés", quoi: "continuer sans demander quand une étape n'a pas besoin de l'humain, avec les points d'avancement dans le même message que l'action suivante ; ne s'arrêter que bloqué ou avant un geste destructeur NOMMÉ de ce domaine" },
  { cle: "clauses", nom: "Les clauses du type", quoi: "celles qui s'appliquent et seulement elles : liste de tâches dans un fichier pour un run long, sous-agents dont on vérifie les preuves et un seul tableau pour un audit, styles exclus nommément pour du design, ce qui n'a pas pu être confirmé pour une recherche, ce qui bloquerait la fusion pour une revue, contradictions internes pour un document" },
  { cle: "rapport", nom: "Le compte rendu", quoi: `la dernière ligne est « ${DERNIERE_LIGNE} » — ce qui attend l'humain se lit en premier` },
  { cle: "depouille", nom: "Le dépouillement", quoi: `aucun « réfléchis » ni « étape par étape », aucune demande de montrer le raisonnement, aucun « évite le générique », ni rôle, ni architecture, ni plan imposé ; phrases pleines, ${VISEE.lo} à ${VISEE.hi} mots` },
];

export function auditInstruction() {
  const grille = CRITERES.map((c, i) => `${i + 1}. ${c.cle} — ${c.nom} : ${c.quoi}`).join("\n");
  return (
    "ÉTAPE 3 — Juge le prompt ci-dessus contre la méthode Opus 5.5, et NOTE-LE.\n\n" +
    "GRILLE — six critères, chacun sur 10 :\n" +
    grille +
    "\n\nLa note globale n'est PAS la moyenne : elle ne dépasse pas de plus de 2 points le plus faible " +
    "des critères. Une ligne d'arrivée qu'on ne peut pas observer est la faute qui tue la méthode — le modèle ne sait " +
    "pas quand il a fini, il s'arrête pour demander ou il s'arrête trop tôt — donc un prompt dont l'arrivée est floue " +
    "n'est pas un bon prompt, même si tout le reste est parfait. Note 8 à 10 seulement ce qu'on peut envoyer tel quel.\n\n" +
    'Réponds UNIQUEMENT avec ce JSON, sans autre texte :\n' +
    '{"note":7.5,"verdict":"une phrase","criteres":[{"cle":"livrable","note":8,"mot":"six mots"}],' +
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
    `les cinq mouvements dans l'ordre, en phrases pleines, ${VISEE.lo} à ${VISEE.hi} mots, ` +
    `moins de ${cap} caractères, dernière ligne « ${DERNIERE_LIGNE} » ` +
    RELECTURE
  );
}

export function correctionInstruction(demand, limit) {
  const cap = capLimit(limit);
  return (
    `CORRECTION DEMANDÉE :\n${String(demand).trim()}\n\n` +
    "Applique-la au prompt ci-dessus et régénère-le COMPLET. Texte brut uniquement : pas de backticks, " +
    "pas de commentaire, pas de préambule, aucune phrase qui parle de la correction. Ne change QUE ce qui " +
    "est demandé ; garde le reste mot pour mot. Les cinq mouvements dans l'ordre, en phrases pleines, " +
    `${VISEE.lo} à ${VISEE.hi} mots, moins de ${cap} caractères, dernière ligne « ${DERNIERE_LIGNE} »`
  );
}

export function baseConvoFor({ idea, prompt, limit }) {
  const convo = [
    {
      role: "user",
      content:
        buildMeta(limit) +
        "\n\nIDÉE :\n" +
        (String(idea || "").trim() || "(idée non conservée — pars du prompt ci-dessous)"),
    },
  ];
  if (prompt) convo.push({ role: "assistant", content: prompt });
  return convo;
}
