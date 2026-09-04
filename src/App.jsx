import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHAPITRES, PIED } from "./aide.js";
import {
  api,
  callClaude,
  loadApiKey,
  looksLikeKey,
  saveApiKey,
} from "./api.js";
import {
  DEFAULT_JUDGE,
  DEFAULT_WRITER,
  MODELS,
  bandeDe,
  costOf,
  countChars,
  formatCost,
  normalizeNote,
  parseJson,
} from "./meta.js";
/* L'atelier ne nomme plus aucune méthode : il tient un objet `T`, et
   toutes les règles — longueur, étapes, oracle, grille du juge — en
   sortent. Voir l'en-tête de `techniques.js` pour ce que ça évite. */
import {
  DEFAULT_TECHNIQUE,
  TECHNIQUES,
  estTechnique,
  techniqueOf,
} from "./techniques.js";
import { createPortal } from "react-dom";
import { MAX_ATTEMPTS, runVerifiedGeneration } from "./generate.js";
import {
  appendTurn,
  canRestore,
  fr,
  noterDernierTour,
  downloadText,
  duplicateEntry,
  exportBundle,
  formatDate,
  loadLibrary,
  makeEntry,
  mergeLibraries,
  parseBundle,
  persistLibrary,
  renameEntry,
  slugify,
  toMarkdown,
} from "./library.js";

/* ================================================================
   ATELIER — générateur de prompts agentiques, méthode Boris.
   Boucle complète : générer → vérifier (assertions) → juger →
   appliquer l'audit → re-vérifier. Bibliothèque personnelle.
   ================================================================ */

const SETTINGS_KEY = "atelier-boris:reglages";

const DEFAULTS = {
  writer: DEFAULT_WRITER,
  judge: DEFAULT_JUDGE,
  technique: DEFAULT_TECHNIQUE,
  /* Une limite PAR technique, et non une pour les deux : un prompt Boris
     se mesure en milliers de caractères, un prompt de gantelet en
     centaines. Un curseur partagé aurait fait hériter à l'un le réglage
     de l'autre — et le réglage hérité est indistinguable, à l'écran, du
     réglage choisi. */
  charLimit: 3900,
  charLimitGauntlet: 2500,
  charLimitHooks: 3000,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    /* 3000 était l'ancien défaut, que personne n'avait touché : on le
       migre vers 3900. Une valeur choisie à la main est conservée. */
    const stored = parsed.charLimit === 3000 ? DEFAULTS.charLimit : parsed.charLimit;
    const gauntlet = techniqueOf("gauntlet");
    return {
      writer: MODELS.some((m) => m.id === parsed.writer) ? parsed.writer : DEFAULTS.writer,
      judge: MODELS.some((m) => m.id === parsed.judge) ? parsed.judge : DEFAULTS.judge,
      /* Un réglage enregistré avant que la seconde technique existe n'a pas
         de technique : c'est Boris, la seule qu'il pouvait désigner. */
      technique: estTechnique(parsed.technique) ? parsed.technique : DEFAULTS.technique,
      /* Un réglage enregistré AVANT le plafond peut valoir 8000 : il est
         ramené au plafond à la relecture, sinon l'écran continuerait
         d'annoncer une limite que le vérificateur n'applique plus. */
      charLimit: Number.isFinite(stored)
        ? techniqueOf("boris").capLimit(stored)
        : DEFAULTS.charLimit,
      /* Même migration que ci-dessus, et pour la même raison : un réglage
         de gantelet enregistré avant le 2026-08-26 vaut 1300 ou moins, or
         le plancher est passé à 1700. `capLimit` le remonterait au
         PLANCHER — un réglage que personne n'a choisi, trop serré pour la
         fenêtre de mots actuelle. Sous le plancher, la valeur ne peut plus
         être un choix : on rend le défaut. */
      charLimitGauntlet:
        Number.isFinite(parsed.charLimitGauntlet) &&
        parsed.charLimitGauntlet >= gauntlet.limiteMin
          ? gauntlet.capLimit(parsed.charLimitGauntlet)
          : DEFAULTS.charLimitGauntlet,
      /* Troisième case, même règle : absente avant le 2026-09-04, elle
         vaut le défaut ; présente, elle est rabattue dans ses bornes. */
      charLimitHooks: Number.isFinite(parsed.charLimitHooks)
        ? techniqueOf("hooks").capLimit(parsed.charLimitHooks)
        : DEFAULTS.charLimitHooks,
    };
  } catch {
    return DEFAULTS;
  }
}

const budget = (charLimit) => Math.min(16000, Math.max(2000, Math.ceil(charLimit / 2) + 1200));

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand("copy");
    document.body.removeChild(area);
    return done;
  }
}

export default function App({ user, sharedKey, onUser, onLeave }) {
  /* ---------- réglages ---------- */
  const [ownKey, setOwnKey] = useState(loadApiKey);
  const [settings, setSettings] = useState(loadSettings);
  const [sheet, setSheet] = useState(null); // null | "reglages" | "edition"

  /* La technique en vigueur, et SA limite. Tout ce qui suit passe par ces
     deux-là : plus une seule règle de méthode n'est écrite dans l'écran. */
  const T = useMemo(() => techniqueOf(settings.technique), [settings.technique]);
  const limite = T.capLimit(settings[T.cleReglage]);

  /* La clé personnelle prime ; à défaut, celle de l'atelier. */
  const apiKey = ownKey || sharedKey || "";
  const usingShared = !ownKey && Boolean(sharedKey);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* navigation privée : les réglages restent en mémoire */
    }
  }, [settings]);

  /* ---------- atelier ---------- */
  const [idea, setIdea] = useState("");
  const [constraints, setConstraints] = useState("");
  const [showConstraints, setShowConstraints] = useState(false);

  const [phase, setPhase] = useState("idle"); // idle | analyzing | choix | generating | done
  /* L'étape 1 a deux formes selon la technique — des questions à remplir
     (Boris) ou des barres à choisir (gantelet) — mais UNE seule phase :
     c'est le même moment du travail, et lui donner deux phases aurait
     doublé chaque test de `phase` de l'écran. */
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [barres, setBarres] = useState([]);
  const [barreChoisie, setBarreChoisie] = useState("");
  const [barrePerso, setBarrePerso] = useState("");
  const [mesure, setMesure] = useState("");
  const [history, setHistory] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [verif, setVerif] = useState(null);
  const [version, setVersion] = useState(1);
  const [log, setLog] = useState([]);
  const [audit, setAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  /* ---------- bibliothèque ---------- */
  const [library, setLibrary] = useState([]);
  const [libLoading, setLibLoading] = useState(true);
  const [libRemote, setLibRemote] = useState(true);
  const [libError, setLibError] = useState("");
  const [search, setSearch] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saved
  const [openId, setOpenId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [draft, setDraft] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [printing, setPrinting] = useState(null); // l'entrée à imprimer
  const [libNote, setLibNote] = useState("");
  const [stream, setStream] = useState(""); // texte en cours de réception
  const [elapsed, setElapsed] = useState(0);
  /* Quel tour du fil vient d'être copié — l'accusé « Copié ✓ » se pose sur
     ce bouton-là, pas sur les autres. */
  const [copiedTurn, setCopiedTurn] = useState(null);

  /* La note du juge — ce que vaut le prompt, à la place de ce qu'il pèse.
     `noteOuverte` n'est que l'état du « ⋯ » : le détail se déplie sur
     demande, la jauge se lit sans rien ouvrir. */
  const [note, setNote] = useState(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteOuverte, setNoteOuverte] = useState(false);

  /* L'idée se replie dès qu'un travail est ouvert. La manchette et les six
     lignes du composeur poussaient l'écran de travail SOUS le pli : il
     fallait faire défiler pour voir le prompt qu'on venait de demander, à
     chaque fois. Repliée, l'idée reste lisible en une ligne et se rouvre
     d'un clic — on n'a rien perdu, on a gagné le haut de la page. */
  const [ideeOuverte, setIdeeOuverte] = useState(false);

  /* L'arrêt. Une génération dure des dizaines de secondes et enchaîne
     jusqu'à cinq réparations puis un jugement : sans bouton, la seule
     façon de reprendre la main était de recharger la page — et de perdre
     ce qui n'était pas encore enregistré. */
  const arretRef = useRef(null);
  const [arretable, setArretable] = useState(false);

  /* Le fil de correction : ce qu'on a demandé, ce qui est sorti. Il vit
     dans l'entrée de bibliothèque — donc dans le profil de son
     propriétaire — et `activeId` dit à quelle entrée il appartient. */
  const [chat, setChat] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [demand, setDemand] = useState("");

  /* La casse : ouverte d'office sur grand écran (elle y est un panneau),
     tiroir replié sur petit écran. */
  const [casseOpen, setCasseOpen] = useState(false);

  const composerRef = useRef(null);
  const resultRef = useRef(null);
  const fileRef = useRef(null);
  const cancelRename = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { items, remote } = await loadLibrary(user.id);
      if (!alive) return;
      setLibrary(items);
      setLibRemote(remote);
      setLibLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [user.id]);

  useEffect(() => {
    if (phase === "done" && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase]);

  const pushLog = (line) => setLog((l) => [...l, line]);

  const commit = useCallback(
    async (items) => {
      setLibrary(items);
      const result = await persistLibrary(user.id, items);
      setLibRemote(result.remote);
      setLibError(
        result.ok ? "" : `Sauvegardé sur cet appareil seulement — ${result.error}`
      );
      return result.ok;
    },
    [user.id]
  );

  /* ---------- compteur de dépense ----------
     Le navigateur est le seul à voir les réponses d'Anthropic : c'est donc
     lui qui mesure (jetons × tarif), et le serveur qui additionne — le
     total à date suit son propriétaire d'un appareil à l'autre. Un double
     local prend le relais si la clé-valeur est injoignable. */
  const [runCost, setRunCost] = useState({ writer: 0, judge: 0 });
  const [totalCost, setTotalCost] = useState(null);

  const costKey = `atelier-boris:cout:${user.id}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      let local = 0;
      try {
        local = Number(localStorage.getItem(costKey)) || 0;
      } catch {
        /* navigation privée */
      }
      if (alive) setTotalCost(local);
      try {
        const { total } = await api.loadUsage();
        if (alive) {
          setTotalCost(total);
          try {
            localStorage.setItem(costKey, String(total));
          } catch {
            /* le serveur reste la référence */
          }
        }
      } catch {
        /* hors ligne : le double local fait foi en attendant */
      }
    })();
    return () => {
      alive = false;
    };
  }, [costKey]);

  const addCost = useCallback(
    (role, dollars) => {
      if (!(dollars > 0)) return;
      setRunCost((c) => ({ ...c, [role]: c[role] + dollars }));
      setTotalCost((t) => (t ?? 0) + dollars);
      try {
        localStorage.setItem(costKey, String((Number(localStorage.getItem(costKey)) || 0) + dollars));
      } catch {
        /* navigation privée */
      }
      api
        .addUsage(dollars)
        .then(({ total }) => {
          setTotalCost(total);
          try {
            localStorage.setItem(costKey, String(total));
          } catch {
            /* le serveur reste la référence */
          }
        })
        .catch(() => {
          /* hors ligne : le delta est déjà dans le double local */
        });
    },
    [costKey]
  );

  const ask = useCallback(
    async (messages, model, maxTokens, role = "writer") => {
      setStream("");
      try {
        const { text, usage } = await callClaude(messages, {
          apiKey,
          model,
          maxTokens,
          /* Le texte s'affiche pendant qu'il arrive : une minute d'attente
             devient lisible au lieu de ressembler à un blocage. */
          onDelta: setStream,
          /* Le bouton « Arrêter » coupe ICI, dans l'appel réseau. Poser un
             drapeau que la boucle regarderait entre deux tentatives ne
             suffisait pas : une réparation qui vient de partir tient
             encore une minute, et pendant cette minute le bouton n'aurait
             rien fait — ce qui se lit comme un bouton cassé. */
          signal: arretRef.current?.signal,
        });
        addCost(role, costOf(model, usage));
        return text;
      } finally {
        setStream("");
      }
    },
    [apiKey, addCost]
  );

  /* Ouvre un chantier interruptible et rend son signal. Chaque départ a le
     sien : un contrôleur déjà avorté refuserait l'appel suivant. */
  const ouvrirArret = () => {
    arretRef.current = new AbortController();
    setArretable(true);
    return arretRef.current;
  };
  const fermerArret = () => {
    arretRef.current = null;
    setArretable(false);
  };

  /* Ce que fait le bouton. La boucle d'assertions vérifie le drapeau entre
     deux tentatives — sans quoi elle relancerait une réparation aussitôt
     après l'abandon de la précédente. */
  const arreter = () => {
    arretRef.current?.abort();
  };
  const estArret = (e) => Boolean(e && (e.arret || e.name === "Arret"));

  /* ---------- cœur : génération sous assertions ---------- */
  const generateVerified = (baseConvo, instruction) =>
    runVerifiedGeneration({
      ask: (convo) => ask(convo, settings.writer, budget(limite)),
      baseConvo,
      instruction,
      limit: limite,
      onLog: pushLog,
      /* Passés explicitement : sans eux la boucle applique son défaut, qui
         est l'oracle de Boris — huit sections cherchées dans un prompt de
         gantelet, cinq réparations payées, et un refus final sur une faute
         qui n'existe pas. */
      verify: T.verifyPrompt,
      ...(T.repairInstruction ? { repair: T.repairInstruction } : {}),
      ...(T.choisirMeilleure ? { choisir: T.choisirMeilleure } : {}),
    });

  /* Rien au-dessus du plafond ne quitte l'atelier.
     Un prompt trop long n'est pas « presque bon » : donné à l'agent auquel
     il est destiné, il est refusé. L'afficher avec un avertissement — ce
     que faisait l'atelier — revenait à livrer un produit cassé en s'en
     excusant, et le bouton « Copier le prompt » juste dessous invitait à
     s'en servir. On garde donc la version précédente, et on dit pourquoi. */
  const tropLongNote = (check) =>
    `Prompt refusé : ${check.count} caractères pour un plafond de ${check.limit}. ` +
    `L'atelier a resserré ${MAX_ATTEMPTS} fois sans y arriver, donc il n'affiche rien — ` +
    "un prompt hors limite est refusé par l'agent à qui tu le donnes. " +
    "Relance, ou resserre l'idée de départ : une idée très large produit un prompt long.";

  /* ---------- phase 1 : ce qui manque avant d'écrire ----------
     Boris demande les informations matérielles ; le gantelet propose des
     barres. Même contrat dans les deux cas : si rien ne manque — aucune
     question, ou une barre déjà nommée dans l'idée — on enchaîne sur la
     génération sans rien demander. */
  const analyze = async () => {
    if (!apiKey) {
      setError(
        "Aucune clé API disponible. Ouvre les réglages et colle la tienne — elle reste dans ce navigateur."
      );
      setSheet("reglages");
      return;
    }
    if (!idea.trim()) {
      setError("Décris d'abord l'idée — c'est la seule entrée obligatoire.");
      return;
    }

    setError("");
    setAudit(null);
    setNote(null);
    setNoteOuverte(false);
    setPrompt("");
    setVerif(null);
    setLog([]);
    setVersion(1);
    /* Une idée neuve ouvre une entrée neuve. Sans ces deux lignes, la v1
       qui suit s'enregistre par-dessus l'entrée encore active — celle du
       prompt précédent — et son fil reste accroché dessous. Latent tant
       que rien ne s'enregistrait avant la première correction ; visible
       dès que le juge enregistre la v1 pour y poser sa note. */
    setChat([]);
    setActiveId(null);
    setSaveState("idle");
    setRunCost({ writer: 0, judge: 0 });
    setBarres([]);
    setBarreChoisie("");
    setBarrePerso("");
    setMesure("");
    setPhase("analyzing");
    ouvrirArret();

    /* Plus de mode déclaré : l'idée dit d'elle-même si l'agent part de zéro
       ou s'intègre à un terrain existant. Imposer « nouvelle start-up » par
       défaut aurait mal cadré toutes les idées du second type. */
    const first = {
      role: "user",
      content:
        T.buildMeta(limite) +
        "\n\nIDÉE :\n" +
        idea.trim() +
        (constraints.trim() ? "\n\nCONTRAINTES IMPOSÉES :\n" + constraints.trim() : "") +
        "\n\n" +
        T.etape1.instruction(),
    };

    try {
      const raw = await ask([first], settings.writer, 1200);
      const parsed = parseJson(raw);
      const nextHistory = [first, { role: "assistant", content: raw }];
      setHistory(nextHistory);

      if (T.etape1.cle === "barres") {
        const imposee = String(parsed.barreImposee || "").trim();
        const proposees = Array.isArray(parsed.barres)
          ? parsed.barres
              .filter((b) => b && String(b.titre || "").trim())
              .slice(0, 3)
              .map((b) => ({
                titre: String(b.titre).trim(),
                pourquoi: String(b.pourquoi || "").trim(),
              }))
          : [];
        const mesuree = String(parsed.mesure || "").trim();
        setMesure(mesuree);

        if (imposee) {
          pushLog(`Barre reprise de l'idée : ${imposee}`);
          await generate(nextHistory, null, { barre: imposee, mesure: mesuree });
        } else if (proposees.length === 0) {
          /* Aucune barre proposée et aucune imposée : c'est un échec de
             l'étape, pas un feu vert. Générer quand même produirait un
             prompt SANS barre — la seule faute que cette technique ne
             survit pas. */
          setError(
            "Aucune barre n'a pu être proposée. Précise ce que tu vises, ou nomme toi-même une référence réelle (une page, un dépôt, un article) dans l'idée."
          );
          setPhase("idle");
        } else {
          setBarres(proposees);
          setBarreChoisie(proposees[0].titre);
          setPhase("choix");
        }
      } else {
        const qs = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3) : [];
        if (qs.length === 0) {
          pushLog("Analyse : rien de matériel ne manque — hypothèses tranchées.");
          await generate(nextHistory, null);
        } else {
          setQuestions(qs);
          setAnswers({});
          setPhase("choix");
        }
      }
    } catch (e) {
      setError(estArret(e) ? "Arrêté. Rien n'a été écrasé — la version en place n'a pas bougé. Corrige ta demande et relance." : `L'analyse a échoué : ${e.message}`);
      setPhase("idle");
    } finally {
      fermerArret();
    }
  };

  /* ---------- phase 2 : génération ---------- */
  const generate = async (baseHistory, answersMap, barreCtx) => {
    setPhase("generating");
    /* Son propre chantier : le bouton « Générer le prompt » l'appelle en
       direct, sans passer par l'analyse — sans cela, ce départ-là était le
       seul qu'on ne pouvait pas arrêter. */
    ouvrirArret();
    pushLog("Génération du prompt — v1…");

    const instruction = T.etape2Instruction({
      limit: limite,
      questions,
      answers: answersMap,
      barre: barreCtx?.barre ?? barreChoisie,
      mesure: barreCtx?.mesure ?? mesure,
    });

    try {
      const res = await generateVerified(baseHistory, instruction);
      setHistory(res.convo);
      setVerif(res.check);
      setPhase("done");

      /* Le compteur, la jauge et le journal des tentatives restent à
         l'écran : c'est la preuve de ce qui s'est passé. Seule la feuille
         du prompt manque, et l'erreur dit pourquoi. */
      if (res.check.over) {
        setPrompt("");
        setError(tropLongNote(res.check));
        return;
      }

      setPrompt(res.text);
      if (!res.check.pass) {
        setError(
          `Le vérificateur n'est pas au vert après ${MAX_ATTEMPTS} tentatives. Le prompt est affiché — corrige à la main ou relance.`
        );
      }
      /* Le juge enchaîne tout seul : la note est à l'écran sans qu'on ait
         à la demander. Elle n'est pas attendue pour afficher le prompt —
         la feuille est là, la jauge se remplit ensuite. */
      const premier = appendTurn(chat, {
        role: "atelier",
        text: res.text,
        version: 1,
        count: res.check.count,
        pass: res.check.pass,
      });
      setChat(premier);
      await juger({ convo: res.convo, chatCourant: premier, versionCourante: 1, texte: res.text });
    } catch (e) {
      setError(estArret(e) ? "Arrêté. Rien n'a été écrasé — la version en place n'a pas bougé. Corrige ta demande et relance." : `La génération a échoué : ${e.message}`);
      /* Arrêtée en route : on retombe là où l'on peut REPRENDRE — sur les
         questions si elles ont été posées, sur l'idée sinon. */
      setPhase(answersMap || barreCtx ? "choix" : "idle");
    } finally {
      fermerArret();
    }
  };

  /* ---------- phase 3 : le juge — une seule voix ----------

     Le juge note ET audite dans le MÊME appel. Deux appels séparés, c'était
     deux jugements du même texte qui pouvaient se contredire : une note de
     8,5 au-dessus d'une liste de trois failles graves, et rien pour dire
     lequel des deux croire.

     Il tourne tout seul après chaque version — c'est le prix d'une note
     toujours à l'écran, et il est visible : la puce « juge » du compteur de
     dépense le chiffre à chaque appel. Le bouton « Rejuger » ne sert qu'à
     redemander un avis, il n'est plus la seule façon d'en avoir un. */
  const juger = async ({ convo, chatCourant, versionCourante, texte }) => {
    setNoteLoading(true);
    try {
      /* Le juge n'est jamais le modèle qui a produit : angles morts
         corrélés (règle du playbook). */
      const raw = await ask(
        [...convo, { role: "user", content: T.auditInstruction() }],
        settings.judge,
        1600,
        "judge"
      );
      const parsed = parseJson(raw);
      const verdict = {
        verdict: String(parsed.verdict || "").trim(),
        failles: Array.isArray(parsed.failles) ? parsed.failles.slice(0, 3) : [],
        hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses.slice(0, 3) : [],
      };
      /* La grille du juge est celle de la TECHNIQUE : passée ici parce que
         le normaliseur reconstruit les critères par clé, et que six clés
         inconnues rendraient six lignes vides sous une note juste. */
      const n = normalizeNote(
        { ...parsed, pourVersion: versionCourante ?? version },
        settings.judge,
        T.CRITERES
      );
      setAudit(verdict);
      setNote(n);

      /* La note entre dans le fil et dans l'entrée : elle survit au
         rechargement et suit d'un appareil à l'autre, comme le prompt.
         Sans cela, rouvrir un prompt de la casse rendait une jauge vide
         et il fallait repayer le juge pour un chiffre déjà obtenu. */
      if (n && texte) {
        const noté = noterDernierTour(chatCourant ?? chat, n);
        setChat(noté);
        await persistWork({
          text: texte,
          version: versionCourante ?? version,
          chat: noté,
          count: countChars(texte),
          note: n,
        });
        setSaveState("saved");
      }
      return n;
    } catch (e) {
      /* Arrêté : pas de note, et surtout pas de faux verdict. La jauge
         retombe sur « pas encore jugé », ce qui est exactement vrai. */
      if (!estArret(e)) {
        setAudit({ verdict: `L'audit a échoué : ${e.message}`, failles: [], hypotheses: [] });
      }
      return null;
    } finally {
      setNoteLoading(false);
    }
  };

  /* Le bouton : rejuger la version affichée, avec la conversation qu'on a
     sous la main (celle du modèle si elle existe encore, sinon celle qu'on
     reconstruit — un prompt rouvert de la casse n'a plus d'historique). */
  const runAudit = async () => {
    if (!prompt) return;
    setAuditLoading(true);
    setAudit(null);
    const convo = history.length
      ? history
      : T.baseConvoFor({
          idea: idea + (constraints.trim() ? `\n\nCONTRAINTES IMPOSÉES :\n${constraints.trim()}` : ""),
          prompt,
          limit: limite,
        });
    ouvrirArret();
    try {
      await juger({ convo, texte: prompt });
    } finally {
      fermerArret();
      setAuditLoading(false);
    }
  };

  /* ---------- phase 4 : appliquer l'audit et régénérer ---------- */
  const applyAudit = async () => {
    if (!audit?.failles?.length) return;
    const corrections = audit.failles.map((f, i) => `${i + 1}. ${f}`).join("\n");
    const nextVersion = version + 1;

    setAudit(null);
    setError("");
    setPhase("generating");
    ouvrirArret();
    pushLog(`Application de l'audit → v${nextVersion}…`);

    /* L'audit entre au fil comme une correction : c'en est une, et le fil
       doit dire d'où vient chaque version. */
    const withDemand = appendTurn(chat, {
      role: "moi",
      text: `Audit du juge appliqué :\n${corrections}`,
    });
    setChat(withDemand);

    try {
      const instruction = T.auditApplyInstruction(corrections, limite);
      const res = await generateVerified(history, instruction);
      setHistory(res.convo);
      setVerif(res.check);
      setPhase("done");

      /* Trop long : la v en vigueur reste en place, et le fil garde la
         trace de la tentative — mais SANS son texte. `compacted` est déjà
         la marque des tours dont le texte n'est pas là : ni copie, ni
         remise en place, donc aucun moyen de récupérer par la bande un
         prompt que l'atelier vient de refuser. */
      if (res.check.over) {
        setChat(
          appendTurn(withDemand, {
            role: "atelier",
            text: `Refusé — ${res.check.count} caractères pour un plafond de ${res.check.limit}. La v${version} reste en place.`,
            version,
            count: res.check.count,
            pass: false,
            compacted: true,
          })
        );
        setError(tropLongNote(res.check));
        return;
      }

      setPrompt(res.text);
      setVersion(nextVersion);

      const full = appendTurn(withDemand, {
        role: "atelier",
        text: res.text,
        version: nextVersion,
        count: res.check.count,
        pass: res.check.pass,
      });
      setChat(full);
      await persistWork({
        text: res.text,
        version: nextVersion,
        chat: full,
        count: res.check.count,
      });
      setSaveState("saved");

      if (!res.check.pass) {
        setError(
          `Le vérificateur n'est pas au vert après ${MAX_ATTEMPTS} tentatives. Le prompt est affiché — corrige à la main ou relance.`
        );
      }
      await juger({
        convo: res.convo,
        chatCourant: full,
        versionCourante: nextVersion,
        texte: res.text,
      });
    } catch (e) {
      setError(estArret(e) ? "Arrêté. Rien n'a été écrasé — la version en place n'a pas bougé. Corrige ta demande et relance." : `La régénération a échoué : ${e.message}`);
      setPhase("done");
    } finally {
      fermerArret();
    }
  };

  const reset = () => {
    setPhase("idle");
    setQuestions([]);
    setAnswers({});
    setBarres([]);
    setBarreChoisie("");
    setBarrePerso("");
    setMesure("");
    setHistory([]);
    setPrompt("");
    setVerif(null);
    setVersion(1);
    setLog([]);
    setAudit(null);
    setNote(null);
    setNoteOuverte(false);
    setError("");
    setSaveState("idle");
    setChat([]);
    setActiveId(null);
    setDemand("");
  };

  /* « Nouveau prompt » — le geste le plus courant, qui n'avait pas de
     bouton. `reset` seul ne suffit pas : il fallait aussi vider l'idée
     précédente (sans quoi le composeur rouvre sur le texte d'avant et on
     croit que rien ne s'est passé), rouvrir la section repliée, refermer
     la casse si elle est ouverte, et remonter.

     Rien n'est perdu : le prompt en cours est déjà dans la casse — il s'y
     enregistre d'office dès que le juge le note. */
  const nouveauPrompt = () => {
    reset();
    setIdea("");
    setConstraints("");
    setShowConstraints(false);
    setIdeeOuverte(true);
    setCasseOpen(false);
    setSheet(null);
    remonter();
    /* Le curseur dans la zone de saisie : sans cela, « nouveau prompt »
       laisse l'utilisateur devant un champ vide qu'il doit aller cliquer. */
    setTimeout(() => composerRef.current?.querySelector("textarea")?.focus(), 350);
  };

  /* ---------- bibliothèque : sauver, modifier, supprimer ---------- */

  /* Une seule écriture pour tout ce qui change un prompt en cours : elle
     crée l'entrée si elle n'existe pas encore, la met à jour sinon, et
     rend son identifiant. C'est ce qui garantit qu'un fil de correction
     est TOUJOURS dans le profil, même si personne n'a cliqué
     « Sauvegarder ». */
  const persistWork = async ({ text, version: v, chat: thread, count, note: n }) => {
    const now = new Date().toISOString();

    if (activeId && library.some((item) => item.id === activeId)) {
      await commit(
        library.map((item) =>
          item.id === activeId
            ? {
                ...item,
                prompt: text,
                count,
                version: v,
                chat: thread,
                /* `n` absent ≠ « pas de note » : la version vient d'être
                   écrite et le juge n'a pas encore répondu. Effacer la
                   note ici ferait clignoter la jauge à chaque correction,
                   puisqu'on enregistre AVANT de juger. */
                ...(n ? { note: n } : {}),
                updatedAt: now,
              }
            : item
        )
      );
      return activeId;
    }

    const entry = makeEntry({
      idea,
      prompt: text,
      limit: limite,
      technique: T.id,
      version: v,
      chat: thread,
      note: n,
    });
    await commit([entry, ...library]);
    setActiveId(entry.id);
    return entry.id;
  };

  const savePrompt = async () => {
    if (!prompt) return;
    const id = await persistWork({
      text: prompt,
      version,
      chat,
      count: countChars(prompt),
    });
    setSaveState("saved");
    setOpenId(id);
  };

  /* ---------- le fil : corriger, reprendre, restaurer ---------- */

  const sendCorrection = async () => {
    const asked = demand.trim();
    if (!asked || busy || !prompt) return;

    setError("");
    setDemand("");
    setAudit(null);
    const nextVersion = version + 1;
    const withDemand = appendTurn(chat, { role: "moi", text: asked });
    setChat(withDemand);
    setPhase("generating");
    ouvrirArret();
    pushLog(`Correction demandée → v${nextVersion}…`);

    try {
      /* On repart TOUJOURS du prompt en vigueur, jamais de la conversation
         accumulée : le modèle voit la méthode, l'idée et le dernier état.
         C'est borné en coût, et surtout identique avant et après un
         rechargement — le fil se comporte pareil dans les deux cas. */
      const base = T.baseConvoFor({
        idea: idea + (constraints.trim() ? `\n\nCONTRAINTES IMPOSÉES :\n${constraints.trim()}` : ""),
        prompt,
        limit: limite,
      });
      const res = await generateVerified(base, T.correctionInstruction(asked, limite));

      setHistory(res.convo);
      setVerif(res.check);
      setPhase("done");

      /* Même règle qu'à l'audit : la correction trop longue n'écrase pas la
         version en vigueur, et son texte n'entre pas dans le fil. */
      if (res.check.over) {
        setChat(
          appendTurn(withDemand, {
            role: "atelier",
            text: `Refusé — ${res.check.count} caractères pour un plafond de ${res.check.limit}. La v${version} reste en place.`,
            version,
            count: res.check.count,
            pass: false,
            compacted: true,
          })
        );
        setError(tropLongNote(res.check));
        return;
      }

      setPrompt(res.text);
      setVersion(nextVersion);

      const full = appendTurn(withDemand, {
        role: "atelier",
        text: res.text,
        version: nextVersion,
        count: res.check.count,
        pass: res.check.pass,
      });
      setChat(full);
      await persistWork({
        text: res.text,
        version: nextVersion,
        chat: full,
        count: res.check.count,
      });
      setSaveState("saved");

      if (!res.check.pass) {
        setError(
          `Le vérificateur n'est pas au vert après ${MAX_ATTEMPTS} tentatives. Le prompt est affiché — redemande une correction ou reprends la main.`
        );
      }
      await juger({
        convo: res.convo,
        chatCourant: full,
        versionCourante: nextVersion,
        texte: res.text,
      });
    } catch (e) {
      const stop = estArret(e);
      setError(stop ? "Arrêté. Rien n'a été écrasé — la version en place n'a pas bougé. Corrige ta demande et relance." : `La correction a échoué : ${e.message}`);
      setPhase("done");
      /* La demande reste dans le fil : elle dit ce qui a été tenté. Le
         tour de réponse est marqué COUPÉ — il ne porte pas un prompt mais
         une ligne d'état, et ni le bouton copier ni la remise en place ne
         doivent s'y accrocher. */
      setChat(
        appendTurn(withDemand, {
          role: "atelier",
          text: stop ? `Arrêté — la v${version} reste en place.` : `Échec — ${e.message}`,
          version,
          count: countChars(prompt),
          pass: false,
          compacted: true,
        })
      );
    } finally {
      fermerArret();
    }
  };

  /* Rouvrir un prompt de la bibliothèque dans l'atelier, avec son fil.

     L'atelier BASCULE sur la technique de l'entrée : reprendre un prompt,
     c'est reprendre sa méthode. Sans cette bascule, un prompt de gantelet
     rouvert dans un atelier réglé sur Boris se voyait mesurer contre huit
     sections absentes — pastille rouge, note à refaire, sur un prompt
     parfaitement valide. */
  const resumeThread = (item) => {
    const Titem = techniqueOf(item.technique);
    if (item.technique && item.technique !== settings.technique) {
      setSettings((s) => ({ ...s, technique: Titem.id }));
    }
    setActiveId(item.id);
    setIdea(item.idea || "");
    setPrompt(item.prompt);
    setChat(Array.isArray(item.chat) ? item.chat : []);
    setVersion(item.version || 1);
    setVerif(Titem.verifyPrompt(item.prompt, item.limit || Titem.limiteDefaut));
    setHistory([]);
    setQuestions([]);
    setAnswers({});
    setBarres([]);
    setBarreChoisie("");
    setBarrePerso("");
    setMesure("");
    setAudit(null);
    setNote(item.note || null);
    setNoteOuverte(false);
    setLog([]);
    setError("");
    setDemand("");
    setSaveState("saved");
    setPhase("done");
    setRunCost({ writer: 0, judge: 0 });
    setCasseOpen(false); // le tiroir se referme derrière soi
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* Remettre en place une version dont le texte a survécu à la coupe. */
  const restoreTurn = async (turn) => {
    if (!canRestore(turn)) return;
    const nextVersion = version + 1;
    const count = countChars(turn.text);
    const full = appendTurn(chat, {
      role: "atelier",
      text: turn.text,
      version: nextVersion,
      count,
      pass: T.verifyPrompt(turn.text, limite).pass,
    });
    setPrompt(turn.text);
    setVersion(nextVersion);
    setVerif(T.verifyPrompt(turn.text, limite));
    setHistory([]);
    setChat(full);
    pushLog(`Version v${turn.version} remise en place → v${nextVersion}.`);
    await persistWork({ text: turn.text, version: nextVersion, chat: full, count });
  };

  const removeEntry = async (id) => {
    await commit(library.filter((item) => item.id !== id));
    if (openId === id) setOpenId(null);
    setPendingDelete(null);
  };

  const openEditor = (item) => {
    setDraft({ ...item });
    setSheet("edition");
  };

  const saveDraft = async () => {
    if (!draft) return;
    const text = draft.prompt.trim();
    if (!text) return;
    const updated = library.map((item) =>
      item.id === draft.id
        ? {
            ...item,
            title: draft.title.trim().slice(0, 160) || "Sans titre",
            prompt: text,
            count: countChars(text),
            updatedAt: new Date().toISOString(),
          }
        : item
    );
    await commit(updated);
    setSheet(null);
    setDraft(null);
  };

  const reuse = (item) => {
    setIdea(item.idea || "");
    reset();
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ---------- renommer, dupliquer, sortir ---------- */

  const startRename = (item) => {
    setRenamingId(item.id);
    setRenameDraft(item.title);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    await commit(renameEntry(library, renamingId, renameDraft));
    setRenamingId(null);
    setRenameDraft("");
  };

  const duplicate = async (item) => {
    const copyOf = duplicateEntry(item);
    await commit([copyOf, ...library]);
    setOpenId(copyOf.id);
    setLibNote(`Dupliqué : « ${copyOf.title} ».`);
  };

  const downloadOne = (item) => downloadText(`${slugify(item.title)}.md`, toMarkdown(item));

  const copyEntry = async (item) => {
    if (await copy(item.prompt)) {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const exportAll = () => {
    if (!library.length) return;
    const day = new Date().toISOString().slice(0, 10);
    downloadText(
      `bibliotheque-${user.id}-${day}.json`,
      exportBundle(library, user.id),
      "application/json;charset=utf-8"
    );
    setLibNote(`${library.length} prompt(s) exporté(s) — garde ce fichier, c'est ta copie de secours.`);
  };

  const importAll = async (file) => {
    if (!file) return;
    setLibNote("");
    setLibError("");
    const { items, error } = parseBundle(await file.text());
    if (error) return setLibError(error);
    const { items: merged, added, updated, skipped } = mergeLibraries(library, items);
    await commit(merged);
    setLibNote(
      `Import : ${added} ajouté(s), ${updated} mis à jour, ${skipped} déjà à jour ou plus ancien(s).`
    );
  };

  /* Le prompt affiché n'est pas encore une entrée : on en fabrique une, le
     temps de l'imprimer ou de la télécharger. Elle n'est pas enregistrée. */
  const currentEntry = () =>
    makeEntry({ idea, prompt, limit: limite, version, note: noteCourante, technique: T.id });

  /* ---------- impression ----------
     La feuille sort du #root par un portail : la règle d'impression masque
     alors l'application entière d'un seul trait, sans dépendre de l'arbre. */
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done);
    /* La feuille doit être peinte avant que le navigateur fige la page. */
    const start = setTimeout(() => window.print(), 90);
    /* Filet : tous les navigateurs n'émettent pas `afterprint`. */
    const release = setTimeout(done, 60000);
    return () => {
      window.removeEventListener("afterprint", done);
      clearTimeout(start);
      clearTimeout(release);
    };
  }, [printing]);

  /* ---------- dérivés ---------- */

  const busy = phase === "analyzing" || phase === "generating";
  const count = prompt ? countChars(prompt) : 0;

  /* Le temps écoulé s'affiche : c'est ce qui manquait pour distinguer une
     génération lente d'une génération bloquée. */
  useEffect(() => {
    /* Le jugement compte aussi : il enchaîne après la génération, phase
       « done », et le chronomètre s'arrêtait pile au moment où l'attente
       devenait inexplicable. */
    if (!busy && !auditLoading && !noteLoading) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [busy, auditLoading, noteLoading]);

  /* La note affichée n'est JAMAIS celle d'une autre version. Le juge répond
     après coup ; sans ce garde-fou, la note de la v2 restait au-dessus de la
     v3 pendant les vingt secondes du jugement — un chiffre juste, sur le
     mauvais prompt. */
  const noteCourante =
    note && (note.pourVersion == null || note.pourVersion === version) ? note : null;

  /* ---------- l'écran de travail, et le haut de la page ----------

     Dès qu'un travail est ouvert — analyse lancée, prompt en cours, prompt
     rappelé de la casse — les trois panneaux DOIVENT commencer sous la
     barre. Avant, la manchette (« Bonjour Gabriel », le titre en 64 px) et
     le composeur occupaient la première page entière : le prompt qu'on
     venait de demander naissait hors de l'écran, et il fallait faire
     défiler pour le voir arriver. */
  const enTravail = phase !== "idle" || Boolean(prompt);

  /* Le repli seul ne suffit pas : si la page est déjà défilée quand le
     travail s'ouvre, le haut retrouvé reste au-dessus du regard. On y
     remonte — une seule fois, au basculement, jamais pendant qu'on lit. */
  /* Remonter en haut. DEUX cibles, et il en faut deux : au-delà de 1400 px
     la fenêtre ne défile plus du tout — c'est la colonne du milieu qui
     défile chez elle. `window.scrollTo` seul ne faisait donc plus rien
     précisément là où la disposition à trois panneaux existe. */
  const remonter = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelector(".atelier-main")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const travailPrecedent = useRef(false);
  useEffect(() => {
    if (enTravail && !travailPrecedent.current) {
      setIdeeOuverte(false);
      remonter();
    }
    travailPrecedent.current = enTravail;
  }, [enTravail]);

  /* Échap referme ce qui est ouvert par-dessus : c'est le premier geste
     qu'on essaie devant un panneau modal, et il ne faisait rien. Un seul
     cran par pression — la feuille d'abord, le tiroir ensuite : fermer les
     deux d'un coup ferait disparaître un contexte qu'on n'a pas demandé à
     quitter. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (sheet) setSheet(null);
      else if (casseOpen) setCasseOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, casseOpen]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return library;
    return library.filter((item) =>
      `${item.title} ${item.idea} ${item.prompt}`.toLowerCase().includes(needle)
    );
  }, [library, search]);

  return (
    <div className="atelier">
      {/* ================= barre supérieure ================= */}
      <header className="topbar">
        <div className="topbar-inner">
          {/* Tiroir de la casse — visible seulement quand elle est repliée. */}
          <button
            className="btn btn-quiet casse-toggle"
            type="button"
            onClick={() => setCasseOpen((v) => !v)}
            aria-expanded={casseOpen}
          >
            <span className="casse-toggle-bars" aria-hidden="true" />
            <span className="casse-toggle-mot">Casse</span>
            <span className="tag">{library.length}</span>
          </button>

          <span className="brand-mark">B</span>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Atelier Boris</div>
            <div className="mono truncate text-[11px]" style={{ color: "var(--muted-2)" }}>
              {settings.writer} · juge {settings.judge}
            </div>
          </div>

          {!apiKey && (
            <button className="btn btn-quiet" type="button" onClick={() => setSheet("reglages")}>
              Ajouter une clé
            </button>
          )}

          {/* ---- créer un nouveau prompt ----
              Le geste le plus courant n'avait pas de bouton : une fois dans
              un prompt, repartir de zéro demandait de rouvrir l'idée puis
              de trouver « Recommencer » — ou de recharger la page. Il est
              dans la BARRE parce qu'on peut vouloir repartir depuis
              n'importe où, y compris le nez dans la casse.
              Il perd son mot avant 560 px et ne garde que le « + » : la
              barre a déjà débordé de 15 px à 320 px le 2026-08-01, et c'est
              toujours le dernier arrivé qui fait déborder. */}
          <button
            className="btn btn-primary btn-neuf"
            type="button"
            onClick={nouveauPrompt}
            disabled={busy}
            /* `aria-label` et pas seulement le mot : sous 700 px le mot est
               masqué et le « + » est aria-hidden — le bouton n'aurait plus
               aucun nom du tout pour un lecteur d'écran. Trouvé au pilotage,
               où le sélecteur ne le trouvait plus. */
            aria-label="Créer un nouveau prompt"
            title="Créer un nouveau prompt — le prompt en cours reste dans la casse"
          >
            <span aria-hidden="true">+</span>
            <span className="btn-neuf-mot">Nouveau prompt</span>
          </button>

          <button
            className="btn btn-quiet btn-aide"
            type="button"
            onClick={() => setSheet("aide")}
            aria-label="Aide — comment ça marche"
            title="Aide — comment ça marche"
          >
            <span aria-hidden="true">?</span>
            <span className="btn-aide-mot">Aide</span>
          </button>

          <button
            className="btn btn-quiet btn-reglages"
            type="button"
            onClick={() => setSheet("reglages")}
            aria-label="Réglages"
            title="Réglages et compte"
          >
            Réglages
          </button>

          <div className="flex items-center gap-2 pl-1">
            {/* Le sigle ouvre les réglages. Il était décoratif ; c'est
                pourtant ce qu'on touche pour trouver son compte, et sous
                560 px le bouton « Réglages » cède la place — sans ce clic,
                les réglages ET « Sortir » (qui n'est visible qu'au-dessus
                de 640 px) devenaient inatteignables sur un téléphone. */}
            <button
              className="avatar"
              type="button"
              title={`${user.name} — réglages et compte`}
              aria-label={`${user.name} — réglages et compte`}
              onClick={() => setSheet("reglages")}
            >
              {user.initial}
            </button>
            <button className="link hidden sm:inline" type="button" onClick={onLeave}>
              Sortir
            </button>
          </div>
        </div>
      </header>

      {/* Marques de repérage : le coin d'une feuille sur le marbre. */}
      <div className="marks" aria-hidden="true">
        <i /><i /><i /><i />
      </div>

      <div className={casseOpen ? "shell shell-open" : "shell"}>
        {/* ================= le pupitre : le fil, à demeure à gauche =======
            Le fil a quitté le marbre le 2026-08-02. Une correction est un
            dialogue qui dure, le prompt est la pièce qu'on regarde : les
            empiler obligeait à faire défiler toute la page pour relire ce
            qu'on venait de demander, et le prompt disparaissait de l'écran
            au moment précis où on écrivait ce qu'il fallait y changer.
            La casse, elle, est redevenue un tiroir (bouton ☰ en haut) :
            deux panneaux permanents à gauche, il n'y avait plus de milieu.
            Chaque génération a son fil, enregistré dans l'entrée de
            bibliothèque — donc dans le profil de son propriétaire, et il
            le suit d'un appareil à l'autre. */}
        <aside className="pupitre thread">
          <div className="pupitre-head">
            <span className="section-title">Fil de correction</span>
            <span className="section-line" />
            {prompt && <span className="tag tag-accent">v{version}</span>}
          </div>

          {!prompt ? (
            <p className="lede pupitre-vide">
              Le fil s'ouvre dès qu'un prompt est sur le marbre. Tu y demandes les changements
              en français ; l'atelier régénère le prompt entier, le mesure, et garde chaque
              version.
            </p>
          ) : (
            <>
              <div className="pupitre-corps">
                {chat.length === 0 ? (
                  <p className="lede text-[14px]">
                    Dis ce qu'il faut changer, en français : l'atelier régénère le prompt entier,
                    le mesure, et garde la trace. Tout le fil est enregistré chez toi.
                  </p>
                ) : (
                  chat.map((turn, i) => {
                    /* Le dernier tour de l'atelier EST le prompt du marbre :
                       le réécrire ici le montrerait deux fois. On n'en garde
                       que la ligne d'état, qui renvoie à la feuille. */
                    const courant = turn.role === "atelier" && turn.text === prompt;
                    return (
                      <div
                        key={i}
                        className={turn.role === "moi" ? "turn turn-me" : "turn turn-shop"}
                      >
                        <div className="turn-head">
                          <span>{turn.role === "moi" ? "Toi" : "Atelier"}</span>
                          {turn.version ? <span className="tag">v{turn.version}</span> : null}
                          {turn.count != null ? (
                            <span className={turn.pass === false ? "tag tag-ko" : "tag"}>
                              {turn.count} car.
                            </span>
                          ) : null}
                          <span>{formatDate(turn.at)}</span>
                        </div>

                        {courant ? (
                          <p className="turn-courant mono">
                            Version en cours — c'est le prompt sur le marbre.
                          </p>
                        ) : (
                          <pre className="turn-text">{turn.text}</pre>
                        )}

                        {/* Tout prompt sorti de l'atelier se copie, y
                            compris la version en cours et les versions
                            antérieures du fil : un texte qu'on ne peut
                            que sélectionner à la souris n'est pas livré.
                            `canRestore` est la bonne garde — un tour
                            compacté ne porte plus son texte mais une
                            note, et la copier serait mentir. */}
                        {canRestore(turn) && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              className="btn btn-quiet"
                              type="button"
                              onClick={async () => {
                                if (await copy(turn.text)) {
                                  setCopiedTurn(i);
                                  setTimeout(() => setCopiedTurn(null), 2000);
                                }
                              }}
                            >
                              {copiedTurn === i ? "Copié ✓" : "Copier ce prompt"}
                            </button>
                            {!courant && (
                              <button
                                className="btn btn-quiet"
                                type="button"
                                onClick={() => restoreTurn(turn)}
                                disabled={busy}
                              >
                                Remettre cette version
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pupitre-pied">
                <textarea
                  rows={3}
                  value={demand}
                  onChange={(e) => setDemand(e.target.value)}
                  placeholder={T.exempleCorrection}
                  /* Entrée+Cmd (ou Ctrl) envoie : la touche Entrée seule doit
                     rester libre, une consigne tient souvent en trois lignes. */
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendCorrection();
                  }}
                />

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={sendCorrection}
                    disabled={busy || !demand.trim()}
                  >
                    {busy ? "En cours…" : `Corriger → v${version + 1}`}
                  </button>
                  <span className="mono text-[11px]" style={{ color: "var(--muted-2)" }}>
                    ⌘/Ctrl + Entrée
                  </span>
                </div>
              </div>
            </>
          )}
        </aside>

        <Casse
          items={shown}
          total={library.length}
          search={search}
          setSearch={setSearch}
          activeId={activeId}
          open={casseOpen}
          onClose={() => setCasseOpen(false)}
          loading={libLoading}
          remote={libRemote}
          note={libNote}
          error={libError}
          expandedId={openId}
          setExpandedId={setOpenId}
          renamingId={renamingId}
          renameDraft={renameDraft}
          setRenameDraft={setRenameDraft}
          cancelRename={cancelRename}
          onStartRename={startRename}
          onCancelRename={() => setRenamingId(null)}
          onCommitRename={commitRename}
          onResume={resumeThread}
          onDuplicate={duplicate}
          onDownload={downloadOne}
          onPrint={setPrinting}
          onEdit={openEditor}
          onCopy={copyEntry}
          copiedId={copiedId}
          pendingDelete={pendingDelete}
          setPendingDelete={setPendingDelete}
          onRemove={removeEntry}
          onExport={exportAll}
          onImport={() => fileRef.current?.click()}
          fileRef={fileRef}
          onFile={importAll}
        />

        <button
          className="casse-veil"
          type="button"
          aria-label="Replier la casse"
          onClick={() => setCasseOpen(false)}
        />

      <main className="atelier-main">
        {/* ================= manchette — l'accueil, et rien d'autre =======
            Elle disparaît dès qu'un travail est ouvert. « Bonjour Gabriel »
            en 64 px et les six lignes du composeur occupaient la première
            page entière : le prompt qu'on venait de demander naissait donc
            SOUS le pli, et il fallait faire défiler pour le voir arriver.
            L'accueil a sa place au premier écran d'une session, pas
            au-dessus de chaque prompt. */}
        {!enTravail && (
          <section className="rise pt-12 pb-10 sm:pt-16">
            <div className="eyebrow mb-4">{T.bandeau}</div>
            <h1 className="display text-[clamp(38px,6.6vw,64px)]">
              Bonjour {user.name}.
              <br />
              Qu'est-ce que tu <em>confies</em> aujourd'hui&nbsp;?
            </h1>
            {/* En français courant, et testé sur ce critère : quelqu'un qui
                n'a jamais écrit un prompt doit comprendre ce qu'il va
                recevoir. Les mots du métier — oracle, escalade, invariants,
                sortie verrouillée — sont ce que l'atelier ÉCRIT, pas ce
                qu'il faut savoir pour s'en servir. */}
            <p className="lede mt-6">{T.accroche}</p>

            <div className="mt-8 flex flex-wrap gap-2">
              <span className="tag tag-accent">{library.length} prompt{library.length > 1 ? "s" : ""} en bibliothèque</span>
              <span className="tag tag-accent" data-tip={T.quand}>{T.nom}</span>
              <span className="tag">limite {limite} car.</span>
              <span className={apiKey ? "tag tag-ok" : "tag tag-ko"}>
                {usingShared ? "clé de l'atelier" : apiKey ? "ta clé" : "clé manquante"}
              </span>
              <span className="tag" title="Dépense API cumulée de ton compte, tous appareils confondus">
                dépense à date {formatCost(totalCost ?? 0)}
              </span>
              {!libRemote && <span className="tag tag-ko">hors ligne</span>}
            </div>
          </section>
        )}

        {/* ================= l'idée =================
            Repliée en une ligne pendant le travail : elle reste lisible et
            se rouvre d'un clic. Ce n'est pas un masquage — c'est la même
            section, le même `composerRef`, la même idée. */}
        <section
          ref={composerRef}
          className={
            enTravail
              ? ideeOuverte
                ? "card mt-5 p-6 sm:p-7"
                : "card idee-repliee mt-5"
              : "card p-6 sm:p-7"
          }
        >
          {enTravail && !ideeOuverte ? (
            <div className="idee-ligne">
              <span className="eyebrow idee-etiquette">L'idée</span>
              <span className="idee-extrait" title={idea}>
                {idea.trim() || "—"}
              </span>
              <button
                className="btn btn-quiet"
                type="button"
                onClick={() => setIdeeOuverte(true)}
                disabled={busy}
              >
                Modifier
              </button>
              <button className="btn btn-quiet" type="button" onClick={reset} disabled={busy}>
                Recommencer
              </button>
            </div>
          ) : (
            <>
              {/* Le choix de la technique est ICI, au-dessus de l'idée, et
                  pas dans les réglages : il ne se règle pas une fois pour
                  toutes, il se décide à chaque travail — ce sont deux
                  produits différents, pas deux préférences.

                  Il se verrouille dès qu'un prompt est au marbre : changer
                  de technique sous un prompt existant ferait juger et
                  corriger ce prompt-là avec les règles de l'autre méthode,
                  sans que rien à l'écran ne le dise. « Nouveau prompt »
                  rouvre le choix. */}
              <div className="techniques" role="group" aria-label="Technique">
                {TECHNIQUES.map((t) => {
                  const active = t.id === T.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={active ? "technique technique-active" : "technique"}
                      aria-pressed={active}
                      disabled={busy || Boolean(prompt)}
                      data-tip={prompt ? "Recommencer pour changer de technique" : t.quand}
                      onClick={() => setSettings({ ...settings, technique: t.id })}
                    >
                      <span className="technique-nom">{t.nom}</span>
                      <span className="technique-resume">{t.resume}</span>
                      <span className="technique-sortie mono">{t.sortie}</span>
                    </button>
                  );
                })}
              </div>

              <textarea
                rows={6}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                disabled={busy}
                placeholder={T.exempleIdee}
              />

              <button
                className="link mt-4"
                type="button"
                onClick={() => setShowConstraints((v) => !v)}
                disabled={busy}
              >
                {showConstraints ? "− Masquer les contraintes" : "+ Contraintes imposées (optionnel)"}
              </button>

              {showConstraints && (
                <div className="mt-4">
                  <textarea
                    rows={3}
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    disabled={busy}
                    placeholder={T.exempleContraintes}
                  />
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={analyze}
                  disabled={busy || phase === "choix"}
                >
                  {phase === "analyzing" ? "Analyse en cours…" : "Analyser l'idée"}
                </button>
                {enTravail && (
                  /* « Replier l'idée », et pas « Replier » : le tiroir de
                     la casse porte déjà un bouton « Replier ». Deux
                     libellés identiques dans la même page ne se
                     distinguent pas à l'oreille d'un lecteur d'écran —
                     trouvé au pilotage, où le sélecteur en a ramené trois. */
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setIdeeOuverte(false)}
                  >
                    Replier l'idée
                  </button>
                )}
                {(phase === "done" || phase === "choix") && (
                  <button className="btn btn-ghost" type="button" onClick={reset} disabled={busy}>
                    Recommencer
                  </button>
                )}
              </div>
            </>
          )}

          {/* L'erreur reste visible repliée ou dépliée : c'est la seule
              chose de cette section qu'on ne doit jamais avoir à rouvrir
              pour lire. */}
          {error && <p className="note note-error mt-5">{error}</p>}
        </section>

        {/* ================= 01 · ce qui manque avant d'écrire =========
            Une seule phase, deux formes : Boris pose des questions, le
            gantelet fait choisir une barre. Le titre vient de la
            technique — écrire « Questions matérielles » au-dessus d'une
            liste de références serait un mensonge d'écran. */}
        {phase === "choix" && (
          <section className="card rise mt-6 p-6 sm:p-7">
            <div className="section-head">
              <span className="section-num">01</span>
              <span className="section-title">{T.etape1.titre}</span>
              <span className="section-line" />
            </div>

            {T.etape1.cle === "barres" ? (
              <>
                <p className="lede mb-5 text-[14.5px]">
                  C'est la barre qui fait tout : l'agent ira chercher cette chose-là et
                  recommencera jusqu'à la battre à l'aveugle. Choisis la plus dure qu'il puisse
                  réellement atteindre — une barre trop facile fait sortir la boucle au premier
                  tour, une barre vague la fait tout approuver.
                </p>

                <div className="flex flex-col gap-4">
                  {barres.map((b, i) => {
                    const active = !barrePerso.trim() && barreChoisie === b.titre;
                    return (
                      <button
                        key={i}
                        type="button"
                        className={active ? "barre barre-active" : "barre"}
                        aria-pressed={active}
                        onClick={() => {
                          setBarreChoisie(b.titre);
                          setBarrePerso("");
                        }}
                      >
                        <span className="mono barre-lettre">{"ABC"[i] || "•"}</span>
                        <span className="barre-corps">
                          <span className="barre-titre">{b.titre}</span>
                          {b.pourquoi && <span className="barre-pourquoi">{b.pourquoi}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <label className="field-label mt-5" htmlFor="barre-perso">
                  Ou la tienne — nommée, récupérable, comparable
                </label>
                <input
                  id="barre-perso"
                  type="text"
                  value={barrePerso}
                  onChange={(e) => setBarrePerso(e.target.value)}
                  placeholder="Une page, un dépôt, un article, un produit précis…"
                />

                {mesure && (
                  <p className="note note-info mt-4">
                    Moitié mesurable repérée : {mesure}. Elle entrera dans le prompt à côté de la
                    référence — le goût plus un chiffre bat le goût seul.
                  </p>
                )}

                <button
                  className="btn btn-primary mt-6"
                  type="button"
                  disabled={!barrePerso.trim() && !barreChoisie.trim()}
                  onClick={() =>
                    generate(history, null, {
                      barre: barrePerso.trim() || barreChoisie,
                      mesure,
                    })
                  }
                >
                  Générer le prompt
                </button>
              </>
            ) : (
              <>
                <p className="lede mb-5 text-[14.5px]">
                  Chaque réponse change le terrain, l'escalade ou la sortie. Une réponse laissée vide
                  sera tranchée par hypothèse raisonnable, signalée dans le prompt.
                </p>

                <div className="flex flex-col gap-4">
                  {questions.map((q, i) => (
                    <div key={i} className="card-inset p-4">
                      <div className="mono mb-2 text-xs" style={{ color: "var(--ember)" }}>
                        Q{i + 1}
                      </div>
                      <p className="mb-3 text-[14.5px] leading-relaxed">{q}</p>
                      <input
                        type="text"
                        value={answers[i] || ""}
                        onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                        placeholder="Ta réponse (ou laisse vide)"
                      />
                    </div>
                  ))}
                </div>

                <button
                  className="btn btn-primary mt-6"
                  type="button"
                  onClick={() => generate(history, answers)}
                >
                  Générer le prompt
                </button>
              </>
            )}
          </section>
        )}

        {/* ================= 02 · le marbre — la pièce, et rien d'autre ===
            Le marbre ne porte plus que le prompt et les gestes qu'on peut
            faire dessus. Tout ce qui dit l'ÉTAT du travail — la note, le
            journal, la dépense, le chrono, le juge — est passé à l'épreuve,
            sur le bord droit : c'est ce qu'on surveille pendant que ça
            tourne, et le surveiller obligeait à quitter le prompt des yeux
            puisque les deux se disputaient la même colonne. */}
        {(phase === "generating" || phase === "done") && (
          <section
            ref={resultRef}
            className={`card rise mt-6 p-6 sm:p-7 ${phase === "generating" ? "working" : ""}`}
          >
            <div className="section-head">
              <span className="section-num">02</span>
              <span className="section-title">Le prompt</span>
              <span className="section-line" />
              <span className="tag tag-accent">v{version}</span>
            </div>

            {/* Le texte pendant qu'il arrive. Sans lui, une réponse d'une
                minute était indiscernable d'un blocage. */}
            {busy && stream && <pre className="prompt-sheet mt-4">{stream}</pre>}

            {phase === "generating" && !stream && (
              <p className="lede mt-4 text-[14px]">
                Le prompt s'écrira ici, ligne à ligne. L'état de la course est à droite, sur
                l'épreuve.
              </p>
            )}

            {phase === "done" && prompt && (
              <>
                <pre className="prompt-sheet mt-6">{prompt}</pre>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={async () => {
                      if (await copy(prompt)) {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }
                    }}
                  >
                    {copied ? "Copié ✓" : "Copier le prompt"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={savePrompt}
                    disabled={saveState === "saved"}
                  >
                    {saveState === "saved" ? "Dans la bibliothèque ✓" : "Sauvegarder"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={runAudit}
                    disabled={auditLoading}
                  >
                    {auditLoading ? "Le juge relit…" : "Rejuger"}
                  </button>
                  <button
                    className="btn btn-quiet"
                    type="button"
                    onClick={() => downloadOne(currentEntry())}
                  >
                    Télécharger .md
                  </button>
                  <button
                    className="btn btn-quiet"
                    type="button"
                    onClick={() => setPrinting(currentEntry())}
                  >
                    Imprimer
                  </button>
                </div>

                {libError && <p className="note note-error mt-4">{libError}</p>}
              </>
            )}

          </section>
        )}


        {/* La note de bas de colonne est partie : elle répétait ce que dit
            désormais le pied de page, et coûtait 92 px de haut avec sa
            marge — sur les 213 px qui faisaient dépasser l'écran. Sa
            phrase, qui valait d'être dite, est passée à l'aide (§ 04). */}
      </main>

      {/* ================= l'épreuve : le travail en cours, à droite =====

          En typographie, l'épreuve est la feuille qu'on tire pour voir ce
          que vaut le travail avant de le tirer pour de bon. C'est ce que
          fait ce panneau : la note du juge, ce qu'il reproche, ce que ça
          coûte, où en est la course, et de quoi l'arrêter.

          Il tient le bord droit à demeure — comme le pupitre tient le
          gauche — parce que c'est ce qu'on SURVEILLE pendant que ça tourne.
          Empilé dans la colonne du milieu, il se disputait la place avec le
          prompt : lire l'un chassait l'autre de l'écran. Sous 1400 px il n'y
          a plus de bord à prendre, il repasse dans le flux au-dessus du
          marbre. */}
      <aside className="epreuve">
        <div className="epreuve-head">
          <span className="section-title">Travail en cours</span>
          <span className="section-line" />
          {enTravail && <span className="tag tag-accent">v{version}</span>}
        </div>

        <div className="epreuve-corps">
          {!enTravail ? (
            <p className="lede epreuve-vide">
              Rien sur l'établi. Décris une idée à gauche, ou rappelle un prompt de la casse :
              tout ce qui se mesure — la note du juge, la dépense, le journal de la course —
              paraîtra ici.
            </p>
          ) : (
            <>
              {/* ---- la note, à la place du compte de caractères ----
                  Le grand nombre était la longueur : la mesure exacte de la
                  seule chose qui ne dit rien de la qualité. Deux prompts de
                  3 800 caractères, l'un sans oracle et l'autre qui tient la
                  méthode, affichaient le même chiffre. La longueur n'a pas
                  disparu — elle est passée en puce, avec le reste de ce qui
                  se compte. */}
              <div className="note-rangee">
                <JaugeNote
                  note={noteCourante}
                  encours={noteLoading || (phase === "generating" && !prompt)}
                />

                <div className="note-flanc">
                  {noteCourante ? (
                    <>
                      <p className="note-mot">{bandeDe(noteCourante.note).mot}</p>
                      {noteCourante.verdict && (
                        <p className="note-verdict">{noteCourante.verdict}</p>
                      )}
                    </>
                  ) : (
                    <p className="note-mot" style={{ color: "var(--muted-2)" }}>
                      {noteLoading ? "Le juge lit le prompt…" : "Pas encore jugé."}
                    </p>
                  )}

                  <div className="mono mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                    <button
                      className="note-plus"
                      type="button"
                      aria-expanded={noteOuverte}
                      title="Voir le détail de la note"
                      onClick={() => setNoteOuverte((v) => !v)}
                      disabled={!noteCourante}
                    >
                      ⋯
                    </button>
                    <span className={verif?.pass ? "tag tag-ok" : "tag tag-ko"}>
                      {count} car. · limite {limite}
                      {verif?.mots != null && ` · ${verif.mots} mots`}
                    </span>
                    {noteCourante?.juge && <span className="tag">juge {noteCourante.juge}</span>}
                  </div>
                </div>
              </div>

              {/* Le détail ne s'ouvre que si on le demande : la jauge se lit
                  sans rien déplier, et six critères ouverts d'office
                  poussaient le reste de l'épreuve hors de vue. */}
              {noteOuverte && noteCourante && (
                <div className="card-inset note-detail mt-5 p-5">
                  {noteCourante.criteres.map((c) => (
                    <div key={c.cle} className="critere">
                      <div className="critere-tete">
                        <span className="critere-nom">{c.nom}</span>
                        <span className="critere-barre">
                          <span
                            style={{
                              width: `${((c.note ?? 0) / 10) * 100}%`,
                              background: bandeDe(c.note ?? 0).ton,
                            }}
                          />
                        </span>
                        <span
                          className="critere-note mono"
                          style={{ color: c.note == null ? "var(--muted-2)" : bandeDe(c.note).ton }}
                        >
                          {c.note == null ? "—" : fr(c.note)}
                        </span>
                      </div>
                      {c.mot && <p className="critere-mot">{c.mot}</p>}
                    </div>
                  ))}
                  <p className="mono critere-regle">
                    La note globale n'est pas la moyenne : elle ne dépasse pas de plus de 2 points
                    le plus faible des critères — sinon cinq critères à 9 et un vérificateur à 2
                    donneraient « bon prompt ».
                  </p>
                </div>
              )}

              {/* Le compteur vit : il bouge à chaque appel, pendant la
                  génération comme à l'audit. Prompt = tous les appels du
                  modèle qui produit ; juge = ceux de l'audit. */}
              <div className="mono mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="tag">prompt {formatCost(runCost.writer)}</span>
                <span className="tag">juge {formatCost(runCost.judge)}</span>
                <span className="tag tag-accent">total à date {formatCost(totalCost ?? 0)}</span>
              </div>

              {/* L'arrêt est À CÔTÉ du temps écoulé, pas ailleurs : c'est la
                  ligne qu'on regarde pendant qu'on attend, et c'est là qu'on
                  décide qu'on a assez attendu. Il coupe l'appel réseau en
                  cours — donc aussi la réparation qui vient de partir et le
                  juge qui enchaîne. */}
              {(busy || auditLoading || noteLoading) && (
                <div className="mono mt-4 flex flex-wrap items-center gap-3 text-[11.5px]">
                  <span style={{ color: "var(--muted-2)" }}>
                    › {elapsed} s écoulées
                    {stream
                      ? ` · ${countChars(stream)} caractères reçus`
                      : " · en attente du modèle…"}
                  </span>
                  {arretable && (
                    <button className="btn btn-quiet btn-danger" type="button" onClick={arreter}>
                      ⏹ Arrêter
                    </button>
                  )}
                </div>
              )}

              {log.length > 0 && (
                <div
                  className="mono epreuve-journal mt-4 text-[11.5px] leading-relaxed"
                  style={{ color: "var(--muted)" }}
                >
                  {log.map((line, i) => (
                    <div key={i}>› {line}</div>
                  ))}
                </div>
              )}

              {audit && (
                <div className="card-inset mt-5 p-5">
                  {/* Le verdict est déjà à côté de la jauge : le répéter ici
                      donnait deux fois la même phrase à dix centimètres
                      d'écart. Ce panneau ne garde que ce qui appelle un
                      GESTE — les failles, qu'on applique en une version de
                      plus, et les hypothèses, qu'on doit connaître. */}
                  <div className="eyebrow mb-3">Ce que le juge reproche — {settings.judge}</div>

                  {audit.failles?.length ? (
                    <div className="mb-4">
                      <div
                        className="mono mb-2 text-[10.5px] uppercase tracking-[0.2em]"
                        style={{ color: "var(--alarm)" }}
                      >
                        Failles
                      </div>
                      {audit.failles.map((f, i) => (
                        <p
                          key={i}
                          className="text-[14px] leading-relaxed"
                          style={{ color: "var(--muted)" }}
                        >
                          — {f}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="note note-ok mb-4">Aucune faille — rien à appliquer.</p>
                  )}

                  {audit.hypotheses?.length > 0 && (
                    <div>
                      <div
                        className="mono mb-2 text-[10.5px] uppercase tracking-[0.2em]"
                        style={{ color: "var(--ember)" }}
                      >
                        Hypothèses tranchées
                      </div>
                      {audit.hypotheses.map((h, i) => (
                        <p
                          key={i}
                          className="text-[14px] leading-relaxed"
                          style={{ color: "var(--muted)" }}
                        >
                          — {h}
                        </p>
                      ))}
                    </div>
                  )}

                  {audit.failles?.length > 0 && (
                    <button
                      className="btn btn-primary mt-5"
                      type="button"
                      onClick={applyAudit}
                      disabled={busy}
                    >
                      Appliquer l'audit → v{version + 1}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
      </div>

      {sheet === "aide" && <AideSheet onClose={() => setSheet(null)} />}

      {sheet === "reglages" && (
        <SettingsSheet
          user={user}
          onUser={onUser}
          ownKey={ownKey}
          usingShared={usingShared}
          setOwnKey={(value) => {
            setOwnKey(value);
            saveApiKey(value);
          }}
          settings={settings}
          setSettings={setSettings}
          onClose={() => setSheet(null)}
          onLeave={onLeave}
        />
      )}

      {sheet === "edition" && draft && (
        <EditorSheet
          draft={draft}
          setDraft={setDraft}
          onSave={saveDraft}
          onClose={() => {
            setSheet(null);
            setDraft(null);
          }}
        />
      )}

      {/* Il ne paraît que pendant un appel à Claude — tous les appels. */}
      {(busy || auditLoading || noteLoading) && (
        <Penseur
          phase={phase}
          judging={auditLoading}
          elapsed={elapsed}
          chars={countChars(stream)}
        />
      )}

      {/* ================= le pied de page =================
          Hors de la coquille : les deux bords sont collants et n'ont pas
          de bas — un pied posé dans la colonne du milieu aurait été un pied
          de colonne, pas un pied de page. */}
      <footer className="pied">
        <div className="pied-inner">
          <p className="pied-legal mono">
            © {PIED.annee} {PIED.proprietaire} — {PIED.marque}
            <span className="pied-r" aria-label="marque déposée">®</span>. {PIED.droits}
          </p>
          <p className="pied-secu" title={PIED.securite}>{PIED.securiteCourte}</p>
          <button className="link pied-lien" type="button" onClick={() => setSheet("aide")}>
            Comment ça marche
          </button>
        </div>
      </footer>

      {printing && createPortal(<PrintSheet entry={printing} />, document.body)}
    </div>
  );
}

/* ================================================================
   L'AIDE — l'atelier expliqué, chapitre par chapitre.

   Le contenu vit en données dans `src/aide.js` : le vérificateur le relit
   sans navigateur, et les huit sections annoncées sont comparées à celles
   qu'impose réellement le méta-prompt. Une aide qui décrit un produit qui
   n'existe plus est pire que pas d'aide.

   Le sommaire n'est pas décoratif : douze chapitres dans un panneau qui
   défile, on n'atteint le douzième qu'en passant devant les onze autres.
   ================================================================ */

function AideSheet({ onClose }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet sheet-aide"
        role="dialog"
        aria-modal="true"
        aria-label="Aide — comment ça marche"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Aide</div>
            <h2 className="display mt-2 text-3xl">Comment ça marche</h2>
          </div>
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Fermer
          </button>
        </div>

        <p className="lede mb-6 text-[15px]">
          Cet atelier transforme une idée racontée en français en un <em>mandat</em> : le
          texte qu'on donne à un agent pour qu'il travaille seul. Il dit ce qu'il faut
          obtenir, ce qui est interdit, comment on verra que c'est réussi, et quand
          s'arrêter pour te demander. Chaque chapitre ci-dessous correspond à une partie
          de l'écran.
        </p>

        {/* Le sommaire : les chapitres se parcourent, ils ne se déroulent
            pas. (Leur nombre n'est plus écrit ici : il a été faux le jour
            où il y en a eu quatorze.) */}
        <nav className="aide-sommaire" aria-label="Sommaire">
          {CHAPITRES.map((c) => (
            <a key={c.cle} className="aide-lien" href={`#aide-${c.cle}`}>
              <span className="mono aide-lien-num">{c.num}</span>
              {c.titre}
            </a>
          ))}
        </nav>

        {CHAPITRES.map((c) => (
          <section key={c.cle} id={`aide-${c.cle}`} className="aide-chapitre">
            <div className="section-head">
              <span className="section-num">{c.num}</span>
              <span className="section-title">{c.titre}</span>
              <span className="section-line" />
            </div>

            {/* À quoi cette partie SERT, en une phrase, avant le détail :
                c'est la seule ligne que beaucoup liront. */}
            <p className="aide-sert">{c.sert}</p>

            <ul className="aide-points">
              {c.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>

            {c.sections && (
              <div className="card-inset aide-sections mt-4 p-4">
                {c.sections.map(([titre, quoi]) => (
                  <div key={titre} className="aide-section">
                    <div className="mono aide-section-titre">{titre}</div>
                    <p className="aide-section-quoi">{quoi}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        <div className="aide-pied">
          <p className="mono">
            © {PIED.annee} {PIED.proprietaire} — {PIED.marque}
            <span className="pied-r">®</span>. {PIED.droits}
          </p>
          <button className="btn btn-primary mt-4" type="button" onClick={onClose}>
            Fermer l'aide
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   LE PENSEUR — il paraît dès qu'on fait appel à Claude, et seulement
   alors : analyse, génération, audit du juge, correction, v2.

   Pas un GIF : une photo fixe et de l'animation en CSS. Le vocabulaire
   est celui de l'atelier — trame de similigravure qui dérive comme un
   écran mal calé, encre braise qui monte et redescend, anneau de
   repérage qui tourne. Quelques kilo-octets, net à toute taille, et
   immobile pour qui a demandé moins de mouvement.
   ================================================================ */

function Penseur({ phase, judging, elapsed, chars }) {
  const dit = judging
    ? "le juge relit"
    : phase === "analyzing"
      ? "il lit l'idée"
      : "il compose";

  return (
    <div className="penseur" role="status" aria-live="polite">
      <div className="penseur-portrait">
        <img src="/penseur.gif" alt="" width="160" height="160" />
        <span className="penseur-trame" aria-hidden="true" />
        <span className="penseur-anneau" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="eyebrow penseur-dit">{dit}</div>
        <div className="mono penseur-chiffres">
          {elapsed} s{chars > 0 ? ` · ${chars} car.` : ""}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   LA CASSE — le meuble du typographe, à gauche.

   Chaque prompt enregistré y occupe son cassetin. Un clic sur le titre
   le remet sur le marbre (l'atelier) avec son fil ; « ⋯ » ouvre les
   gestes de ce cassetin-là. Panneau fixe au-delà de 1100 px, tiroir
   coulissant en dessous — mais TOUJOURS dans le document : un tiroir
   replié se referme par transformation, il ne se démonte pas.
   ================================================================ */

function Casse({
  items,
  total,
  search,
  setSearch,
  activeId,
  onClose,
  loading,
  remote,
  note,
  error,
  expandedId,
  setExpandedId,
  renamingId,
  renameDraft,
  setRenameDraft,
  cancelRename,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onResume,
  onDuplicate,
  onDownload,
  onPrint,
  onEdit,
  onCopy,
  copiedId,
  pendingDelete,
  setPendingDelete,
  onRemove,
  onExport,
  onImport,
  fileRef,
  onFile,
}) {
  return (
    <aside className="casse" aria-label="Bibliothèque de prompts">
      <div className="casse-head">
        <div>
          <div className="eyebrow">La casse</div>
          <div className="casse-count mono">
            {total} prompt{total > 1 ? "s" : ""}
            {!remote && <span className="tag tag-ko ml-2">hors ligne</span>}
          </div>
        </div>
        <button className="btn btn-quiet casse-shut" type="button" onClick={onClose}>
          Replier
        </button>
      </div>

      {total > 0 && (
        <input
          type="text"
          className="casse-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Chercher…"
        />
      )}

      {note && <p className="note note-info casse-note">{note}</p>}
      {error && <p className="note note-error casse-note">{error}</p>}

      <div className="casse-body">
        {loading ? (
          <p className="mono pulse casse-empty">chargement…</p>
        ) : total === 0 ? (
          <p className="casse-empty">
            Rien encore. Génère un prompt, puis « Sauvegarder » — il te suivra d'un appareil à
            l'autre, et toi seul y as accès.
          </p>
        ) : items.length === 0 ? (
          <p className="casse-empty">Aucun prompt ne correspond à « {search} ».</p>
        ) : (
          items.map((item) => {
            const open = expandedId === item.id;
            return (
              <article
                key={item.id}
                className={`cassetin${activeId === item.id ? " cassetin-active" : ""}`}
              >
                <div className="cassetin-row">
                  {renamingId === item.id ? (
                    <input
                      type="text"
                      className="lib-rename"
                      value={renameDraft}
                      autoFocus
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                          cancelRename.current = true;
                          e.currentTarget.blur();
                        }
                      }}
                      onBlur={() => {
                        if (cancelRename.current) {
                          cancelRename.current = false;
                          onCancelRename();
                          return;
                        }
                        onCommitRename();
                      }}
                    />
                  ) : (
                    <button className="casse-open" type="button" onClick={() => onResume(item)}>
                      <span className="cassetin-title">{item.title}</span>
                      <span className="cassetin-meta mono">
                        v{item.version} · {item.count} car.
                        {item.chat?.length
                          ? ` · ${item.chat.filter((t) => t.role === "moi").length} correction(s)`
                          : ""}
                      </span>
                    </button>
                  )}

                  <button
                    className="casse-more"
                    type="button"
                    aria-label="Gestes de ce prompt"
                    aria-expanded={open}
                    onClick={() => setExpandedId(open ? null : item.id)}
                  >
                    ⋯
                  </button>
                </div>

                {open && (
                  <div className="cassetin-acts">
                    <button className="btn btn-quiet" type="button" onClick={() => onResume(item)}>
                      Reprendre le fil
                    </button>
                    <button className="btn btn-quiet" type="button" onClick={() => onCopy(item)}>
                      {copiedId === item.id ? "Copié ✓" : "Copier"}
                    </button>
                    <button className="btn btn-quiet" type="button" onClick={() => onEdit(item)}>
                      Modifier
                    </button>
                    <button
                      className="btn btn-quiet"
                      type="button"
                      onClick={() => onStartRename(item)}
                    >
                      Renommer
                    </button>
                    <button
                      className="btn btn-quiet"
                      type="button"
                      onClick={() => onDuplicate(item)}
                    >
                      Dupliquer
                    </button>
                    <button
                      className="btn btn-quiet"
                      type="button"
                      onClick={() => onDownload(item)}
                    >
                      Télécharger
                    </button>
                    <button className="btn btn-quiet" type="button" onClick={() => onPrint(item)}>
                      Imprimer
                    </button>
                    {pendingDelete === item.id ? (
                      <>
                        <button
                          className="btn btn-quiet btn-danger"
                          type="button"
                          onClick={() => onRemove(item.id)}
                        >
                          Confirmer
                        </button>
                        <button
                          className="btn btn-quiet"
                          type="button"
                          onClick={() => setPendingDelete(null)}
                        >
                          Non
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-quiet btn-danger"
                        type="button"
                        onClick={() => setPendingDelete(item.id)}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Copie de secours. La bibliothèque ne vit que dans la clé-valeur :
          un magasin vidé, et tout part. Un fichier chez soi répare ça. */}
      <div className="casse-foot">
        <button className="btn btn-quiet" type="button" onClick={onExport} disabled={total === 0}>
          Exporter
        </button>
        <button className="btn btn-quiet" type="button" onClick={onImport}>
          Importer
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // réimporter le même fichier reste possible
            onFile(file);
          }}
        />
      </div>
    </aside>
  );
}

/* ================================================================
   LA JAUGE DE LA NOTE

   Un cadran de 180°, l'aiguille sur la note. Les trois bandes sont
   PEINTES sur la piste — rouge sous 6, orange de 6 à 8, vert au-delà —
   et non déduites de la note : on voit où tombe un 7,5 sans connaître le
   barème, et on voit de combien il s'en faut pour passer au vert. Une
   barre qui change seulement de couleur ne dit ni l'un ni l'autre.

   Pure géométrie, aucune police : le chiffre est en HTML par-dessus, donc
   il hérite de la fonte d'affichage et reste net à toute densité.
   ================================================================ */

const R = 78;
const CX = 100;
const CY = 96;

/* note 0 → 180° (à gauche), note 10 → 0° (à droite). */
const angleDe = (n) => 180 - 18 * Math.min(10, Math.max(0, n));
const pointDe = (n) => {
  const a = (angleDe(n) * Math.PI) / 180;
  return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
};
const arcDe = (de, a) => {
  const [x1, y1] = pointDe(de);
  const [x2, y2] = pointDe(a);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

function JaugeNote({ note, encours }) {
  const valeur = note ? note.note : null;
  const ton = valeur == null ? "var(--muted-2)" : bandeDe(valeur).ton;
  /* Le repère traverse l'ÉPAISSEUR de l'arc ; il ne part pas du centre.
     Mesuré : une aiguille depuis le centre passait à travers le chiffre —
     à 7,5 elle barrait le « 5 ». Ici rien n'entre dans le cadran. */
  const rad = (angleDe(valeur ?? 0) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = -Math.sin(rad);

  return (
    <div className={`jauge-note${encours ? " pulse" : ""}`}>
      <svg
        viewBox="0 0 200 118"
        role="img"
        aria-label={valeur == null ? "Pas encore jugé" : `Note ${fr(valeur)} sur 10`}
      >
        {/* Le barème est peint À DEMEURE : on voit où tombe un 7,5 et de
            combien il s'en faut pour passer au vert. Une barre qui change
            seulement de couleur ne dit ni l'un ni l'autre. */}
        <path className="bande" d={arcDe(0, 6)} stroke="var(--alarm)" />
        <path className="bande" d={arcDe(6, 8)} stroke="var(--ember)" />
        <path className="bande" d={arcDe(8, 10)} stroke="var(--signal)" />

        {valeur != null && valeur > 0 && (
          <path className="rempli" d={arcDe(0, valeur)} stroke={ton} />
        )}

        {valeur != null && (
          <line
            className="repere"
            x1={CX + dx * (R - 10)}
            y1={CY + dy * (R - 10)}
            x2={CX + dx * (R + 10)}
            y2={CY + dy * (R + 10)}
          />
        )}

        <text className="jauge-bout" x="9" y="116">0</text>
        <text className="jauge-bout" x="191" y="116">10</text>
      </svg>

      <div className="jauge-chiffre" style={{ color: ton }}>
        {valeur == null ? (encours ? "···" : "—") : fr(valeur)}
        <span className="jauge-sur">/10</span>
      </div>
    </div>
  );
}

/* ================================================================
   Feuille d'impression — invisible à l'écran, seule à l'impression.
   Montée hors du #root par un portail : la règle @media print n'a alors
   qu'une chose à masquer, l'application entière.
   ================================================================ */

function PrintSheet({ entry }) {
  return (
    <div className="print-only">
      <h1>{entry.title || "Sans titre"}</h1>
      <p className="print-meta">
        v{entry.version} · {entry.count} caractères · limite {entry.limit} ·{" "}
        {formatDate(entry.updatedAt || entry.savedAt)}
      </p>
      {entry.idea && <p className="print-idea">Idée de départ — {entry.idea}</p>}
      <pre>{entry.prompt}</pre>
    </div>
  );
}

/* ================================================================
   Réglages et compte
   ================================================================ */

function SettingsSheet({
  user,
  onUser,
  ownKey,
  usingShared,
  setOwnKey,
  settings,
  setSettings,
  onClose,
  onLeave,
}) {
  const [keyDraft, setKeyDraft] = useState(ownKey);
  const [email, setEmail] = useState(user.email || "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // {kind, text}

  const keyValid = !keyDraft || looksLikeKey(keyDraft);

  const saveEmail = async () => {
    setBusy(true);
    setNote(null);
    try {
      const data = await api.setEmail(email);
      onUser({ ...user, email: data.email });
      setNote({ kind: "ok", text: data.message });
    } catch (e) {
      setNote({ kind: "error", text: e.message });
    }
    setBusy(false);
  };

  const changeCode = async () => {
    setBusy(true);
    setNote(null);
    try {
      const data = await api.changeCode(current, next);
      setCurrent("");
      setNext("");
      setNote({ kind: "ok", text: data.message });
    } catch (e) {
      setNote({ kind: "error", text: e.message });
    }
    setBusy(false);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Réglages</div>
            <h2 className="display mt-2 text-3xl">{user.name}</h2>
          </div>
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Fermer
          </button>
        </div>

        {note && <p className={`note note-${note.kind} mb-5`}>{note.text}</p>}

        {/* ---------- clé API ---------- */}
        <div className="section-head">
          <span className="section-num">A</span>
          <span className="section-title">Clé API Anthropic</span>
          <span className="section-line" />
        </div>

        {usingShared ? (
          <p className="note note-ok mb-3">
            Tu utilises la clé de l'atelier — rien à faire, ça marche déjà. Colle la tienne
            ci-dessous si tu préfères que la consommation soit sur ton compte.
          </p>
        ) : (
          <p className="lede mb-3 text-[13.5px]">
            Ta clé reste dans ce navigateur ; les appels partent en direct vers
            api.anthropic.com. Aucun serveur de l'atelier ne la voit.
          </p>
        )}

        <input
          type="password"
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
        />
        {!keyValid && (
          <p className="note note-error mt-3">
            Ce n'est pas la forme d'une clé Anthropic (sk-ant-…).
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            type="button"
            disabled={!keyValid || keyDraft.trim() === ownKey}
            onClick={() => {
              setOwnKey(keyDraft.trim());
              setNote({
                kind: "ok",
                text: keyDraft.trim()
                  ? "Ta clé est enregistrée dans ce navigateur — elle prime sur celle de l'atelier."
                  : "Clé retirée.",
              });
            }}
          >
            Utiliser ma clé
          </button>
          {ownKey && (
            <button
              className="btn btn-quiet btn-danger"
              type="button"
              onClick={() => {
                setKeyDraft("");
                setOwnKey("");
                setNote({ kind: "ok", text: "Ta clé est retirée — retour à celle de l'atelier." });
              }}
            >
              Revenir à la clé de l'atelier
            </button>
          )}
        </div>

        {/* ---------- modèles ---------- */}
        <div className="section-head mt-8">
          <span className="section-num">B</span>
          <span className="section-title">Modèles et limite</span>
          <span className="section-line" />
        </div>

        <label className="field-label" htmlFor="writer">
          Produit le prompt
        </label>
        <select
          id="writer"
          value={settings.writer}
          onChange={(e) => setSettings({ ...settings, writer: e.target.value })}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.note}
            </option>
          ))}
        </select>

        <label className="field-label mt-4" htmlFor="judge">
          Juge l'audit
        </label>
        <select
          id="judge"
          value={settings.judge}
          onChange={(e) => setSettings({ ...settings, judge: e.target.value })}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.note}
            </option>
          ))}
        </select>
        {settings.judge === settings.writer && (
          <p className="note note-info mt-3">
            Le juge est le modèle qui a produit : les angles morts sont corrélés. Choisis-en un
            autre pour que l'audit serve à quelque chose.
          </p>
        )}

        {/* Une limite par technique, et le curseur montre celle de la
            technique ARMÉE : un seul curseur pour deux méthodes ferait
            croire qu'on règle le prompt qu'on a sous les yeux alors qu'on
            règle l'autre. Le nom de la technique est écrit dessus pour
            qu'aucune ambiguïté ne subsiste. */}
        {TECHNIQUES.map((t) => (
          <div key={t.id} hidden={t.id !== techniqueOf(settings.technique).id}>
            <label className="field-label mt-4" htmlFor={`limit-${t.id}`}>
              Limite de caractères — {t.nom} — {t.capLimit(settings[t.cleReglage])}
            </label>
            <input
              id={`limit-${t.id}`}
              type="number"
              min={t.limiteMin}
              max={t.hardLimit}
              step={50}
              value={settings[t.cleReglage]}
              onChange={(e) =>
                setSettings({ ...settings, [t.cleReglage]: t.capLimit(e.target.value) })
              }
            />
            <p className="lede mt-2 text-[13px]">
              Ce réglage descend, il ne monte pas : {t.hardLimit} caractères est un plafond dur.
              {t.id === "boris"
                ? " Il montait à 8000, et le vérificateur comparait à ce nombre-là — un prompt de plus de 4000 caractères en sortait « au vert »."
                : t.id === "gauntlet"
                  ? ` Le prompt du gantelet se mesure d'abord en MOTS — ${t.fenetre().lo} à ${t.fenetre().hi} — et le plafond en caractères n'est là que pour arrêter un débordement franc.`
                  : " Cinq sections et des crochets d'une ligne : si ça déborde, c'est le monde ou le fond qui s'est mis à raconter, jamais les crochets."}
            </p>
          </div>
        ))}

        {/* ---------- compte ---------- */}
        <div className="section-head mt-8">
          <span className="section-num">C</span>
          <span className="section-title">Accès</span>
          <span className="section-line" />
        </div>

        <label className="field-label" htmlFor="mail">
          Adresse e-mail — pour retrouver un code oublié
        </label>
        <p className="lede mb-3 text-[13.5px]">
          L'envoi n'est pas encore câblé : ton adresse est conservée et servira dès qu'il le
          sera. En attendant, un code perdu se repose à la main.
        </p>
        <input
          id="mail"
          type="email"
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom@exemple.fr"
        />
        <button className="btn btn-ghost mt-3" type="button" onClick={saveEmail} disabled={busy}>
          Enregistrer l'adresse
        </button>

        <label className="field-label mt-6" htmlFor="cur">
          Code actuel
        </label>
        <input
          id="cur"
          type="password"
          autoComplete="current-password"
          value={current}
          disabled={busy}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <label className="field-label mt-4" htmlFor="nxt">
          Nouveau code
        </label>
        <input
          id="nxt"
          type="password"
          autoComplete="new-password"
          value={next}
          disabled={busy}
          onChange={(e) => setNext(e.target.value)}
        />
        <button
          className="btn btn-ghost mt-3"
          type="button"
          onClick={changeCode}
          disabled={busy || !current || !next}
        >
          Changer le code
        </button>

        <hr className="rule my-7" />

        <button className="btn btn-quiet" type="button" onClick={onLeave}>
          Sortir de l'atelier
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   Édition d'un prompt de la bibliothèque
   ================================================================ */

function EditorSheet({ draft, setDraft, onSave, onClose }) {
  const length = countChars(draft.prompt);
  /* L'éditeur mesure l'entrée avec la technique de l'ENTRÉE, pas celle
     de l'atelier : on peut éditer un prompt de gantelet en ayant Boris
     armé à l'écran, et l'inverse. */
  const Tdraft = techniqueOf(draft.technique);
  const check = Tdraft.verifyPrompt(draft.prompt, draft.limit || Tdraft.limiteDefaut);
  const [copiedDraft, setCopiedDraft] = useState(false);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Modifier</div>
            <h2 className="display mt-2 text-3xl">Ton prompt</h2>
          </div>
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Fermer
          </button>
        </div>

        <label className="field-label" htmlFor="title">
          Titre
        </label>
        <input
          id="title"
          type="text"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />

        <label className="field-label mt-4" htmlFor="text">
          Prompt
        </label>
        <textarea
          id="text"
          rows={16}
          value={draft.prompt}
          onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={check.pass ? "tag tag-ok" : "tag tag-ko"}>
            {length} car. · limite {draft.limit || 3000}
          </span>
          {!check.pass && check.fails.map((f, i) => <span key={i} className="tag tag-ko">{f}</span>)}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button className="btn btn-primary" type="button" onClick={onSave} disabled={!draft.prompt.trim()}>
            Enregistrer
          </button>
          {/* Le prompt est là, sous les yeux : il se copie d'ici aussi,
              tel qu'il est à l'écran — modifications comprises, avant
              même de les enregistrer. */}
          <button
            className="btn btn-ghost"
            type="button"
            disabled={!draft.prompt.trim()}
            onClick={async () => {
              if (await copy(draft.prompt)) {
                setCopiedDraft(true);
                setTimeout(() => setCopiedDraft(false), 2000);
              }
            }}
          >
            {copiedDraft ? "Copié ✓" : "Copier"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
