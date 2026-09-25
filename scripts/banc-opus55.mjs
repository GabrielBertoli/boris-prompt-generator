/* Banc d'essai de la méthode Opus 5.5 — des utilisateurs fictifs, le vrai
   circuit de l'atelier, et un juge qui n'est pas celui de l'atelier.

     npm run banc [-- --rédacteur claude-sonnet-5] [-- --cas vague,design]
                  [-- --effort-redaction low|medium|high|xhigh] [-- --effort-juge high]

   Pour chaque cas : l'étape 1 (les questions) exactement comme l'écran la
   lance, une réponse d'utilisateur simulée si des questions sont posées,
   l'étape 2 sous assertions avec réparation, puis un juge Opus 5.5 en
   effort MAX qui lit la DOCUMENTATION OFFICIELLE d'Anthropic (« Prompting
   Claude Opus 5.5 », platform.claude.com) en entier et dit, règle par
   règle, si le prompt produit y est conforme — et si les questions
   posées étaient les bonnes. Jusqu'au 2026-09-25, le juge lisait le
   billet de blog d'où la méthode est née : il mesurait la fidélité au
   billet, pas à la source qui fait foi.

   `--effort-redaction` compare les efforts de RÉDACTION : « high » avait
   été décidé par raisonnement (DECISIONS § 33) ; mesuré le 2026-09-25,
   « medium » fait mieux (7/10 contre 5/10) et l'a remplacé. La
   documentation dit de tester plusieurs niveaux plutôt que d'en décider
   un. Le même jeu de cas, un effort par passage, et le rapport de
   `--sortie` garde l'effort joué.

   TOUT passe par l'ABONNEMENT Max de Gabriel, jamais par une clé API :
   chaque appel est un Claude Code sans interface (`claude -p`), isolé —
   aucun outil, aucun skill, aucun serveur MCP, aucun réglage, un prompt
   système neutre (491 jetons de contexte au lieu de 75 000 mesurés sans
   isolation) — et lancé SANS `ANTHROPIC_API_KEY` dans son environnement,
   qui prendrait le pas sur l'abonnement. Jamais `--bare` : il ignore
   l'abonnement et exige une clé.
   Payé le 2026-09-23 : la première version appelait l'API avec la clé du
   `.env` — la même que celle du site — et l'a vidée en dix tours.
   Le banc consomme la limite HEBDOMADAIRE du forfait, surtout par le juge ;
   il affiche après chaque cas l'équivalent API de ce qu'il a coûté, pour
   décider en connaissance de cause avant de relancer.

   Le module s'importe SANS rien lancer (le vérificateur lit ses options et
   ses cas) : le banc ne tourne que lancé directement. */

import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { MODELE, ROLES, parseJson } from "../src/meta.js";
import { SOURCE } from "../src/opus55.js";

/* Les efforts que l'API connaît. La rédaction s'arrête à `xhigh` : `max`
   n'a rien à prouver sur un message de deux cents mots, et la
   documentation réserve `xhigh` et `max` aux gains mesurés. */
export const EFFORTS_REDACTION = ["low", "medium", "high", "xhigh"];
export const EFFORTS_JUGE = ["low", "medium", "high", "xhigh", "max"];

/* La source que le juge lit : la page officielle en Markdown (même
   adresse suivie de `.md`), servie telle quelle, sans HTML à défaire. */
export const SOURCE_MD = SOURCE.url + ".md";

/* Les options, lues sans effet de bord : une valeur inconnue ou absente
   est une erreur AVANT le moindre appel, jamais un effort tombé en
   silence sur le défaut. */
export function lireOptions(argv = process.argv) {
  const valeur = (nom) => {
    const i = argv.indexOf(nom);
    if (i < 0) return undefined;
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) throw new Error(`${nom} attend une valeur`);
    return v;
  };
  const effortRedaction = valeur("--effort-redaction") ?? ROLES.redaction.effort;
  if (!EFFORTS_REDACTION.includes(effortRedaction))
    throw new Error(`--effort-redaction : « ${effortRedaction} » inconnu — ${EFFORTS_REDACTION.join(", ")}`);
  /* Le juge est en effort max — la demande de Gabriel — sauf
     `--effort-juge`, pour ménager la limite hebdomadaire. */
  const effortJuge = valeur("--effort-juge") ?? "max";
  if (!EFFORTS_JUGE.includes(effortJuge)) throw new Error(`--effort-juge : « ${effortJuge} » inconnu — ${EFFORTS_JUGE.join(", ")}`);
  return {
    /* Le modèle et les efforts de l'écran (MODELE, ROLES) : le banc mesure
       ce que l'utilisateur obtiendra, sauf demande contraire. */
    redacteur: valeur("--rédacteur") ?? MODELE,
    effortRedaction,
    effortJuge,
    /* Hors du dépôt : un rapport de banc est une mesure du jour, pas une
       source de vérité à suivre dans git. */
    sortie: valeur("--sortie") ?? join(tmpdir(), "banc-opus55.json"),
    cas: (valeur("--cas") || "").split(",").filter(Boolean),
  };
}

/* Les utilisateurs fictifs. `attendu` est ce qu'un humain attendrait —
   donné au juge comme repère, jamais au rédacteur. `sait` est ce que
   l'utilisateur a en tête sans l'avoir écrit : un modèle joue son rôle et
   répond aux questions RÉELLEMENT posées à partir de ça seulement. Des
   réponses écrites d'avance ont été essayées le 2026-09-23 : elles
   répondaient à côté des questions, et le juge a mesuré le script plutôt
   que l'atelier. */
export const CAS = [
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
  /* Ajoutés le 2026-09-25 avec le mode « suivi » et la clause « plusieurs
     applications » : la documentation dit de laisser la consigne
     anti-arrêt de côté quand quelqu'un répond, et mesure l'exploration
     large sur des tâches entre applications connectées. */
  {
    id: "suivi",
    idee: "Dans l'app Claude, on prépare ensemble ma présentation pour le conseil d'administration de jeudi à partir de mes notes du dossier Drive « CA septembre » : je veux valider le plan avant que tu rédiges les diapos.",
    attendu: "Mode SUIVI (l'utilisateur est là et valide) : ligne d'intention fixe au départ, accord demandé avant tout geste destructeur, JAMAIS la règle de continuer d'un agent seul. Aucune question sur le mode (il est dit). Pas d'exploration large : une seule source désignée.",
    sait: "Dix diapos au plus. La présentation doit couvrir le budget, les recrutements et le calendrier du trimestre.",
  },
  {
    id: "multiapps",
    idee: "Prépare les brouillons de relance pour les clients dont une facture est en retard, à partir de Gmail, du tableur de suivi des factures et des fiches clients du CRM HubSpot. N'envoie rien.",
    attendu: "Mode SEUL (rien ne dit que l'utilisateur suit). Clause plusieurs applications, phrase fixe entière. Gestes destructeurs : envoyer un mail, modifier le CRM ou le tableur. Au plus une question (l'arrivée), aucune sur le mode.",
    sait: "Un brouillon par client en retard, dans Gmail. Le tableur s'appelle « Suivi factures 2026 ». Une facture est en retard après 30 jours.",
  },
];

/* ---------- un appel = un `claude -p` isolé, sur l'abonnement ----------
   Un dossier vide comme répertoire de travail (aucun CLAUDE.md de projet),
   l'environnement débarrassé de toute variable ANTHROPIC_*, et les options
   qui retirent tout ce que Claude Code ajoute d'ordinaire. */
const SYSTEME = "Tu réponds au dernier message de l'utilisateur, en suivant exactement ses consignes de forme.";
export const envSansCle = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith("ANTHROPIC_")));

/* Les arguments d'un appel. Exportés pour que le vérificateur prouve, sans
   rien lancer, qu'aucun ne contient `--bare`. */
export function argsClaude({ model = MODELE, effort } = {}) {
  return [
    "-p", "--model", model, "--tools", "", "--disable-slash-commands",
    "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "",
    "--no-session-persistence", "--system-prompt", SYSTEME, "--output-format", "json",
    ...(effort ? ["--effort", effort] : []),
  ];
}

async function principal(options) {
  const { techniqueOf } = await import("../src/techniques.js");
  const { runVerifiedGeneration } = await import("../src/generate.js");
  const O = techniqueOf("opus55");
  const LIMITE = O.limiteDefaut;
  const REDACTEUR = options.redacteur;
  const JUGE = MODELE;

  /* La documentation officielle, relue à la source à chaque tour. Le juge
     la lit en entier : c'est contre ELLE qu'on mesure, pas contre notre
     résumé ni contre le billet d'origine. Elle n'est pas copiée dans le
     dépôt, qui est public — le texte appartient à son auteur. */
  const GUIDE = (await (await fetch(SOURCE_MD)).text()).trim();
  if (GUIDE.length < 5000 || !/Opus 5\.5/.test(GUIDE) || /<html/i.test(GUIDE.slice(0, 500))) {
    console.error(`La documentation n'a pas pu être relue à la source (${GUIDE.length} car.) — le juge n'aurait rien contre quoi mesurer.`);
    process.exit(1);
  }
  console.log(
    `Documentation relue : ${GUIDE.length} caractères. Rédacteur ${REDACTEUR} (effort ${options.effortRedaction}), ` +
      `juge ${JUGE} (effort ${options.effortJuge}), via l'abonnement (claude -p).`
  );

  const aJouer = options.cas.length ? CAS.filter((c) => options.cas.includes(c.id)) : CAS;
  const VIDE = mkdtempSync(join(tmpdir(), "banc-opus55-"));
  const ENV = envSansCle();
  let equivalentApi = 0;

  function claudeP(texte, { model = MODELE, effort }) {
    return new Promise((resolve, reject) => {
      const enfant = spawn("claude", argsClaude({ model, effort }), { cwd: VIDE, env: ENV });
      let out = "";
      let err = "";
      enfant.stdout.on("data", (d) => (out += d));
      enfant.stderr.on("data", (d) => (err += d));
      enfant.on("error", reject);
      enfant.on("close", (code) => {
        try {
          const r = JSON.parse(out);
          equivalentApi += Number(r.total_cost_usd) || 0;
          if (r.is_error) return reject(new Error(`claude -p : ${String(r.result).slice(0, 200)}`));
          resolve(String(r.result || ""));
        } catch {
          reject(new Error(`claude -p (code ${code}) : ${(err || out).slice(0, 300)}`));
        }
      });
      enfant.stdin.end(texte);
    });
  }

  /* Une conversation de plusieurs tours se remet à plat : `claude -p` ne
     reçoit qu'un message. Le rédacteur voit l'échange entier, balisé, et
     répond au dernier tour — c'est la seule différence avec l'écran, qui
     envoie les tours séparés à l'API. */
  const aplatir = (convo) =>
    convo.length === 1
      ? String(convo[0].content)
      : "Voici notre échange jusqu'ici. Réponds uniquement au DERNIER message de l'utilisateur, comme à ce point de la conversation.\n\n" +
        convo.map((m) => `<${m.role === "user" ? "utilisateur" : "toi"}>\n${m.content}\n</${m.role === "user" ? "utilisateur" : "toi"}>`).join("\n\n");

  const demander = (convo, model, _maxTokens, effort) => claudeP(aplatir(convo), { model, effort });

  async function jouer(cas) {
    const journal = [];
    /* Étape 1, comme l'écran : même message, même effort. */
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

    /* L'étape 2 à l'effort demandé (`--effort-redaction`), celui de l'écran
       par défaut : c'est la seule variable que la comparaison fait bouger. */
    const run = await runVerifiedGeneration({
      ask: (convo) => demander(convo, REDACTEUR, Math.min(16000, Math.max(2000, Math.ceil(LIMITE / 2) + 1200)), options.effortRedaction),
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

  /* Le juge : Opus 5.5, par `claude -p` comme le reste. */
  async function juger(cas, res) {
    const consigne =
      "Tu es un juge de conformité, strict et littéral. Voici la documentation officielle d'Anthropic sur la manière de prompter Claude Opus 5.5, en entier :\n\n<documentation>\n" +
      GUIDE +
      "\n</documentation>\n\nUn atelier génère, à partir de l'idée d'un utilisateur, un message destiné à Opus 5.5 selon une « méthode Opus 5.5 » alignée sur cette documentation. Voici le méta-prompt de la méthode :\n\n<methode>\n" +
      O.buildMeta(LIMITE) +
      "\n</methode>\n\n" +
      `<idee_utilisateur>\n${cas.idee}\n</idee_utilisateur>\n\n` +
      `<questions_posees_avant_ecriture>\n${res.questions.length ? res.questions.map((q, i) => `Q${i + 1} : ${q}\nR : ${res.answers?.[i] || "(sans réponse)"}`).join("\n") : "(aucune question posée)"}\n</questions_posees_avant_ecriture>\n\n` +
      `<repere_humain>\n${cas.attendu}\n</repere_humain>\n\n` +
      `<prompt_produit>\n${res.prompt}\n</prompt_produit>\n\n` +
      "Juge deux choses.\n" +
      "1. Le PROMPT PRODUIT est-il conforme à 100 % à ce que la documentation dit du TEXTE d'un prompt, pour cette tâche ? Recommandations de la documentation à examiner : " +
      "condition de fin posée dès le départ ; liste de tâches dans un fichier pour un long travail en plusieurs parties ; pas de consigne de réflexion (« réfléchis bien », « étape par étape ») ; " +
      "ne jamais demander de reproduire le raisonnement dans la réponse ; styles exclus NOMMÉS pour du front, jamais « évite le générique » ; " +
      "pour un agent laissé seul, les arrêts voulus et non voulus nommés, points d'avancement dans le même message que l'action suivante, confirmation gardée avant un geste risqué ; " +
      "quand quelqu'un suit et répond, PAS de consigne anti-arrêt, mais une ligne d'intention avant la première action et un court récapitulatif à la fin ; " +
      "exploration large de toutes les applications avant d'agir quand la tâche en traverse plusieurs, et seulement alors. " +
      "La documentation met l'essentiel du levier dans les réglages (effort, consigne système, relances) : ne reproche pas au prompt de ne pas recopier la consigne système verbatim, mais signale toute phrase qui la contredit. " +
      "Les autres consignes de la méthode (sous-agents dont on vérifie les preuves et un tableau, revue « bloquer la fusion », recherche « marquer ce qui n'a pas pu être confirmé », relecture des contradictions d'un long document, livrable fini plutôt qu'un plan, trois titres de fin) " +
      "viennent d'un billet antérieur que la documentation ne contredit pas : juge-les contre le méta-prompt (s'appliquent-elles à CETTE tâche, sont-elles reprises fidèlement). " +
      "Pour chaque recommandation, dis si elle s'applique à CETTE tâche, et si oui si elle est respectée. Une clause plaquée sur une tâche où elle ne s'applique pas est aussi une faute, et le MODE (seul ou suivi) doit correspondre à l'idée. Signale aussi tout ce qui contredit la documentation ou alourdit sans raison.\n" +
      "2. Les QUESTIONS posées avant l'écriture étaient-elles les bonnes : nécessaires (sans elles, l'arrivée, l'objet du travail ou le mode ne se devinaient pas) et suffisantes (rien de matériel oublié), sans question superflue ?\n\n" +
      "Réponds UNIQUEMENT avec ce JSON, sans autre texte :\n" +
      '{"conforme":true,"note":9.5,"recommandations":[{"regle":"…","s_applique":true,"respectee":true,"citation":"extrait du prompt ou vide"}],' +
      '"violations":[{"regle":"…","citation":"…","correction":"la phrase à écrire à la place"}],' +
      '"questions_ok":true,"questions_commentaire":"…","verdict":"une phrase"}\n' +
      "`conforme` n'est vrai que si `violations` est vide. Sois exigeant : un détail qui affaiblit une recommandation est une violation.";

    const texte = await claudeP(consigne, { model: JUGE, effort: options.effortJuge });
    try {
      return parseJson(texte);
    } catch {
      throw new Error(`juge : réponse sans JSON — ${texte.slice(0, 200)}`);
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

  writeFileSync(
    options.sortie,
    JSON.stringify(
      { redacteur: REDACTEUR, effortRedaction: options.effortRedaction, juge: JUGE, effortJuge: options.effortJuge, source: SOURCE_MD, resultats },
      null,
      2
    )
  );

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
    console.log(
      `\n${ok ? "✓" : "✗"} ${r.id} — oracle ${r.check.pass ? "vert" : "ROUGE"} (${r.check.mots} mots, mode ${r.check.mode ?? "?"}) · juge ${v.note}/10 · conforme ${v.conforme} · questions ${v.questions_ok ? "ok" : "À REVOIR"}`
    );
    console.log(`   questions : ${r.questions.length ? r.questions.join(" | ") : "(aucune)"}`);
    if (v.questions_commentaire) console.log(`   sur les questions : ${v.questions_commentaire}`);
    for (const x of v.violations || []) console.log(`   ✗ ${x.regle} — « ${x.citation} » → ${x.correction}`);
    console.log(`   verdict : ${v.verdict}`);
  }
  console.log(`\nÉquivalent API consommé sur le forfait : ${equivalentApi.toFixed(2)} $ (non facturé : c'est l'abonnement qui paie, en limite hebdomadaire).`);
  console.log(`${rouges === 0 ? "Banc au vert." : `${rouges} cas à reprendre.`} Rédaction en effort ${options.effortRedaction}. Détail : ${options.sortie}`);
  process.exit(rouges === 0 ? 0 : 1);
}

/* Lancé directement (`npm run banc`) : les options d'abord — une erreur
   s'arrête là, avant tout appel —, puis le banc. Importé : rien. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let options;
  try {
    options = lireOptions();
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  await principal(options);
}
