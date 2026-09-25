/* ================================================================
   LA MÉTHODE OPUS 5.5 — la quatrième technique de l'atelier.

   SOURCE : la documentation officielle d'Anthropic, « Prompting Claude
   Opus 5.5 » (platform.claude.com, `SOURCE` ci-dessous), relue en entier
   le 2026-09-25. ORIGINE historique : le billet « Getting the most out
   of Opus 5.5 in Claude and Claude Code » (Addy Osmani, claude.dev,
   2026-09-22), d'où la méthode est née le 2026-09-23 (`ORIGINE`). Quand
   les deux divergent, c'est la documentation qui fait foi ; ce que seul
   le billet dit reste tant que la documentation ne le contredit pas, et
   ce fichier le dit comme tel.

   Ce que la documentation dit d'abord : un bon prompt Opus 5 marche tel
   quel sur 5.5, et le levier est dans les RÉGLAGES et le HARNAIS —
   l'effort, la place laissée à la réflexion, la consigne système contre
   les arrêts trop tôt, les relances. Tout cela vit dans `harnais.js`
   (réglages conseillés, communs aux quatre techniques). Ce fichier ne
   s'occupe que du TEXTE du message confié, et ce texte doit rester
   cohérent avec ces réglages, jamais les contredire ni les recopier.

   Ce qui est retenu pour le texte, et d'où ça vient :

   - La tâche ENTIÈRE en un message, avec sa ligne d'arrivée (« Fini veut
     dire : les tests passent »). Documentation : 5.5 mène seul un long
     travail en plusieurs étapes « jusqu'à ce que ses tests passent », et
     énoncer la condition de fin dès le départ est ce qui permet de
     vérifier qu'il a fini.
   - Le MODE. Laissé seul sur un long run, 5.5 s'arrête parfois pour
     rendre compte ; la documentation traite ces arrêts par une consigne
     SYSTÈME (les quatre arrêts non voulus, verbatim dans `harnais.js`)
     et par des relances du harnais. Le message, lui, porte une règle
     courte qui va dans le même sens (continuer, les points d'avancement
     dans le même message que l'action suivante, s'arrêter seulement
     bloqué ou avant un geste destructeur). Mais la documentation dit
     aussi de LAISSER cette consigne de côté quand quelqu'un est là pour
     répondre, et d'y demander plutôt une ligne d'intention avant la
     première action et un court récapitulatif à la fin. D'où deux
     formes du troisième mouvement, jamais mêlées (`INTENTION`,
     `DEMANDE`).
   - Aucun « réfléchis bien » : il pense avant chaque réponse et dose
     lui-même, l'effort est le réglage. Aucune demande de montrer son
     raisonnement : la réponse peut être déclinée (catégorie
     `reasoning_extraction`). Documentation, les deux.
   - Des clauses PAR TYPE de tâche, et seulement celles qui s'appliquent.
     De la documentation : liste de tâches dans un fichier pour un run
     long, styles exclus NOMMÉMENT pour du front (« évite le générique »
     échange un défaut contre un autre), exploration large avant d'agir
     quand la tâche traverse plusieurs applications. Du billet, que la
     documentation ne contredit pas : sous-agents dont on vérifie les
     preuves pour un audit, « marque ce que tu n'as pas pu confirmer »
     pour une recherche, « ce pour quoi tu bloquerais la fusion » pour
     une revue, relecture des contradictions pour un long document.
   - Un compte rendu dont la première partie est ce qui t'attend (la
     documentation : ses comptes rendus disent ce qu'il a fait, trouvé,
     et ce qu'il attend de toi — la forme en trois titres est du billet).

   Ce que cette technique change par rapport aux trois autres : Boris
   confie un produit qui tourne sans fin, le gantelet une qualité à
   battre, les crochets un périmètre à garder. Celle-ci confie une TÂCHE
   BORNÉE, livrée en un run — une migration, un audit, une page, un
   document — et sa preuve est dans la LIGNE D'ARRIVÉE.

   Et elle contredit sciemment une règle des deux méthodes à sections :
   Boris et les crochets interdisent « ne t'arrête pas » comme correction
   de comportement devenue native. Pour un agent 5.5 laissé seul, la
   documentation dit que nommer les arrêts aide — d'abord en consigne
   système, et le message peut en porter la règle courte. Ce n'est PAS
   « la consigne qui compte le plus » (formule du billet, requalifiée le
   2026-09-25) : le levier premier est dans les réglages. C'est pourquoi
   la règle de conduite reste un mouvement obligatoire ici, sous l'une
   de ses deux formes, et pourquoi aucune règle de ce fichier n'est
   partagée avec `meta.js`.
   ================================================================ */

import { countChars } from "./meta.js";
import { countMots } from "./gauntlet.js";
import { conversationDe } from "./harnais.js";

export { countChars, countMots };

/* La source qui fait foi, et l'origine historique. Une seule écriture :
   le méta-prompt, l'aide et le banc les lisent ici. Le banc relit la
   SOURCE en Markdown (même adresse suivie de `.md`), jamais le billet. */
export const SOURCE = {
  titre: "Prompting Claude Opus 5.5",
  auteur: "documentation officielle d'Anthropic",
  url: "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5",
};
export const ORIGINE = {
  titre: "Getting the most out of Opus 5.5 in Claude and Claude Code",
  auteur: "Addy Osmani, claude.dev, 22 septembre 2026",
  url: "https://claude.dev/blog/getting-the-most-out-of-opus-5-5/",
};

/* ---------- la mesure ----------
   En MOTS, comme le gantelet, et pour la leçon payée le 2026-08-26 : un
   modèle estime sa longueur en mots, et un plafond en caractères monté
   seul ne change rien au prompt produit. Les exemples du billet d'origine tiennent
   en trois ou quatre lignes ; le mandat entier — tâche, arrivée, arrêts,
   clauses, compte rendu — en demande cinq fois plus, pas davantage.
   Au rapport mesuré de ~6 caractères par mot, le haut de la fourchette
   (300 mots ≈ 1 800 car.) reste sous le réglage par défaut : c'est la
   fenêtre de mots qui mord la première, jamais le plafond. */
export const HARD_LIMIT = 2600;
/* Plancher abaissé le 2026-09-23 (150 → 120 visés, 110 → 90 acceptés) :
   le juge du banc a noté qu'un renommage, correctement écrit, tombe vers
   130 mots — un plancher plus haut poussait les tâches simples au
   remplissage, exactement ce que la méthode veut éviter. */
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
/* Les deux phrases de l'AUTRE mode : quelqu'un suit le travail et répond
   en cours de route (une conversation dans l'app Claude). La
   documentation, section des arrêts non surveillés : la consigne
   anti-arrêt se laisse de côté « in human-in-the-loop applications,
   where someone is there to answer » ; section des points d'avancement :
   « a one-line statement of intent before the first tool call and a
   short recap at the end […] helps most in human-in-the-loop work ».
   La ligne d'intention est `INTENTION` ; le récapitulatif de fin est
   déjà `DERNIERE_LIGNE`, commune aux deux modes. Et la confirmation
   avant un geste risqué ne se lâche jamais (« keep your own
   confirmation step ») : `DEMANDE` remplace `ARRET`, sans son
   « seulement si », qui est de l'anti-arrêt. Fixes pour la même raison
   que `ARRET` : une phrase fixe se vérifie, une règle se contourne. */
export const INTENTION = "Avant ta première action, dis-moi en une ligne ce que tu vas faire.";
export const DEMANDE = "Demande-moi mon accord avant tout geste destructeur :";
export const DERNIERE_LIGNE = "Termine par trois titres : Bloqué sur moi, Changé, Trouvé.";

/* La clause « plusieurs applications », traduite au plus près de
   l'extrait de la documentation (section « Explore context in multi-app
   workflows ») : « Before taking any action, explore broadly with tool
   calls: list and open the emails, documents, spreadsheet tabs and
   records across the available apps that could be relevant to this
   task, including ones the task does not explicitly mention, and use
   what you find. » « Before taking any action » devient « avant de
   modifier quoi que ce soit » : c'est ce que la documentation dit
   qu'elle fait (« look around before it changes anything »), et un
   « avant toute action » français se lirait contre la ligne d'intention,
   qui vient AVANT la première action. Sans trou à remplir : elle se
   reprend telle quelle, et l'oracle la veut entière. */
export const EXPLORE =
  "Avant de modifier quoi que ce soit, explore largement avec tes outils : liste et ouvre les e-mails, documents, onglets de tableur et fiches des applications disponibles qui pourraient compter pour cette tâche, même ceux qu'elle ne cite pas, et sers-toi de ce que tu trouves.";

/* L'AMORCE de cette clause, et rien de plus large : « explore largement »
   seul se lit aussi dans une tâche de code (« explore largement le dépôt
   pour repérer chaque appel à l'ancien client », avant une migration),
   sans le moindre rapport avec les applications connectées. Un banc a vu
   ce faux rouge pousser la clause multi-applis dans une tâche mono-dépôt
   à la réparation. Seule CETTE amorce, propre à la clause, déclenche le
   contrôle ; une fois là, la clause reste exigée entière. */
const AMORCE_EXPLORE = /explore largement avec tes outils/i;

/* Les clauses par type de tâche. Chacune est, en français, le conseil de
   la documentation ou du billet d'origine pour ce type-là (l'en-tête dit
   laquelle), et le méta-prompt les propose TELLES QUELLES à adapter.
   `quand` dit au modèle quand elle s'applique — une clause plaquée sur
   une tâche qui n'en a pas besoin est une instruction en trop, et le
   juge la compte comme telle. */
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
  {
    /* La documentation l'a mesurée sur des automatisations entre
       applications connectées : nettement plus de tâches réussies, pour
       un peu plus d'appels. Elle ne sert à rien — et coûte — sur une
       tâche courte à une seule source, ou sur du code dans un seul dépôt. */
    type: "plusieurs applications",
    quand: "la tâche traverse plusieurs applications ou sources connectées (e-mails, documents, onglets de tableur, fiches client) ; jamais pour une tâche courte à une seule source, ni pour du code dans un seul dépôt",
    texte: EXPLORE,
  },
];

/* Les habitudes par défaut que la documentation nomme elle-même (section
   « Frontend design defaults »). Proposées au modèle pour une tâche de
   design dont l'idée ne dit rien du style — c'est son point de départ,
   et elle ajoute : regarde ce qu'il a choisi à la place, et allonge la
   liste s'il le faut. */
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

/* Ce que la documentation dit de RETIRER. Chacune de ces tournures est
   une faute nommée, pas un goût. */
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
  /* Le MODE se lit sur les phrases elles-mêmes, par des fragments assez
     larges pour reconnaître une phrase fixe abîmée : « seul » (règle de
     continuer, arrêt « seulement si ») ou « avec quelqu'un qui répond »
     (ligne d'intention, accord demandé). L'une OU l'autre forme, jamais
     les deux : la documentation dit de laisser la consigne anti-arrêt
     de côté quand quelqu'un répond, et un message qui porte les deux se
     contredit. */
  /* Le marqueur « n'a pas besoin de moi, continue » reconnaît aussi la
     règle de conduite ABÎMÉE — reformulée, coupée avant sa fin —, pas
     seulement la phrase fixe entière : un prompt suivi qui laisse passer
     ce fragment mêlé à l'intention et à la demande d'accord est passé au
     vert à tort, faute d'un signal SEUL qui le fasse voir. */
  const signeSeul =
    /m[êe]me message que ton action suivante/i.test(t) ||
    /arr[êe]te-toi et demande(-moi)? seulement si/i.test(t) ||
    /n'a pas besoin de moi,?\s*continue/i.test(t);
  const signeSuivi = /en une ligne ce que tu vas faire/i.test(t) || /demande-moi (?:mon accord )?avant tout geste destructeur/i.test(t);
  /* Le mot « destructeur » est DANS les phrases fixes : le chercher ne
     prouvait rien. Ce qui compte est ce qui les suit — au moins deux mots
     avant la fin de la phrase. */
  const gestesApres = (phrase) => countMots(t.slice(t.indexOf(phrase) + phrase.length).split(/\.(?:\s|$)/)[0]);
  let mode = null;
  if (signeSeul && signeSuivi) {
    mode = "mêlé";
    fails.push(
      "les deux modes mêlés : la règle de continuer d'un agent seul ET la ligne d'intention d'une conversation suivie — garde celle du mode que l'idée indique"
    );
  } else if (signeSuivi) {
    mode = "suivi";
    if (!t.includes(INTENTION)) fails.push(`la ligne d'intention n'est pas la phrase fixe « ${INTENTION} »`);
    if (!t.includes(DEMANDE))
      fails.push(`l'accord avant un geste destructeur n'est pas la phrase fixe « ${DEMANDE} » — un arrêt propre demandé s'écrit à part (« Arrête-toi aussi… »)`);
    else if (gestesApres(DEMANDE) < 2) fails.push("aucun geste destructeur nommé après la demande d'accord");
  } else {
    mode = signeSeul ? "seul" : null;
    if (!/m[êe]me message que ton action suivante/i.test(t))
      fails.push("la règle de continuer (points d'avancement dans le même message que l'action suivante) est absente");
    if (!/arr[êe]te-toi et demande(-moi)? seulement si/i.test(t))
      fails.push("la règle d'arrêt (« Arrête-toi et demande-moi seulement si… ») est absente");
    else if (!t.includes(ARRET))
      fails.push(`la règle d'arrêt n'est pas la phrase fixe « ${ARRET} » — un arrêt propre demandé s'écrit à part (« Arrête-toi aussi… »)`);
    else if (gestesApres(ARRET) < 2) fails.push("aucun geste destructeur nommé après la règle d'arrêt");
  }
  /* La clause « plusieurs applications » n'a pas de trou : entamée, elle
     doit être entière (« explore largement » reformulé à moitié perd ce
     que la documentation a mesuré). Sa PERTINENCE — plusieurs sources,
     jamais une seule — se juge, elle ne se lit pas : c'est au juge. */
  if (AMORCE_EXPLORE.test(t) && !t.includes(EXPLORE))
    fails.push(`la clause plusieurs applications n'est pas la phrase fixe « ${EXPLORE.slice(0, 60)}… »`);
  if (REFLECHIS.test(t)) fails.push("une consigne de réflexion (« réfléchis », « étape par étape ») — 5.5 pense déjà");
  if (RAISONNEMENT.test(t)) fails.push("une demande de montrer son raisonnement — catégorie de signalement");
  if (VAGUE.test(t)) fails.push("un « évite le générique » sans liste nommée — nomme les styles exclus");
  /* Une clause de sous-agents sans vérification des preuves est la moitié
     du conseil qui ne sert à rien : le billet d'origine dit « vérifie ses preuves
     avant de les accepter », et c'est ce qui fait la valeur du tableau. */
  if (/sous-agents?/i.test(t) && !/preuves?/i.test(t))
    fails.push("des sous-agents sans vérification de leurs preuves");
  if (/sinon tu continues\.|d[ée]ploie des sous-agents et ultracode|sinon la cha[iî]ne continue\./i.test(t))
    fails.push("la dernière ligne d'une autre technique");
  if (!t.trim().endsWith(DERNIERE_LIGNE)) fails.push(`ne finit pas par « ${DERNIERE_LIGNE} »`);

  return { pass: fails.length === 0, fails, count: n, over, limit: cap, mots, mode };
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

/* Le troisième exemple, ajouté le 2026-09-25 avec le mode « suivi » et la
   clause « plusieurs applications » : sans exemple, une forme nouvelle
   se devine mal ; avec un exemple NU, elle se recopie (leçon du premier
   banc). Il est donc montré avec son idée, et son idée dit en toutes
   lettres d'où viennent le mode (« je reste là ») et l'exploration (mes
   mails, le tableur, le Drive). Les deux autres exemples n'ont ni l'un
   ni l'autre : une migration ou une page n'en héritent pas. */
export const IDEE_REFERENCE_SUIVI =
  "Dans l'app Claude, je reste là pendant que tu travailles : prépare le point d'avancement du projet Atlas pour le comité de jeudi, " +
  "à partir de mes mails, du tableur des jalons et des comptes rendus de réunion du Drive. Chaque jalon en retard doit y être, avec sa cause.";

export const PROMPT_REFERENCE_SUIVI = `Rédige le point d'avancement du projet Atlas pour le comité de jeudi, à partir de mes mails, du tableur des jalons et des comptes rendus de réunion du Drive, et livre le document fini, pas un plan.

Fini veut dire : chaque jalon en retard du tableur figure dans le point avec sa cause, ou avec la mention cause non confirmée.

Avant ta première action, dis-moi en une ligne ce que tu vas faire. Demande-moi mon accord avant tout geste destructeur : partager ou envoyer le point à qui que ce soit, répondre à un mail, modifier ou supprimer un mail, le tableur ou un compte rendu.

Avant de modifier quoi que ce soit, explore largement avec tes outils : liste et ouvre les e-mails, documents, onglets de tableur et fiches des applications disponibles qui pourraient compter pour cette tâche, même ceux qu'elle ne cite pas, et sers-toi de ce que tu trouves. Avant de rendre, relis le tout et corrige ce qui se contredit : chiffres, dates, noms.

Termine par trois titres : Bloqué sur moi, Changé, Trouvé.`;

export const EXEMPLES = [PROMPT_REFERENCE, PROMPT_REFERENCE_DESIGN, PROMPT_REFERENCE_SUIVI];

export function buildMeta(limit) {
  const cap = capLimit(limit);
  return (
    `Tu es un générateur de prompts selon la méthode Opus 5.5, alignée sur la ${SOURCE.auteur} « ${SOURCE.titre} ». ` +
    "Le prompt que tu produis sera donné tel quel à Claude Opus 5.5 pour une TÂCHE BORNÉE qu'il mènera jusqu'au bout — " +
    "le plus souvent à un agent laissé SEUL (Claude Code, un agent lancé puis laissé travailler), parfois dans une conversation où l'utilisateur SUIT le travail et répond (l'app Claude). " +
    "Tu n'écris pas le travail : tu écris le message qui le confie.\n\n" +
    "CE QUE CE MODÈLE CHANGE : il mène seul un long travail en plusieurs étapes, et la condition de fin posée dès le départ est ce qui dit qu'il a fini. " +
    "Il pense avant chaque réponse et dose lui-même : la profondeur se règle par l'effort, pas par le prompt. Laissé seul sur un long run, il s'arrête parfois pour rendre compte — " +
    "un résumé qui annonce l'étape suivante sans la faire, une offre de continuer, des choix qui ne bloquent rien, un point d'étape parce que le tour a été long. " +
    "Le remède principal est dans les réglages livrés à côté du prompt (une consigne système qui nomme ces arrêts, posée dès le lancement, et des relances) : " +
    "le prompt ne la recopie pas, il porte seulement la règle courte du troisième mouvement, qui va dans le même sens. " +
    "Ses comptes rendus disent ce qu'il a fait, trouvé, et ce qu'il attend de l'humain ; on veut d'abord y lire ce qui attend l'humain.\n\n" +
    "FORME DU PROMPT — cinq mouvements, dans cet ordre, en phrases pleines, SANS titre ni puce ni liste numérotée :\n" +
    "1. La tâche entière, en une ou deux phrases : ce qu'on fait, sur quoi (dépôt, dossier, fichier, site nommés s'ils sont connus), " +
    "et le livrable FINI — le fichier, la branche, la page, le tableur prêt à partager, jamais un plan ni un brouillon.\n" +
    `2. « ${FINI} » puis deux à cinq critères OBSERVABLES qu'un tiers pourrait vérifier : une suite de tests qui passe, chaque élément ` +
    "d'une liste couvert, un fichier qui existe, un nombre atteint, un parcours qui réussit. Jamais « quand c'est bien », « de qualité », « propre ».\n" +
    "3. La règle de conduite, deux phrases FIXES reprises mot pour mot, selon le MODE :\n" +
    `   - SEUL, le cas par défaut (l'idée n'en dit rien, ou l'agent est lancé puis laissé travailler) : « ${CONTINUE} » puis « ${ARRET} » suivie des gestes destructeurs de CE travail, nommés.\n` +
    "   - SUIVI, seulement quand l'idée ou les réponses disent que l'utilisateur reste là et répond en cours de route (« je reste là », « on le fait ensemble », « je valide au fur et à mesure ») : " +
    `« ${INTENTION} » puis « ${DEMANDE} » suivie des gestes destructeurs de CE travail, nommés. ` +
    "Jamais la règle de continuer dans ce mode : elle est faite pour un agent seul, et la documentation dit de la laisser de côté quand quelqu'un est là pour répondre. " +
    "Le court récapitulatif de fin qu'elle recommande alors est la dernière ligne, commune aux deux modes.\n" +
    "   Jamais les deux formes dans un même prompt. Rien ne s'insère dans une phrase fixe. Si — et seulement si — l'idée ou les réponses demandent un autre arrêt, il s'écrit dans une phrase à part : « Arrête-toi aussi si … ».\n" +
    "4. Les clauses du type de tâche — celles qui s'appliquent, et SEULEMENT celles-là ; aucune si la tâche est courte et simple. " +
    "Reprends-les en les adaptant au domaine :\n" +
    CLAUSES.map((c) => `   - ${c.type} (${c.quand}) : « ${c.texte} »`).join("\n") +
    "\n   Pour le design, si l'idée ne dit rien du style, pars des habitudes que la documentation nomme elle-même : " +
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
    "Un choix que l'agent peut trancher lui-même et signaler dans son compte rendu n'est pas un arrêt ; un accès manquant est déjà couvert par « si tu ne peux pas continuer sans moi » (mode seul) ou par l'utilisateur qui répond (mode suivi). " +
    "Le « Arrête-toi aussi » n'existe que si l'utilisateur l'a demandé en toutes lettres.\n" +
    "- Les gestes destructeurs partent TOUJOURS de la base de la méthode — supprimer des données, forcer un push s'il y a un dépôt, " +
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
    "Recherche et document long vont souvent ensemble. " +
    "Plusieurs applications : seulement quand l'agent devra aller chercher dans PLUSIEURS applications ou sources connectées (mails, documents, tableurs, fiches) — " +
    "jamais pour une tâche courte à une seule source désignée, ni pour du code dans un seul dépôt ; elle n'a aucun trou et se reprend entière. " +
    "Le mode et cette clause sont indépendants : un agent seul peut traverser plusieurs applications, une conversation suivie peut n'en toucher qu'une.\n" +
    "- Rien d'autre : aucune phrase hors des cinq mouvements (« vérifie aussi… », « ne remonte pas les détails de style… »). Une tâche courte et simple n'a AUCUNE clause.\n" +
    "- Les exemples montrent la FORME. Leurs critères, leur mode, leur arrêt propre et leurs gestes destructeurs sont ceux d'une migration, d'une page et d'un point d'avancement : ne les recopie jamais.\n\n" +
    "CE QUI N'ENTRE JAMAIS : aucune consigne de réflexion (« réfléchis bien », « étape par étape », « prends le temps ») — le modèle pense déjà, " +
    "et la ligne le ralentit sans rien gagner. Aucune demande de montrer ou d'exposer son raisonnement : la réponse peut être déclinée " +
    "(catégorie de refus « extraction du raisonnement », jamais rejouée sur un autre modèle) ; si une justification est utile, demande « explique ton choix en trois phrases ». " +
    "Ni architecture, ni arborescence, ni plan imposé, ni choix de pile que l'idée n'impose pas : l'agent les tranche mieux une fois le travail commencé. " +
    "Aucun rôle ni persona (« tu es un expert… ») : la tâche suffit. Chaque instruction en trop est une décision retirée à l'agent.\n\n" +
    "LANGUE ET VOIX : français, agent tutoyé, phrases simples et directes, comme un message qu'on envoie à quelqu'un de compétent. " +
    "C'est l'utilisateur qui parle : « moi », « mon associé », « notre dépôt » — jamais « ton associé ». " +
    "Les noms concrets de l'idée (outils, dépôts, fichiers, colonnes) entrent en dur, tels qu'elle les dit — sans les préciser au-delà " +
    "(« lib/stripe-legacy », pas « le dossier lib/stripe-legacy » si l'idée ne dit pas que c'est un dossier) ; ce que l'idée ne dit pas, l'agent le tranche.\n\n" +
    `LONGUEUR : ${VISEE.lo} à ${VISEE.hi} mots, et moins de ${cap} caractères. ` +
    "Une tâche simple tient dans le bas de la fourchette : n'ajoute jamais une phrase pour atteindre une longueur.\n\n" +
    "TROIS EXEMPLES DE RÉFÉRENCE, chacun avec l'idée d'où il vient. Regarde d'où sort chaque critère : de l'idée, et de rien d'autre " +
    "(l'idée de la page ne dit rien du mobile ni des champs du formulaire : l'arrivée n'en dit rien non plus). " +
    "Regarde aussi d'où sort le mode : seul l'exemple dont l'idée dit « je reste là » est en mode suivi, et seul celui dont l'idée nomme plusieurs applications porte l'exploration large. " +
    "Reproduis la forme, la densité et la voix ; jamais leur contenu.\n" +
    "--- IDÉE : " + IDEE_REFERENCE + "\n--- PROMPT (migration longue et répétitive, agent seul : run long + sous-agents) :\n" +
    PROMPT_REFERENCE +
    "\n--- IDÉE : " + IDEE_REFERENCE_DESIGN + "\n--- PROMPT (une page créée de zéro, agent seul : design seul) :\n" +
    PROMPT_REFERENCE_DESIGN +
    "\n--- IDÉE : " + IDEE_REFERENCE_SUIVI + "\n--- PROMPT (un document tiré de plusieurs applications, utilisateur qui suit : mode suivi + plusieurs applications + document long) :\n" +
    PROMPT_REFERENCE_SUIVI +
    "\n---\n"
  );
}

/* ---------- étape 1 ----------
   Même forme que Boris — des questions — donc le même écran, sans
   branche nouvelle dans l'atelier. Ce qui est matériel ici se réduit à
   l'arrivée et à l'objet du travail — et, rarement, au mode. Tout le
   reste — le type de tâche, les clauses, les styles à exclure — se
   tranche sans demander : c'est ce que la méthode ne fait pas porter à
   l'humain.
   Le mode (seul ou suivi) ne se demande que si l'idée HÉSITE : sans
   signal, c'est un agent seul, le cas pour lequel la méthode est faite.
   Le demander à chaque fois referait la faute payée au banc du
   2026-09-23 — une question dont « tranche » serait une bonne réponse.
   Il passe après l'arrivée et l'objet, dans la même limite de deux. */
export const QUESTION_MODE =
  "Vas-tu suivre le travail pour répondre en cours de route, ou le laisser tourner seul jusqu'au bout ?";

export function etape1Instruction() {
  return (
    "ÉTAPE 1 — Ne rédige pas encore le prompt. Trois manques, et trois seulement, justifient une question.\n" +
    "(a) L'ARRIVÉE : si l'idée ne dit pas à quoi on verra que c'est fini, et qu'aucune hypothèse raisonnable ne donne un critère qu'un tiers pourrait constater, " +
    "demande-le — c'est la question la plus importante, elle passe avant toute autre (« À quoi verras-tu que c'est réussi : un score, un parcours qui marche, une liste couverte ? »).\n" +
    "(b) L'OBJET : si l'idée suppose un existant (un site, un dépôt, une liste, un fichier, une source) sans dire où il est, demande où.\n" +
    "(c) LE MODE, en dernier : seulement si l'idée hésite vraiment entre un agent laissé seul et un utilisateur qui suit et répond — elle mêle les deux signaux " +
    `(« dans l'app Claude » pour un travail de plusieurs heures, « avec moi » et « pendant que je dors »). Demande alors, fermé : « ${QUESTION_MODE} ». ` +
    "Si l'idée n'en dit rien, c'est un agent seul : ne demande pas. Si elle le dit clairement, ne demande pas non plus.\n" +
    "Ne demande JAMAIS : ce qui se lit dans l'existant une fois qu'on sait où il est (framework, pile, structure) ; le contenu que l'agent remplit en provisoire " +
    "(textes, prix, noms de formules) ; le format du livrable ; sur quoi se concentrer ; l'accès (l'agent le règle, ou s'arrête s'il ne peut pas) ; le type de tâche, les clauses, les styles, les gestes destructeurs ; " +
    "un détail que l'agent tranche et signale dans son compte rendu. Test : si « je ne sais pas, tranche » serait une réponse acceptable, la question est superflue. " +
    "Si l'idée donne déjà l'arrivée et l'objet, et ne laisse pas hésiter sur le mode, ne pose aucune question.\n" +
    "Une question par manque, qui se répond en quelques mots, fermée si possible. " +
    'Réponds UNIQUEMENT avec ce JSON, sans autre texte : {"questions":["..."]} — 2 questions maximum, tableau vide si l\'idée suffit.'
  );
}

/* La relecture avant de rendre. Le billet d'origine la recommande pour
   tout long document (« check this deck for anything that contradicts
   itself ») ; la documentation ne la cite pas et ne la contredit pas ;
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
    `« ${FINI} » avec des critères observables, la règle de conduite du mode reprise mot pour mot (seul par défaut ; suivi seulement si l'idée ou les réponses le disent ; jamais les deux), seulement les clauses qui s'appliquent, ` +
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
        "coupe les redites et les clauses qui ne s'appliquent pas, garde la tâche, l'arrivée et la règle de conduite entières. "
      : check.mots < MOTS_MIN
        ? `Tu es à ${check.mots} mots : il manque des mouvements. Vise ${cible} mots. `
        : "";
  /* La réparation redemande les phrases DU MODE que la tentative avait
     pris : lui redicter celles de l'agent seul ferait basculer une
     conversation suivie à la première faute de longueur. Mode mêlé ou
     illisible : les deux formes, et l'ordre d'en garder une. */
  const seul = `« ${CONTINUE} » puis « ${ARRET} » mot pour mot, suivie des gestes nommés`;
  const suivi = `« ${INTENTION} » puis « ${DEMANDE} » mot pour mot, suivie des gestes nommés`;
  const conduite =
    check.mode === "suivi"
      ? suivi
      : check.mode === "seul"
        ? seul
        : `selon le mode, UNE seule des deux formes : agent seul, ${seul} ; utilisateur qui suit et répond, ${suivi}`;
  return (
    `ASSERTION ÉCHOUÉE : ${check.fails.join(" ; ")}. ` +
    longueur +
    "Régénère le prompt COMPLET, texte brut uniquement, les cinq mouvements dans l'ordre, en phrases pleines, sans titre ni puce : " +
    `la tâche entière, « ${FINI} » et des critères observables, ${conduite}, ` +
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
  /* Mis à jour le 2026-09-25, PAR CLÉ : « arrets » et « clauses » gardent
     leur clé (aucune n'est dans une autre grille) et disent désormais les
     deux modes et la clause « plusieurs applications ». */
  { cle: "arrets", nom: "Le mode et ses arrêts", quoi: "le mode correspond à l'idée — agent SEUL par défaut : continuer sans demander quand une étape n'a pas besoin de l'humain, les points d'avancement dans le même message que l'action suivante, ne s'arrêter que bloqué ou avant un geste destructeur NOMMÉ de ce domaine ; utilisateur qui SUIT et répond (seulement si l'idée ou les réponses le disent) : une ligne d'intention avant la première action et son accord demandé avant un geste destructeur NOMMÉ, sans règle de continuer ; jamais les deux formes" },
  { cle: "clauses", nom: "Les clauses du type", quoi: "celles qui s'appliquent et seulement elles : liste de tâches dans un fichier pour un run long, sous-agents dont on vérifie les preuves et un seul tableau pour un audit, styles exclus nommément pour du design, ce qui n'a pas pu être confirmé pour une recherche, ce qui bloquerait la fusion pour une revue, contradictions internes pour un document, exploration large de toutes les applications avant de rien modifier quand la tâche en traverse plusieurs (jamais pour une tâche courte à une seule source)" },
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

/* Le fil reconstruit : premier tour commun aux quatre techniques (idée
   enveloppée, bloc en cache — harnais.js). */
export function baseConvoFor({ idea, prompt, limit, id }) {
  return conversationDe({ meta: buildMeta(limit), etiquette: "IDÉE", idee: idea, id, prompt });
}
