/* ================================================================
   LES TECHNIQUES — le registre, et le seul endroit qui sait qu'il y en
   a plus d'une.

   L'atelier n'a longtemps connu qu'une méthode, celle de Boris : tout
   le reste du code la nommait en clair — huit sections, plafond 3950,
   « # SORTIE », la grille du juge. Ajouter une seconde technique en
   semant des `if (technique === …)` dans l'atelier aurait garanti la
   panne classique : un chemin oublié qui applique la règle de l'une au
   prompt de l'autre, silencieusement — un vérificateur qui cherche
   huit sections dans un prompt de 160 mots dit « à refaire » sans que
   rien soit à refaire.

   Chaque technique expose donc EXACTEMENT le même contrat, et l'atelier
   ne manipule plus qu'un objet `T`. Ajouter une troisième technique un
   jour, c'est ajouter un fichier et une ligne ici — pas relire l'écran.

   Le contrat, dans l'ordre où l'atelier s'en sert :
     id, nom, resume, quand      — l'identité, montrée au choix
     limiteDefaut/Min/hardLimit  — la longueur, et son plafond dur
     capLimit(n)                 — rabat un réglage dans les bornes
     buildMeta(limit)            — la méthode donnée au modèle
     etape1                      — { cle, titre, instruction() }
     etape2Instruction(ctx)      — écrire le prompt
     verifyPrompt(text, limit)   — l'oracle { pass, fails, count, over, limit }
     repairInstruction(c,l,n)    — ce qu'on redemande quand ça échoue
     choisirMeilleure(tries)     — laquelle des tentatives on garde
     CRITERES + auditInstruction — le juge
     auditApplyInstruction(...)  — appliquer l'audit
     correctionInstruction(...)  — une correction demandée à la main
     baseConvoFor({...})         — reconstruire le fil après rechargement
   ================================================================ */

import * as boris from "./meta.js";
import * as gauntlet from "./gauntlet.js";

/* ---------- méthode Boris ----------

   Les trois instructions d'étape vivaient dans `App.jsx`, en clair au
   milieu du JSX. Elles descendent ici sans changer d'un caractère :
   c'est la méthode, et la méthode n'a jamais eu à être dans l'écran.
   Le vérificateur les importe désormais au lieu d'en garder une copie —
   une copie d'instruction est une instruction qui vieillit toute
   seule. */

const BORIS = {
  id: "boris",
  nom: "Méthode Boris",
  court: "Boris",
  resume: "Le mandat d'un agent qui fait tourner un produit et dérive son travail de là où ça casse.",
  quand: "Tu confies une construction longue : une app, un ERP, un algo, un service. Prompt long et structuré, huit sections, l'oracle est dedans.",
  unite: "car.",
  sortie: "un prompt de huit sections",
  /* Où vit SA limite dans les réglages : les deux techniques n'ont ni le
     même ordre de grandeur ni le même plafond, et un curseur partagé
     ferait suivre à l'une le réglage choisi pour l'autre. */
  cleReglage: "charLimit",

  hardLimit: boris.HARD_LIMIT,
  limiteMin: 1500,
  limiteDefaut: 3900,
  capLimit: boris.capLimit,
  fenetre: (limit) => boris.targetWindow(limit),

  buildMeta: boris.buildMeta,

  etape1: {
    cle: "questions",
    titre: "Questions matérielles",
    instruction: () =>
      "ÉTAPE 1 — Avant d'écrire le prompt, détermine s'il manque une information qui changerait MATÉRIELLEMENT le terrain, l'escalade ou la sortie. " +
      "Tout ce qui peut être tranché par une hypothèse raisonnable doit l'être, sans question. " +
      'Réponds UNIQUEMENT avec ce JSON, sans autre texte : {"questions":["..."]} — 3 questions maximum, tableau vide si rien de matériel ne manque.',
  },

  etape2Instruction: ({ limit, questions, answers }) => {
    const fenetre = boris.targetWindow(limit);
    let instruction =
      "ÉTAPE 2 — Génère MAINTENANT le system prompt final. Texte brut uniquement : pas de backticks, pas de commentaire, pas de préambule. " +
      `Huit sections '# EN MAJUSCULES', moins de ${limit} caractères, ` +
      `vise ${fenetre.lo} à ${fenetre.hi}.`;

    if (answers) {
      const lines = (questions || [])
        .map(
          (q, i) =>
            `Q${i + 1} : ${q}\nR : ` +
            (answers[i] ||
              "(sans réponse — tranche par hypothèse raisonnable et signale-la dans le dépôt)")
        )
        .join("\n");
      instruction = `RÉPONSES :\n${lines}\n\n${instruction}`;
    }
    return instruction;
  },

  verifyPrompt: boris.verifyPrompt,
  /* `undefined` = le défaut de `generate.js`, qui EST celui de Boris.
     Écrire une copie ici en ferait deux à tenir d'accord. */
  repairInstruction: undefined,
  choisirMeilleure: undefined,

  CRITERES: boris.CRITERES,
  auditInstruction: boris.auditInstruction,

  auditApplyInstruction: (corrections, limit) => {
    const fenetre = boris.targetWindow(limit);
    return (
      "ÉTAPE 4 — Applique chacune de ces corrections au prompt ci-dessus :\n" +
      corrections +
      "\nRégénère le prompt COMPLET corrigé (les huit sections jusqu'à # SORTIE incluse), texte brut uniquement, " +
      `sans backticks ni commentaire, moins de ${limit} caractères, ` +
      `vise ${fenetre.lo} à ${fenetre.hi}.`
    );
  },

  correctionInstruction: boris.correctionInstruction,
  baseConvoFor: boris.baseConvoFor,

  /* Les exemples des champs vides. Ils appartiennent à la technique et
     pas à l'écran : laissés en dur, ils proposaient une app d'échecs et
     citaient « TON PRODUIT » à quelqu'un venu écrire une page de tarifs
     jugée contre Stripe — un exemple hors sujet se lit comme « tu t'es
     trompé d'outil ». */
  exempleIdee:
    "Exemple : une app d'échecs en ligne — parties en direct, classement Elo, puzzles quotidiens ; l'humain ne valide que les mises en production…\n\n" +
    "Ou : un algo de ML qui prédit les ruptures de stock d'un e-commerce depuis l'historique de ventes, réentraîné chaque nuit, avec un tableau de bord de dérive…",
  exempleContraintes:
    "Technologies imposées, système d'enregistrement, actions engageantes propres au domaine, critère de sortie souhaité…",
  exempleCorrection:
    "Ex. : durcis l'escalade, cite le nom du dépôt dans TON PRODUIT, allège la VÉRIFICATION…",

  /* L'accueil décrit ce que la technique ARMÉE va produire. Le texte était
     en dur et ne parlait que de Boris : « une question ne t'est posée que
     si… » est faux au gantelet, où l'on choisit toujours une barre. */
  bandeau: "But — Garde-fous — Vérificateur — Sortie",
  accroche:
    "Raconte ce que tu veux confier, comme tu l'expliquerais à quelqu'un à qui tu donnes le travail. L'atelier en écrit le mandat : ce qu'il doit obtenir, ce qu'il n'a pas le droit de faire, à quoi on verra que c'est réussi, et quand il doit s'arrêter pour te demander. Une question ne t'est posée que si la réponse change vraiment le résultat.",
};

/* ---------- boucle du gantelet ---------- */

const GAUNTLET = {
  id: "gauntlet",
  nom: "Boucle du gantelet",
  court: "Gantelet",
  resume: "Le mandat d'un agent qui vise une référence réelle et recommence jusqu'à la battre.",
  quand: "Tu vises une qualité, pas un périmètre : une page, un texte, un outil, une analyse. Prompt d'un seul tenant, sans section, l'oracle est DEHORS — une chose qui existe déjà et qui est indiscutablement bonne.",
  unite: "car.",
  /* La longueur annoncée se DÉDUIT de la fenêtre : écrite à la main,
     elle a menti dès le 2026-08-26, où la visée est passée de 170 à
     335 mots sans que cette ligne bouge. */
  sortie: `un prompt d'un seul tenant, autour de ${Math.round((gauntlet.VISEE.lo + gauntlet.VISEE.hi) / 2)} mots`,
  cleReglage: "charLimitGauntlet",
  credit: "Technique de Matt Shumer, empaquetée en skill par RoboNuggets (CC BY 4.0).",

  hardLimit: gauntlet.HARD_LIMIT,
  limiteMin: gauntlet.LIMITE_MIN,
  limiteDefaut: gauntlet.LIMITE_DEFAUT,
  capLimit: gauntlet.capLimit,
  fenetre: () => ({ lo: gauntlet.VISEE.lo, hi: gauntlet.VISEE.hi }),

  buildMeta: gauntlet.buildMeta,

  etape1: {
    cle: "barres",
    titre: "La barre",
    instruction: gauntlet.etape1Instruction,
  },

  etape2Instruction: ({ limit, barre, mesure }) =>
    gauntlet.etape2Instruction({ barre, mesure, limit }),

  verifyPrompt: gauntlet.verifyPrompt,
  repairInstruction: gauntlet.repairInstruction,

  /* Pourquoi le gantelet ne peut pas garder le choix par défaut : celui
     de Boris rend la tentative la plus COURTE parmi celles dont seule la
     longueur pèche. Ici une tentative peut pécher par le bas — 80 mots,
     trois mouvements manquants — et « la plus courte » choisirait
     précisément la plus mutilée. On garde donc la plus proche de la
     fenêtre visée, ce qui redonne la plus courte quand toutes débordent. */
  choisirMeilleure: (tries) => {
    const green = tries.find((t) => t.check.pass);
    if (green) return green;
    const cible = (gauntlet.VISEE.lo + gauntlet.VISEE.hi) / 2;
    const sains = tries.filter((t) =>
      t.check.fails.every((f) => f.startsWith("longueur"))
    );
    const pool = sains.length ? sains : tries;
    const ecart = (t) => Math.abs((t.check.mots ?? gauntlet.countMots(t.text)) - cible);
    return pool.reduce((a, b) => (ecart(b) < ecart(a) ? b : a));
  },

  CRITERES: gauntlet.CRITERES,
  auditInstruction: gauntlet.auditInstruction,
  auditApplyInstruction: gauntlet.auditApplyInstruction,
  correctionInstruction: gauntlet.correctionInstruction,
  baseConvoFor: gauntlet.baseConvoFor,

  exempleIdee:
    "Exemple : une page de tarifs pour mon logiciel de facturation — claire, rassurante, sans jargon, aussi bonne que celle de Stripe…\n\n" +
    "Ou : un article de 2000 mots qui explique les bases de données vectorielles à des non-informaticiens, aussi limpide qu'un billet de Julia Evans…",
  exempleContraintes:
    "La référence à battre si tu l'as déjà en tête, la moitié mesurable (temps de chargement, nombre de mots, score), les outils imposés…",
  exempleCorrection:
    "Ex. : change la barre pour la page mobile, ajoute le temps de chargement comme moitié mesurable, coupe la page d'avancement…",

  bandeau: "But — Barre — Critique — Victoire",
  accroche:
    "Dis ce que tu veux obtenir et à quelle hauteur. L'atelier te propose des références réelles à battre, tu en choisis une, et il écrit le mandat : aller chercher cette chose-là, se comparer à elle à l'aveugle, et recommencer tant qu'on ne l'a pas dépassée.",
};

export const TECHNIQUES = [BORIS, GAUNTLET];

export const DEFAULT_TECHNIQUE = BORIS.id;

/* Un identifiant inconnu — une entrée de bibliothèque écrite avant que la
   seconde technique existe, un import venu d'ailleurs — retombe sur Boris.
   Jamais sur `undefined` : l'atelier lit `T.verifyPrompt` sans garde, et
   une technique absente casserait l'écran au lieu de dégrader. */
export const techniqueOf = (id) =>
  TECHNIQUES.find((t) => t.id === id) || TECHNIQUES.find((t) => t.id === DEFAULT_TECHNIQUE);

export const estTechnique = (id) => TECHNIQUES.some((t) => t.id === id);
