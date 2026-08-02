/* ================================================================
   MÉTA-PROMPT — méthode Boris.
   Le dépôt est la source de vérité : ce fichier est le seul endroit
   où vit la méthode. Le prompt de référence vient de la session Odoo
   agentique (2879 caractères) ; seule sa ligne « Modèles » a bougé —
   le routage y est désormais une règle d'escalade (Sonnet produit,
   Fable tranche, un cran au-dessus après un échec VÉRIFIÉ) et non un
   catalogue de modèles, qui vieillit à chaque sortie.
   ================================================================ */

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

/* Modèles proposés dans les réglages.
   Production → Sonnet 5. Jugement → Opus 5 : le juge n'est jamais le modèle
   qui a produit, les angles morts seraient corrélés (règle du playbook). */
export const MODELS = [
  { id: "claude-sonnet-5", label: "Sonnet 5", note: "rapide, produit" },
  { id: "claude-opus-5", label: "Opus 5", note: "profond, tranche" },
  { id: "claude-fable-5", label: "Fable 5", note: "le plus fort, le plus cher" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", note: "économique" },
];

/* Tarifs Anthropic en $ par million de jetons (entrée / sortie),
   prix catalogue au 2026-08. Le compteur est un ordre de grandeur
   honnête, pas une facture : les remises de lancement et le cache
   ne sont pas modélisés. */
export const PRICES = {
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-fable-5": { in: 10, out: 50 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

export function costOf(model, usage) {
  const price = PRICES[model];
  if (!price || !usage) return 0;
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const cached = usage.cache_read_input_tokens || 0;
  return (
    (input * price.in + cached * price.in * 0.1 + (usage.output_tokens || 0) * price.out) / 1e6
  );
}

/* 0,043 $ · <0,001 $ · 1,20 $ — virgule française, dollar facturé. */
export function formatCost(dollars) {
  if (!Number.isFinite(dollars) || dollars <= 0) return "0 $";
  if (dollars < 0.001) return "<0,001 $";
  const digits = dollars < 1 ? 3 : 2;
  return dollars.toFixed(digits).replace(".", ",") + " $";
}

export const DEFAULT_WRITER = "claude-sonnet-5";
export const DEFAULT_JUDGE = "claude-opus-5";

/* ---------- reprendre un fil ----------

   Après un rechargement, la conversation brute avec le modèle n'existe
   plus : elle vivait en mémoire. On la reconstruit à partir de ce qui a
   été enregistré — le méta-prompt, l'idée, et le prompt en vigueur. Le
   modèle voit alors exactement ce qu'il faut pour corriger : la méthode,
   la demande d'origine, et son dernier état. Inutile de rejouer le fil
   entier, et coûteux de le faire. */
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
