/* ================================================================
   MÉTA-PROMPT — méthode Boris.
   Le dépôt est la source de vérité : ce fichier est le seul endroit
   où vit la méthode. Le prompt de référence vient de la session Odoo
   agentique (2879 caractères) ; seule sa ligne « Modèles » a bougé —
   le routage y est désormais une règle d'escalade (Sonnet produit,
   Fable tranche, un cran au-dessus après un échec VÉRIFIÉ) et non un
   catalogue de modèles, qui vieillit à chaque sortie.
   ================================================================ */

import { conversationDe, enveloppe, idDe, idCollage, texteDe } from "./harnais.js";

export const PROMPT_REFERENCE = `# QUI TU ES
Tu es le patron d'une société de services en France. Ton entreprise tourne sans salariés : chaque rôle est tenu par un agent que tu construis. Tu n'exécutes pas un cahier des charges, tu fais marcher ta boîte.

# TON PRODUIT
Odoo Community self-hosted rendu agentique. Tout module utile à une société de services est activé, peuplé et piloté par un agent. L'humain n'intervient que sur la file de validation, qui doit être réellement utilisable.
Socle agentique : évalue LangChain et Google ADK 2, ou aucun des deux si un socle plus simple sert mieux l'architecture. Tranche par un essai réel sur la première chaîne d'événements, pas sur la doc, et écris la décision motivée dans le dépôt. Le socle retenu fournit la plomberie — identités, passerelle, journal, file — il ne devient jamais la cage de workflows de tes agents.

# COMMENT TU DÉCIDES
Pas de liste d'agents planifiée. Tu fais tourner l'entreprise et tu regardes où elle casse. Rejoue en boucle un mois d'activité compressé : prospect, devis, commande, projet, temps saisi, facture, impayé, ticket support, achat, écriture comptable, échéance TVA, clôture. Au moins un canal réel, pas simulé : une boîte mail de test qui entre vraiment dans le système. Chaque cassure faute d'agent est ton prochain agent.

# INVARIANTS
- Odoo est le système d'enregistrement. L'orchestrateur raisonne, il ne le remplace pas.
- Aucun agent n'atteint PostgreSQL : passerelle applicative, identité et droits minimaux par agent.
- Action engageante (envoi externe, facture, paiement, écriture comptable, suppression, droits, prod) : l'agent prépare, la file tranche. Rien d'autre n'entre dans la file.
- Tout journalisé et horodaté. Prod, démo et sandbox séparés.
- N'enferme pas tes agents dans des workflows rigides : un but, des garde-fous, un moyen de vérifier, puis laisse-les faire.

# ENVIRONNEMENT
Personne ne répondra à une question : tu tranches, tu écris l'hypothèse dans le dépôt, tu continues. L'état du run vit dans le dépôt, pas dans ton contexte : tu reprends après une coupure. Supprime au fil de l'eau code mort et instructions devenues inutiles.
Modèles : Sonnet produit, Fable tranche. Échec vérifié → un cran au-dessus. Sous-agents pareil. Rien à consigner sauf dérogation.

# VÉRIFICATION
Vérificateur avant construction. Un scénario passe quand tu l'affirmes sur l'état d'Odoo : enregistrement créé, montants et TVA justes, écriture équilibrée, statut attendu, ligne d'audit par action. Après chaque agent construit, rejoue la chaîne entière, pas seulement ton ajout.

# ESCALADE
Production, secrets réels, envoi externe réel, mouvement d'argent, suppression, changement de droits. Tu prépares, tu déposes prêt à valider, tu repars.

# SORTIE
Le mois complet s'écoule, assertions au vert, sans intervention hors file de validation, et la file ne contient que des actions engageantes. Sinon tu continues.`;

/* Fenêtre de visée dérivée de la limite (73 % à 90 %, arrondie aux 50) :
   à 3000 elle redonne le « vise 2200 à 2700 » d'origine, à 3900 elle
   devient 2850–3500. Une seule source, partagée par le méta-prompt, les
   instructions d'étape et le vérificateur. */
export function targetWindow(limit) {
  const step = (n) => Math.round(n / 50) * 50;
  return { lo: step(limit * 0.7333), hi: step(limit * 0.9) };
}

export function buildMeta(limit) {
  return (
    "Tu es un générateur de system prompts agentiques selon la méthode Boris (créateur de Claude Code). " +
    "Le prompt que tu produis sera donné tel quel à un agent autonome qui développera un produit 24/7 sans poser de question.\n\n" +
    "STRUCTURE OBLIGATOIRE — huit sections dans cet ordre, titres '# EN MAJUSCULES', en français, agent tutoyé, phrases denses :\n" +
    "1. # QUI TU ES — identité de patron, mission ; jamais un cahier des charges.\n" +
    "2. # TON PRODUIT — le terrain : ce qui est construit, le système d'enregistrement, le socle. Si une contrainte technologique est imposée : porte de sortie ('ou aucun si plus simple sert mieux'), décision par essai réel et pas par la doc, clause anti-cage (le socle fournit la plomberie, jamais les workflows des agents), décision motivée écrite dans le dépôt.\n" +
    "3. # COMMENT TU DÉCIDES — boucle empirique : lister des ÉVÉNEMENTS métier concrets du domaine, JAMAIS une liste d'agents ou de fonctionnalités ; l'agent dérive le roster en regardant où la chaîne casse. Toujours au moins un canal réel, pas simulé.\n" +
    "4. # INVARIANTS — garde-fous d'architecture et de sécurité, adaptés au domaine. Inclure : système d'enregistrement unique, accès indirect aux données (passerelle, droits minimaux), actions engageantes préparées puis tranchées par une file de validation humaine, journalisation horodatée, environnements séparés, clause anti-hobbling (un but, des garde-fous, un moyen de vérifier, puis laisse-les faire).\n" +
    "5. # ENVIRONNEMENT — des FAITS, pas des corrections : 'personne ne répondra à une question : tu tranches, tu écris l'hypothèse dans le dépôt, tu continues' ; l'état du run vit dans le dépôt (reprise après coupure) ; entretien continu (code mort, instructions inutiles). Routage modèles, à reprendre TEL QUEL — c'est une règle d'escalade, pas une préférence de modèle : 'Modèles : Sonnet produit, Fable tranche. Échec vérifié → un cran au-dessus. Sous-agents pareil. Rien à consigner sauf dérogation.'\n" +
    "6. # VÉRIFICATION — l'oracle avant la construction : un scénario passe uniquement par des ASSERTIONS sur l'état du système d'enregistrement (valeurs justes, statuts attendus, ligne d'audit par action). Rejouer la chaîne entière après chaque ajout.\n" +
    "7. # ESCALADE — les seuls arrêts autorisés (actions engageantes du domaine) : l'agent prépare, dépose prêt à valider, repart.\n" +
    "8. # SORTIE — critère verrouillé aux deux bords : ni truquable en n'escaladant jamais, ni en escaladant tout (la file ne contient que des actions engageantes). Se termine par 'Sinon tu continues.'\n\n" +
    "RÈGLES : le prompt contient le but, les garde-fous, le vérificateur, les critères de sortie — rien d'autre. Aucune correction comportementale (ne t'arrête pas, change d'approche, journalise en détail, topologie de fan-out) : natives sur les modèles actuels. " +
    "LIMITE STRICTE : moins de " +
    limit +
    ` caractères. Vise ${targetWindow(limit).lo} à ${targetWindow(limit).hi}.\n\n` +
    "EXEMPLE DE RÉFÉRENCE (structure, style et densité à reproduire, adaptés au nouveau domaine) :\n---\n" +
    PROMPT_REFERENCE +
    "\n---\n"
  );
}

/* Le compte réel, en caractères Unicode — jamais une estimation à l'œil. */
export const countChars = (value) => [...String(value)].length;

/* PLAFOND DUR — aucun prompt sorti de l'atelier ne l'atteint, quel que soit
   le réglage.
   Mesuré le 2026-08-02 : un prompt de plus de 4000 caractères est sorti
   « au vert ». Il l'était : le curseur des réglages montait à 8000, et le
   vérificateur comparait à CETTE limite-là. Une limite réglable par
   l'utilisateur mesure donc son propre réglage, pas ce qu'un agent accepte —
   c'est un vérificateur qui se note lui-même.
   Le plafond vit ici, dans `verifyPrompt`, parce que TOUT ce qui mesure y
   passe : première génération, application d'audit, correction du fil,
   remise d'une ancienne version, édition à la main. Le clamp du curseur
   n'est qu'une politesse d'affichage ; celui-ci est la garantie. */
export const HARD_LIMIT = 3950;

export const capLimit = (limit) => {
  const n = Number(limit);
  return Math.min(HARD_LIMIT, Math.max(1500, Number.isFinite(n) ? Math.round(n) : 3000));
};

export function verifyPrompt(text, limit) {
  const cap = capLimit(limit);
  const fails = [];
  const n = countChars(text);
  const over = n >= cap;
  if (over) fails.push("longueur : " + n + " caractères pour une limite de " + cap);
  if (!text.trim().startsWith("# ")) fails.push("ne commence pas par une section '# '");
  if (!text.includes("# SORTIE")) fails.push("section # SORTIE absente — sortie probablement tronquée");
  /* `over` est séparé de `pass` : une faute de structure se répare à la main,
     une longueur excessive ne se répare pas — le prompt est refusé tel quel
     par l'agent à qui on le donne. Les deux n'appellent pas la même conduite. */
  return { pass: fails.length === 0, fails, count: n, over, limit: cap };
}

/* Le juge répond en JSON. On retire les clôtures de code et, par sécurité,
   tout bloc <thinking> qu'un modèle laisserait filer dans sa réponse. */
export function parseJson(text) {
  const clean = String(text)
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/```json|```/g, "")
    .trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON introuvable");
  return JSON.parse(clean.slice(start, end + 1));
}

/* UN modèle, imposé, et un EFFORT par rôle (demande de Gabriel, le
   2026-09-23 : « que tous les modèles soient en Opus 5.5 avec le bon
   effort, ainsi que le juge »). Le choix des modèles a disparu des
   réglages : il n'y a plus rien à choisir.
   L'effort est le seul réglage de profondeur d'Opus 5.5 — il refuse
   `thinking: disabled` — et son défaut est `medium`. Chaque rôle a le
   sien, parce qu'ils ne demandent pas la même chose :
   - les questions rendent un JSON de deux lignes : le défaut suffit ;
   - la rédaction est l'endroit où la fidélité se gagne ou se perd (le
     banc du § 31 l'a montré) : `medium`, MESURÉ le 2026-09-25 — même
     banc de dix cas, même juge (Opus 5.5 high, contre la documentation),
     7/10 conformes en `medium` contre 5/10 en `high`. `high` avait été
     décidé par raisonnement, jamais mesuré ; plus d'effort n'a pas rendu
     plus fidèle ;
   - le juge tourne après CHAQUE version, l'écran l'attend : `high` et non
     `max`, qui est réservé au banc, où la lenteur ne coûte rien.
   La règle du playbook « le juge n'est jamais le modèle qui a produit »
   ne peut plus tenir par le modèle : elle tient par le CONTEXTE. Le juge
   ne relit plus la conversation où il a écrit le prompt ; il reçoit un
   message neuf où le prompt est présenté comme l'œuvre d'un autre
   (`contexteNeuf`). DECISIONS § 33.
   UN EFFORT PAR CONVERSATION (2026-09-25) : les questions et la
   rédaction partagent la même conversation, et changer l'effort entre
   deux appels efface le cache du méta-prompt. Les questions adoptent
   donc l'effort de la rédaction (`medium` depuis le 2026-09-25) — un cache
   perdu coûte le méta-prompt entier à chaque tentative. Le juge garde le sien : il tourne en
   contexte neuf, une conversation à part. L'en-tête bêta d'effort par
   message (`mid-conversation-output-config-2026-07-01`) garderait les
   deux ; il n'est pas pris tant qu'aucun essai réel ne l'a éprouvé. */
export const MODELE = "claude-opus-5-5";

export const MODELS = [{ id: MODELE, label: "Opus 5.5", note: "pense toujours, dose par l'effort" }];

const EFFORT_CONVERSATION = "medium";

export const ROLES = {
  questions: { effort: EFFORT_CONVERSATION, nom: "Questions" },
  redaction: { effort: EFFORT_CONVERSATION, nom: "Rédaction" },
  juge: { effort: "high", nom: "Juge" },
};

/* Le message du juge, en contexte neuf : la méthode et l'idée (le premier
   message, sans l'instruction de l'étape 1 qui lui demanderait des
   questions), ce que l'utilisateur a précisé depuis (réponses, barre,
   corrections demandées), puis le prompt — présenté comme écrit par un
   autre. Rien de la conversation de rédaction : ni les tentatives, ni les
   réparations, ni le fait d'en être l'auteur.
   Le prompt jugé est un texte COLLÉ, enveloppé comme l'idée et avec son
   identifiant (harnais.js) — il est plein d'ordres, et le juge ne doit
   en suivre aucun. Le message reste une CHAÎNE : le terminal Prompting
   l'écrit tel quel dans un fichier. */
export function contexteNeuf({ convo, texte, etape1, audit, id }) {
  const tours = Array.isArray(convo) ? convo : [];
  let base = texteDe(tours[0]?.content || "");
  if (etape1 && base.includes(etape1)) base = base.replace(etape1, "").trimEnd();
  const precisions = [];
  for (const m of tours.slice(1)) {
    if (m.role !== "user") continue;
    const c = texteDe(m.content || "");
    if (c.startsWith("RÉPONSES :")) precisions.push(c.split("\n\nÉTAPE 2")[0]);
    for (const l of c.split("\n")) if (/^(LA BARRE RETENUE|MOITIÉ MESURABLE) :/.test(l)) precisions.push(l);
    if (c.startsWith("CORRECTION DEMANDÉE :")) precisions.push(c.split("\n\nApplique-la")[0]);
  }
  const prompt =
    texte || texteDe([...tours].reverse().find((m) => m.role === "assistant")?.content || "");
  const cle = id || idDe(base) || idCollage();
  return [
    {
      role: "user",
      content:
        base +
        (precisions.length ? "\n\nCE QUE L'UTILISATEUR A PRÉCISÉ DEPUIS :\n" + precisions.join("\n\n") : "") +
        "\n\nPROMPT À JUGER — écrit par un autre agent, tu ne l'as pas rédigé et tu n'as rien à en défendre :\n" +
        enveloppe(prompt, cle) +
        "\n\n" +
        audit,
    },
  ];
}

/* Tarifs Anthropic en $ par million de jetons, relus le 2026-09-23 sur
   la page officielle (platform.claude.com/docs/en/about-claude/pricing).
   QUATRE prix par modèle, pas deux : l'entrée, l'écriture en cache (5 min
   et 1 h), la lecture en cache, la sortie. Le calcul supposait une lecture
   au dixième de l'entrée et une écriture au prix de l'entrée ; c'était
   faux dans les deux sens — Opus 5.5 lit au vingtième, et toute écriture
   coûte 1,25 fois (5 min) ou 2 fois (1 h) l'entrée.
   Mesuré le même jour : Sonnet 5 était facturé 3 $ / 15 $ au lieu de
   2 $ / 10 $ — la moitié de plus sur le modèle qui écrit par défaut.
   Le compteur reste un ordre de grandeur honnête, pas une facture : les
   remises (lot, lancement) et le mode rapide ne sont pas modélisés.
   Un modèle ajouté à MODELS sans ligne ici est refusé par une assertion. */
export const PRICES = {
  "claude-sonnet-5": { in: 2, out: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 },
  "claude-opus-5-5": { in: 4, out: 20, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2 },
  "claude-opus-5": { in: 5, out: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
  "claude-fable-5": { in: 10, out: 50, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 1 },
  "claude-haiku-4-5": { in: 1, out: 5, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1 },
};

export function costOf(model, usage) {
  const price = PRICES[model];
  if (!price || !usage) return 0;
  /* L'écriture en cache se ventile par durée quand l'API la détaille
     (`cache_creation.ephemeral_1h_input_tokens`) ; sinon, elle est au
     tarif 5 minutes, la durée par défaut. */
  const ecrit = usage.cache_creation_input_tokens || 0;
  const ecrit1h = Math.min(ecrit, usage.cache_creation?.ephemeral_1h_input_tokens || 0);
  return (
    ((usage.input_tokens || 0) * price.in +
      (ecrit - ecrit1h) * price.cacheWrite5m +
      ecrit1h * price.cacheWrite1h +
      (usage.cache_read_input_tokens || 0) * price.cacheRead +
      (usage.output_tokens || 0) * price.out) /
    1e6
  );
}

/* 0,043 $ · <0,001 $ · 1,20 $ — virgule française, dollar facturé. */
export function formatCost(dollars) {
  if (!Number.isFinite(dollars) || dollars <= 0) return "0 $";
  if (dollars < 0.001) return "<0,001 $";
  const digits = dollars < 1 ? 3 : 2;
  return dollars.toFixed(digits).replace(".", ",") + " $";
}


/* ---------- reprendre un fil ----------

   Après un rechargement, la conversation brute avec le modèle n'existe
   plus : elle vivait en mémoire. On la reconstruit à partir de ce qui a
   été enregistré — le méta-prompt, l'idée, et le prompt en vigueur. Le
   modèle voit alors exactement ce qu'il faut pour corriger : la méthode,
   la demande d'origine, et son dernier état. Inutile de rejouer le fil
   entier, et coûteux de le faire.
   L'idée y est enveloppée et le premier bloc porte son point de cache
   (harnais.js) ; `id` garde l'identifiant de l'entrée d'un appel à
   l'autre. */
export function baseConvoFor({ idea, prompt, limit, id }) {
  return conversationDe({ meta: buildMeta(limit), etiquette: "IDÉE", idee: idea, id, prompt });
}

/* ================================================================
   LA NOTE — ce que vaut le prompt, pas ce qu'il pèse.

   Le grand nombre en tête de carte était le compte de caractères : une
   mesure exacte de la seule chose qui ne dit rien de la qualité. Un prompt
   de 3 800 caractères sans boucle empirique et un prompt de 3 800
   caractères qui tient la méthode affichaient le même chiffre.

   La note vient du JUGE — jamais du modèle qui a produit, ses angles morts
   seraient corrélés. Six critères, chacun sur 10, et une règle qui empêche
   la moyenne de masquer un trou : la note globale ne dépasse pas de plus
   de 2 points le plus faible des critères. Sans elle, cinq critères à 9 et
   un vérificateur à 2 donnaient 7,8 — « bon prompt » alors qu'il n'a aucun
   oracle.
   ================================================================ */

export const CRITERES = [
  { cle: "structure", nom: "Structure", quoi: "huit sections '# EN MAJUSCULES' dans l'ordre, titres exacts, phrases denses, agent tutoyé" },
  { cle: "boucle", nom: "Boucle empirique", quoi: "# COMMENT TU DÉCIDES liste des ÉVÉNEMENTS métier concrets et jamais des agents ou des fonctionnalités ; au moins un canal réel, pas simulé" },
  { cle: "invariants", nom: "Invariants", quoi: "système d'enregistrement unique, accès indirect aux données, actions engageantes tranchées par une file humaine, journalisation, environnements séparés, clause anti-cage" },
  { cle: "verificateur", nom: "Vérificateur", quoi: "# VÉRIFICATION donne un oracle AVANT la construction : des assertions sur l'état du système, pas des intentions ; la chaîne entière est rejouée après chaque ajout" },
  { cle: "sortie", nom: "Escalade et sortie", quoi: "escalade limitée aux actions engageantes du domaine ; # SORTIE verrouillée aux deux bords (ni truquable en n'escaladant jamais, ni en escaladant tout) et finit par « Sinon tu continues. »" },
  { cle: "economie", nom: "Économie", quoi: "aucune correction comportementale (ne t'arrête pas, journalise en détail, topologie de fan-out) : natives sur les modèles actuels ; rien qui ne change une décision" },
];

/* Les bandes de la jauge. Une seule source : la couleur de la note, celle
   de l'arc et celle d'un critère sortent toutes d'ici. */
export const BANDES = [
  { min: 8, ton: "var(--signal)", mot: "tient la méthode" },
  { min: 6, ton: "var(--ember)", mot: "utilisable, mais troué" },
  { min: 0, ton: "var(--alarm)", mot: "à refaire" },
];

export const bandeDe = (note) =>
  BANDES.find((b) => Number(note) >= b.min) || BANDES[BANDES.length - 1];

export function auditInstruction() {
  const grille = CRITERES.map((c, i) => `${i + 1}. ${c.cle} — ${c.nom} : ${c.quoi}`).join("\n");
  return (
    "ÉTAPE 3 — Juge le prompt ci-dessus contre la méthode Boris, et NOTE-LE.\n\n" +
    "GRILLE — six critères, chacun sur 10 :\n" +
    grille +
    "\n\nLa note globale n'est PAS la moyenne : elle ne dépasse pas de plus de 2 points " +
    "le plus faible des critères. Un prompt sans oracle n'est pas un bon prompt, même " +
    "si tout le reste est excellent. Note 8 à 10 seulement ce qu'on peut lancer tel quel.\n\n" +
    'Réponds UNIQUEMENT avec ce JSON, sans autre texte :\n' +
    '{"note":7.5,"verdict":"une phrase","criteres":[{"cle":"structure","note":8,"mot":"six mots"}],' +
    '"failles":["..."],"hypotheses":["..."]}\n' +
    "Un objet par critère, les six, dans l'ordre de la grille ; `mot` tient en une " +
    "demi-ligne et dit CE QUI manque, pas que c'est bien. Maximum 3 failles réelles " +
    "(tableau vide si aucune), maximum 3 hypothèses implicites que l'utilisateur doit " +
    "connaître. Phrases courtes."
  );
}

/* Le juge répond en JSON libre : on ne garde que ce qu'on a reconstruit
   champ par champ, et on borne les nombres. Une note de 47 ou de -3 —
   déjà vue quand un modèle note sur 100 — ferait sortir l'aiguille de la
   jauge sans que rien ne le signale. */
/* `criteres` en paramètre : la grille dépend de la TECHNIQUE, et une note
   de gantelet reconstruite contre la grille de Boris perdrait ses six
   critères en silence — la jauge afficherait un chiffre juste au-dessus
   de six lignes vides. Le défaut reste la grille Boris, la seule qui
   existait quand les notes déjà enregistrées ont été écrites. */
export function normalizeNote(raw, juge, criteres = CRITERES) {
  if (!raw || typeof raw !== "object") return null;
  const borne = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(10, Math.max(0, Math.round(n * 10) / 10));
  };

  const grille = (Array.isArray(criteres) && criteres.length ? criteres : CRITERES).map((c) => {
    const trouve = Array.isArray(raw.criteres)
      ? raw.criteres.find((x) => x && String(x.cle) === c.cle)
      : null;
    return {
      cle: c.cle,
      nom: c.nom,
      note: trouve ? borne(trouve.note) : null,
      mot: trouve && trouve.mot ? String(trouve.mot).trim().slice(0, 160) : "",
    };
  });

  const donnees = grille.map((c) => c.note).filter((n) => n != null);
  const globale = borne(raw.note);
  /* Si le juge oublie la note globale, le plus faible des critères la
     remplace — jamais la moyenne : c'est précisément ce que la règle
     ci-dessus interdit. */
  const note = globale != null ? globale : donnees.length ? Math.min(...donnees) : null;
  if (note == null) return null;

  return {
    note,
    verdict: String(raw.verdict || "").trim().slice(0, 400),
    criteres: grille,
    juge: juge || String(raw.juge || ""),
    /* De quelle version cette note parle. Le juge répond APRÈS que la
       version est enregistrée : sans ce numéro, une note de v2 restait
       affichée au-dessus de v3 pendant les vingt secondes du jugement —
       un chiffre juste, sur le mauvais prompt. */
    ...(Number(raw.pourVersion) > 0 ? { pourVersion: Number(raw.pourVersion) } : {}),
    at: typeof raw.at === "string" ? raw.at : new Date().toISOString(),
  };
}

/* La consigne de correction : la demande de l'utilisateur, plus les
   contraintes qui ne se négocient pas. */
export function correctionInstruction(demand, limit) {
  const window = targetWindow(limit);
  return (
    `CORRECTION DEMANDÉE :\n${String(demand).trim()}\n\n` +
    "Applique-la au prompt ci-dessus et régénère-le COMPLET — les huit sections " +
    "'# EN MAJUSCULES' jusqu'à # SORTIE incluse, dans l'ordre. Texte brut uniquement : " +
    "pas de backticks, pas de commentaire, pas de préambule, aucune phrase qui parle " +
    "de la correction. Ne change QUE ce qui est demandé ; garde le reste mot pour mot " +
    `tant que la longueur le permet. Moins de ${limit} caractères, vise ${window.lo} à ${window.hi}.`
  );
}
