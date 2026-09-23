/* Banc d'essai de la méthode Opus 5.5 — des utilisateurs fictifs, le vrai
   circuit de l'atelier, et un juge qui n'est pas celui de l'atelier.

     npm run banc [-- --rédacteur claude-sonnet-5] [-- --cas vague,design]

   Pour chaque cas : l'étape 1 (les questions) exactement comme l'écran la
   lance, une réponse d'utilisateur simulée si des questions sont posées,
   l'étape 2 sous assertions avec réparation, puis un juge Opus 5.5 en
   effort MAX qui lit le guide d'Anthropic en entier et dit, règle par
   règle, si le prompt produit y est conforme — et si les questions
   posées étaient les bonnes.

   Ce banc coûte de l'argent à chaque tour (quelques dizaines de centimes
   par cas, surtout le juge) : il ne tourne pas dans `npm run verify`. On
   le relance après avoir touché à `src/opus55.js`. */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const CLE = process.env.ANTHROPIC_TEST_KEY || process.env.ANTHROPIC_API_KEY || "";
if (!CLE) {
  console.error("ANTHROPIC_TEST_KEY absent — rien à faire.");
  process.exit(1);
}

const arg = (nom) => {
  const i = process.argv.indexOf(nom);
  return i > 0 ? process.argv[i + 1] : "";
};
/* Par défaut, le modèle et les efforts de l'écran (MODELE, ROLES) : le
   banc mesure ce que l'utilisateur obtiendra, pas un autre circuit. */
const { MODELE, ROLES } = await import("../src/meta.js");
const REDACTEUR = arg("--rédacteur") || MODELE;
const JUGE = "claude-opus-5-5";
/* Hors du dépôt : un rapport de banc est une mesure du jour, pas une
   source de vérité à suivre dans git. */
const SORTIE = arg("--sortie") || join(tmpdir(), "banc-opus55.json");

const { techniqueOf } = await import("../src/techniques.js");
const { callClaude } = await import("../src/api.js");
const { parseJson } = await import("../src/meta.js");
const { runVerifiedGeneration } = await import("../src/generate.js");
const o55 = await import("../src/opus55.js");
const O = techniqueOf("opus55");
const LIMITE = O.limiteDefaut;

/* Le guide lui-même, tel qu'Anthropic l'a publié, relu à la source à
   chaque tour. Le juge le lit en entier : c'est contre LUI qu'on mesure,
   pas contre notre résumé. Il n'est pas copié dans le dépôt, qui est
   public — le texte appartient à son auteur. */
const GUIDE_URL = "https://claude.dev/blog/getting-the-most-out-of-opus-5-5/";
const GUIDE = await (async () => {
  const html = await (await fetch(GUIDE_URL)).text();
  const corps = html.slice(html.indexOf("<h1"), html.indexOf("Related posts") > 0 ? html.indexOf("Related posts") : undefined);
  return corps
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, "")
    .replace(/<(h[1-6]|p|li|pre)[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&#x27;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\n\s*\n+/g, "\n")
    .trim();
})();
if (GUIDE.length < 5000 || !/Opus 5\.5/.test(GUIDE)) {
  console.error(`Le guide n'a pas pu être relu à la source (${GUIDE.length} car.) — le juge n'aurait rien contre quoi mesurer.`);
  process.exit(1);
}
console.log(`Guide relu : ${GUIDE.length} caractères. Rédacteur ${REDACTEUR}, juge ${JUGE} (effort max).`);

/* Les utilisateurs fictifs. `attendu` est ce qu'un humain attendrait —
   donné au juge comme repère, jamais au rédacteur. `sait` est ce que
   l'utilisateur a en tête sans l'avoir écrit : un modèle joue son rôle et
   répond aux questions RÉELLEMENT posées à partir de ça seulement. Des
   réponses écrites d'avance ont été essayées le 2026-09-23 : elles
   répondaient à côté des questions, et le juge a mesuré le script plutôt
   que l'atelier. */
const CAS = [
  {
    id: "migration",
    idee: "Migre tous les endpoints de paiement de notre dépôt billing-api (Node) de l'ancien client maison lib/stripe-legacy vers le SDK officiel stripe-node. C'est fini quand chaque endpoint utilise le nouveau client, que l'ancien est supprimé et que les tests passent.",
    attendu: "Aucune question (l'arrivée est donnée). Clauses probables : run long et/ou sous-agents par groupe d'endpoints avec preuves.",
    sait: "Les tests se lancent avec npm test. Pas d'autre exigence.",
  },
  {
    id: "vague",
    idee: "Améliore mon site, il est nul.",
    attendu: "Des questions : quel site / où est-il, et à quoi verra-t-on que c'est mieux. Sans elles, impossible d'écrire une arrivée observable.",
    sait: "C'est le site vitrine de ma boulangerie, dépôt GitHub boulangerie-dupont (Astro), déployé sur Netlify. Ce qui me gêne : il est lent sur téléphone et le formulaire de précommande n'envoie rien. Je serai content quand le score Lighthouse mobile dépassera 90 sur chaque page et qu'une précommande arrivera par mail dans la boîte de test.",
  },
  {
    id: "design",
    idee: "Fais-moi une landing page pour Serenia, mon app de méditation guidée pour les soignants de nuit. Une seule page, en HTML/CSS, avec une section tarifs et un formulaire de liste d'attente.",
    attendu: "Aucune question nécessaire. Clause design : styles exclus NOMMÉS (au moins trois), jamais « évite le générique ».",
    sait: "Pas de charte graphique. Trois formules possibles, les prix ne sont pas fixés. Le formulaire n'est branché nulle part pour l'instant.",
  },
  {
    id: "recherche",
    idee: "Compare les trois principaux fournisseurs d'e-mail transactionnel pour une startup française de 5 personnes : prix pour 50 000 mails par mois, conformité RGPD et hébergement des données, délivrabilité. Je veux un document que je peux envoyer à mon associé.",
    attendu: "Aucune question ou une au plus. Clauses : marquer ce qui n'a pas pu être confirmé et où on a cherché ; relecture des contradictions internes (document).",
    sait: "Je pense à Brevo, Postmark et Amazon SES. Je veux une recommandation à la fin, et savoir d'où viennent les chiffres.",
  },
  {
    id: "revue",
    idee: "Relis la pull request 128 de notre dépôt api-facturation avant que je la fusionne.",
    attendu: "Aucune question. Clause revue : seulement ce qui bloquerait la fusion, fichier + ligne + pourquoi + comment montrer l'échec. Aucun changement du code.",
    sait: "La PR est sur GitHub, organisation facturo. Je veux savoir si je peux fusionner.",
  },
  {
    id: "simple",
    idee: "Renomme la fonction calcTva en calculerTva partout dans le dépôt compta-web, tests compris.",
    attendu: "Aucune question. Tâche courte : aucune clause ou presque (pas de TASKS.md, pas de sous-agents).",
    sait: "Les tests se lancent avec npm test.",
  },
  {
    id: "tableur",
    idee: "Fais un tableur que je peux partager avec la direction : une ligne par fournisseur de notre liste, avec le coût annuel, la date de fin de contrat et le responsable interne.",
    attendu: "Une question légitime : où est la liste des fournisseurs (source du travail). Livrable : le fichier, pas un plan. Clause document : contradictions.",
    sait: "La liste est dans le Google Sheet « Fournisseurs 2026 » sur notre Drive, onglet Contrats. Les coûts sont dans les factures PDF du dossier Drive « Factures fournisseurs ». Le responsable interne est dans la colonne D du Sheet.",
  },
  {
    id: "piege",
    idee: "Écris un script Python qui dédoublonne les contacts de notre export CRM contacts.csv (même e-mail = même personne, on garde la fiche la plus récente). Réfléchis bien étape par étape et montre-moi tout ton raisonnement avant de coder.",
    attendu: "L'idée demande « réfléchis étape par étape » et « montre ton raisonnement » : le prompt produit ne doit reprendre NI l'un NI l'autre (au plus « explique ton choix en trois phrases »).",
    sait: "contacts.csv a une colonne derniere_modification (ISO 8601). Je veux un nouveau fichier contacts-dedoublonnes.csv, l'original ne doit pas bouger. Les e-mails se comparent sans tenir compte des majuscules.",
  },
];

const choisis = (arg("--cas") || "").split(",").filter(Boolean);
const aJouer = choisis.length ? CAS.filter((c) => choisis.includes(c.id)) : CAS;

const demander = async (convo, model, maxTokens, effort) =>
  (await callClaude(convo, { apiKey: CLE, model, maxTokens, ...(model === MODELE && effort ? { effort } : {}) })).text;

async function jouer(cas) {
  const journal = [];
  /* Étape 1, comme l'écran : même message, même budget. */
  const first = { role: "user", content: O.buildMeta(LIMITE) + "\n\nIDÉE :\n" + cas.idee + "\n\n" + O.etape1.instruction() };
  const raw1 = await demander([first], REDACTEUR, 1200, ROLES.questions.effort);
  let questions;
  try {
    questions = (parseJson(raw1).questions || []).slice(0, 3);
  } catch {
    throw new Error(`étape 1 : réponse sans JSON — ${raw1.slice(0, 200)}`);
  }
  const history = [first, { role: "assistant", content: raw1 }];
  let answers = null;
  if (questions.length) {
    const brut = await demander(
      [
        {
          role: "user",
          content:
            `Tu joues l'utilisateur qui a écrit cette idée : « ${cas.idee} ». Ce que tu as en tête sans l'avoir écrit : ${cas.sait}\n\n` +
            "On te pose ces questions avant d'écrire ton prompt :\n" +
            questions.map((q, i) => `${i + 1}. ${q}`).join("\n") +
            "\n\nRéponds à chacune comme le ferait cet utilisateur pressé : une phrase courte, UNIQUEMENT à partir de ce que tu as en tête ; " +
            "si tu n'en sais rien, réponds « je ne sais pas, tranche ». " +
            'Réponds UNIQUEMENT avec ce JSON : {"reponses":["..."]}',
        },
      ],
      "claude-sonnet-5",
      800
    );
    const r = parseJson(brut).reponses || [];
    answers = Object.fromEntries(questions.map((_, i) => [i, String(r[i] || "")]));
  }

  const run = await runVerifiedGeneration({
    ask: (convo) => demander(convo, REDACTEUR, Math.min(16000, Math.max(2000, Math.ceil(LIMITE / 2) + 1200)), ROLES.redaction.effort),
    baseConvo: history,
    instruction: O.etape2Instruction({ limit: LIMITE, questions, answers }),
    limit: LIMITE,
    verify: O.verifyPrompt,
    repair: O.repairInstruction,
    choisir: O.choisirMeilleure,
    onLog: (l) => journal.push(l),
  });
  return { questions, answers, prompt: run.text, check: run.check, journal };
}

/* Le juge : Opus 5.5 en effort max, réflexion adaptative (omise : il
   pense toujours), en flux — un effort max peut penser plusieurs minutes
   et un appel non diffusé tomberait sur le délai d'en-têtes. */
async function juger(cas, res) {
  const consigne =
    "Tu es un juge de conformité, strict et littéral. Voici le guide officiel d'Anthropic sur la manière de prompter Claude Opus 5.5, en entier :\n\n<guide>\n" +
    GUIDE +
    "\n</guide>\n\nUn atelier génère, à partir de l'idée d'un utilisateur, un message destiné à Opus 5.5 selon une « méthode Opus 5.5 » censée appliquer ce guide. Voici le méta-prompt de la méthode :\n\n<methode>\n" +
    O.buildMeta(LIMITE) +
    "\n</methode>\n\n" +
    `<idee_utilisateur>\n${cas.idee}\n</idee_utilisateur>\n\n` +
    `<questions_posees_avant_ecriture>\n${res.questions.length ? res.questions.map((q, i) => `Q${i + 1} : ${q}\nR : ${res.answers?.[i] || "(sans réponse)"}`).join("\n") : "(aucune question posée)"}\n</questions_posees_avant_ecriture>\n\n` +
    `<repere_humain>\n${cas.attendu}\n</repere_humain>\n\n` +
    `<prompt_produit>\n${res.prompt}\n</prompt_produit>\n\n` +
    "Juge deux choses.\n" +
    "1. Le PROMPT PRODUIT est-il conforme à 100 % aux recommandations du guide qui s'appliquent à cette tâche ? Pour chaque recommandation du guide qui concerne l'écriture d'un prompt (tâche entière et ligne d'arrivée ; pas de consigne de réflexion ; arrêts nommés et continuation ; styles exclus nommés pour du design ; sous-agents avec vérification des preuves et un tableau pour un audit/une migration à grande échelle ; liste de tâches dans un fichier pour un long run ; format du compte rendu ; revue « bloquer la fusion » ; « marquer ce qui n'a pas pu être confirmé » ; livrable fini plutôt qu'un plan ; relecture des contradictions pour un long document ; ne jamais demander de reproduire le raisonnement interne), dis si elle s'applique à CETTE tâche, et si oui si elle est respectée. Une clause plaquée sur une tâche où elle ne s'applique pas est aussi une faute. Signale aussi tout ce qui contredit le guide ou alourdit sans raison.\n" +
    "2. Les QUESTIONS posées avant l'écriture étaient-elles les bonnes : nécessaires (sans elles, l'arrivée ou l'objet du travail ne se devinaient pas) et suffisantes (rien de matériel oublié), sans question superflue ?\n\n" +
    "Réponds UNIQUEMENT avec ce JSON, sans autre texte :\n" +
    '{"conforme":true,"note":9.5,"recommandations":[{"regle":"…","s_applique":true,"respectee":true,"citation":"extrait du prompt ou vide"}],' +
    '"violations":[{"regle":"…","citation":"…","correction":"la phrase à écrire à la place"}],' +
    '"questions_ok":true,"questions_commentaire":"…","verdict":"une phrase"}\n' +
    "`conforme` n'est vrai que si `violations` est vide. Sois exigeant : un détail qui affaiblit une recommandation est une violation.";

  const reponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": CLE, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: JUGE,
      max_tokens: 64000,
      stream: true,
      output_config: { effort: "max" },
      messages: [{ role: "user", content: consigne }],
    }),
  });
  if (!reponse.ok) throw new Error(`juge ${reponse.status} : ${await reponse.text()}`);
  let texte = "";
  let tampon = "";
  let arret = null;
  const lecteur = reponse.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    tampon += dec.decode(value, { stream: true });
    const lignes = tampon.split("\n");
    tampon = lignes.pop() ?? "";
    for (const l of lignes) {
      if (!l.startsWith("data:")) continue;
      try {
        const ev = JSON.parse(l.slice(5));
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") texte += ev.delta.text;
        if (ev.type === "message_delta" && ev.delta?.stop_reason) arret = ev.delta;
        if (ev.type === "error") throw new Error(ev.error?.message);
      } catch (e) {
        if (e.message && !/JSON/.test(e.message)) throw e;
      }
    }
  }
  /* Un refus du juge se nomme : le guide prévient qu'une demande de
     « montrer son raisonnement » est une catégorie de signalement, et le
     cas piégé en CONTIENT une — citée dans l'idée qu'on lui fait lire. */
  if (arret?.stop_reason === "refusal")
    throw new Error(`juge : refus (${arret.stop_details?.category ?? "catégorie inconnue"})`);
  try {
    return parseJson(texte);
  } catch {
    throw new Error(`juge : réponse sans JSON (${arret?.stop_reason ?? "?"}) — ${texte.slice(0, 200)}`);
  }
}

const resultats = await Promise.all(
  aJouer.map(async (cas) => {
    try {
      const res = await jouer(cas);
      const verdict = await juger(cas, res);
      return { id: cas.id, idee: cas.idee, ...res, verdict };
    } catch (e) {
      return { id: cas.id, idee: cas.idee, erreur: e.message };
    }
  })
);

writeFileSync(SORTIE, JSON.stringify({ redacteur: REDACTEUR, juge: JUGE, resultats }, null, 2));

let rouges = 0;
for (const r of resultats) {
  if (r.erreur) {
    rouges += 1;
    console.log(`\n✗ ${r.id} — ERREUR : ${r.erreur}`);
    continue;
  }
  const v = r.verdict || {};
  const ok = r.check.pass && v.conforme === true && (v.violations || []).length === 0 && v.questions_ok !== false;
  if (!ok) rouges += 1;
  console.log(`\n${ok ? "✓" : "✗"} ${r.id} — oracle ${r.check.pass ? "vert" : "ROUGE"} (${r.check.mots} mots) · juge ${v.note}/10 · conforme ${v.conforme} · questions ${v.questions_ok ? "ok" : "À REVOIR"}`);
  console.log(`   questions : ${r.questions.length ? r.questions.join(" | ") : "(aucune)"}`);
  if (v.questions_commentaire) console.log(`   sur les questions : ${v.questions_commentaire}`);
  for (const x of v.violations || []) console.log(`   ✗ ${x.regle} — « ${x.citation} » → ${x.correction}`);
  console.log(`   verdict : ${v.verdict}`);
}
console.log(`\n${rouges === 0 ? "Banc au vert." : `${rouges} cas à reprendre.`} Détail : ${SORTIE}`);
process.exit(rouges === 0 ? 0 : 1);
