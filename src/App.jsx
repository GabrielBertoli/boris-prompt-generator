import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  buildMeta,
  costOf,
  countChars,
  formatCost,
  parseJson,
  targetWindow,
  verifyPrompt,
} from "./meta.js";
import { createPortal } from "react-dom";
import { MAX_ATTEMPTS, runVerifiedGeneration } from "./generate.js";
import {
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
  charLimit: 3900,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    /* 3000 était l'ancien défaut, que personne n'avait touché : on le
       migre vers 3900. Une valeur choisie à la main est conservée. */
    const stored = parsed.charLimit === 3000 ? DEFAULTS.charLimit : parsed.charLimit;
    return {
      writer: MODELS.some((m) => m.id === parsed.writer) ? parsed.writer : DEFAULTS.writer,
      judge: MODELS.some((m) => m.id === parsed.judge) ? parsed.judge : DEFAULTS.judge,
      charLimit: Number.isFinite(stored)
        ? Math.min(8000, Math.max(1500, stored))
        : DEFAULTS.charLimit,
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

  const [phase, setPhase] = useState("idle"); // idle | analyzing | questions | generating | done
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
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
      const { text, usage } = await callClaude(messages, { apiKey, model, maxTokens });
      addCost(role, costOf(model, usage));
      return text;
    },
    [apiKey, addCost]
  );

  /* ---------- cœur : génération sous assertions ---------- */
  const generateVerified = (baseConvo, instruction) =>
    runVerifiedGeneration({
      ask: (convo) => ask(convo, settings.writer, budget(settings.charLimit)),
      baseConvo,
      instruction,
      limit: settings.charLimit,
      onLog: pushLog,
    });

  /* ---------- phase 1 : analyse et questions ---------- */
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
    setPrompt("");
    setVerif(null);
    setLog([]);
    setVersion(1);
    setSaveState("idle");
    setRunCost({ writer: 0, judge: 0 });
    setPhase("analyzing");

    /* Plus de mode déclaré : l'idée dit d'elle-même si l'agent part de zéro
       ou s'intègre à un terrain existant. Imposer « nouvelle start-up » par
       défaut aurait mal cadré toutes les idées du second type. */
    const first = {
      role: "user",
      content:
        buildMeta(settings.charLimit) +
        "\n\nIDÉE :\n" +
        idea.trim() +
        (constraints.trim() ? "\n\nCONTRAINTES IMPOSÉES :\n" + constraints.trim() : "") +
        "\n\nÉTAPE 1 — Avant d'écrire le prompt, détermine s'il manque une information qui changerait MATÉRIELLEMENT le terrain, l'escalade ou la sortie. " +
        "Tout ce qui peut être tranché par une hypothèse raisonnable doit l'être, sans question. " +
        'Réponds UNIQUEMENT avec ce JSON, sans autre texte : {"questions":["..."]} — 3 questions maximum, tableau vide si rien de matériel ne manque.',
    };

    try {
      const raw = await ask([first], settings.writer, 1200);
      const parsed = parseJson(raw);
      const qs = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3) : [];
      const nextHistory = [first, { role: "assistant", content: raw }];
      setHistory(nextHistory);

      if (qs.length === 0) {
        pushLog("Analyse : rien de matériel ne manque — hypothèses tranchées.");
        await generate(nextHistory, null);
      } else {
        setQuestions(qs);
        setAnswers({});
        setPhase("questions");
      }
    } catch (e) {
      setError(`L'analyse a échoué : ${e.message}`);
      setPhase("idle");
    }
  };

  /* ---------- phase 2 : génération ---------- */
  const generate = async (baseHistory, answersMap) => {
    setPhase("generating");
    pushLog("Génération du prompt — v1…");

    let instruction =
      "ÉTAPE 2 — Génère MAINTENANT le system prompt final. Texte brut uniquement : pas de backticks, pas de commentaire, pas de préambule. " +
      `Huit sections '# EN MAJUSCULES', moins de ${settings.charLimit} caractères, ` +
      `vise ${targetWindow(settings.charLimit).lo} à ${targetWindow(settings.charLimit).hi}.`;

    if (answersMap) {
      const lines = questions
        .map(
          (q, i) =>
            `Q${i + 1} : ${q}\nR : ` +
            (answersMap[i] ||
              "(sans réponse — tranche par hypothèse raisonnable et signale-la dans le dépôt)")
        )
        .join("\n");
      instruction = `RÉPONSES :\n${lines}\n\n${instruction}`;
    }

    try {
      const res = await generateVerified(baseHistory, instruction);
      setHistory(res.convo);
      setPrompt(res.text);
      setVerif(res.check);
      setPhase("done");
      if (!res.check.pass) {
        setError(
          `Le vérificateur n'est pas au vert après ${MAX_ATTEMPTS} tentatives. Le prompt est affiché — corrige à la main ou relance.`
        );
      }
    } catch (e) {
      setError(`La génération a échoué : ${e.message}`);
      setPhase(answersMap ? "questions" : "idle");
    }
  };

  /* ---------- phase 3 : audit juge LLM ---------- */
  const runAudit = async () => {
    setAuditLoading(true);
    setAudit(null);
    try {
      const convo = [
        ...history,
        {
          role: "user",
          content:
            "ÉTAPE 3 — Audit juge LLM du prompt ci-dessus, contre la méthode Boris. " +
            'Réponds UNIQUEMENT avec ce JSON : {"verdict":"une phrase","failles":["..."],"hypotheses":["..."]} — ' +
            "maximum 3 failles réelles (tableau vide si aucune), maximum 3 hypothèses implicites que l'utilisateur doit connaître. Phrases courtes.",
        },
      ];
      // Le juge n'est jamais le modèle qui a produit : angles morts corrélés.
      const raw = await ask(convo, settings.judge, 1600, "judge");
      setAudit(parseJson(raw));
    } catch (e) {
      setAudit({ verdict: `L'audit a échoué : ${e.message}`, failles: [], hypotheses: [] });
    }
    setAuditLoading(false);
  };

  /* ---------- phase 4 : appliquer l'audit et régénérer ---------- */
  const applyAudit = async () => {
    if (!audit?.failles?.length) return;
    const corrections = audit.failles.map((f, i) => `${i + 1}. ${f}`).join("\n");
    const nextVersion = version + 1;

    setAudit(null);
    setSaveState("idle");
    setError("");
    setPhase("generating");
    pushLog(`Application de l'audit → v${nextVersion}…`);

    try {
      const instruction =
        "ÉTAPE 4 — Applique chacune de ces corrections au prompt ci-dessus :\n" +
        corrections +
        "\nRégénère le prompt COMPLET corrigé (les huit sections jusqu'à # SORTIE incluse), texte brut uniquement, " +
        `sans backticks ni commentaire, moins de ${settings.charLimit} caractères, ` +
        `vise ${targetWindow(settings.charLimit).lo} à ${targetWindow(settings.charLimit).hi}.`;
      const res = await generateVerified(history, instruction);
      setHistory(res.convo);
      setPrompt(res.text);
      setVerif(res.check);
      setVersion(nextVersion);
      setPhase("done");
      if (!res.check.pass) {
        setError(
          `Le vérificateur n'est pas au vert après ${MAX_ATTEMPTS} tentatives. Le prompt est affiché — corrige à la main ou relance.`
        );
      }
    } catch (e) {
      setError(`La régénération a échoué : ${e.message}`);
      setPhase("done");
    }
  };

  const reset = () => {
    setPhase("idle");
    setQuestions([]);
    setAnswers({});
    setHistory([]);
    setPrompt("");
    setVerif(null);
    setVersion(1);
    setLog([]);
    setAudit(null);
    setError("");
    setSaveState("idle");
  };

  /* ---------- bibliothèque : sauver, modifier, supprimer ---------- */

  const savePrompt = async () => {
    if (!prompt) return;
    const entry = makeEntry({
      idea,
      prompt,
      limit: settings.charLimit,
      version,
    });
    await commit([entry, ...library]);
    setSaveState("saved");
    setOpenId(entry.id);
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
  const currentEntry = () => makeEntry({ idea, prompt, limit: settings.charLimit, version });

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
  const gauge = Math.min(100, Math.round((count / settings.charLimit) * 100));

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return library;
    return library.filter((item) =>
      `${item.title} ${item.idea} ${item.prompt}`.toLowerCase().includes(needle)
    );
  }, [library, search]);

  const tone =
    phase === "generating" ? "var(--ember)" : verif?.pass ? "var(--signal)" : "var(--alarm)";

  return (
    <div className="atelier pb-24">
      {/* ================= barre supérieure ================= */}
      <header className="topbar">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-5 py-3 sm:px-8">
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

          <button
            className="btn btn-quiet"
            type="button"
            onClick={() => setSheet("reglages")}
            aria-label="Réglages"
            title="Réglages et compte"
          >
            Réglages
          </button>

          <div className="flex items-center gap-2 pl-1">
            <span className="avatar" title={user.name}>
              {user.initial}
            </span>
            <button className="link hidden sm:inline" type="button" onClick={onLeave}>
              Sortir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 sm:px-8">
        {/* ================= manchette ================= */}
        <section className="rise pt-12 pb-10 sm:pt-16">
          <div className="eyebrow mb-4">
            But — Garde-fous — Vérificateur — Sortie
          </div>
          <h1 className="display text-[clamp(38px,6.6vw,64px)]">
            Bonjour {user.name}.
            <br />
            Quelle boîte <em>fais-tu tourner</em> aujourd'hui&nbsp;?
          </h1>
          <p className="lede mt-6">
            Décris l'idée comme à un associé. L'atelier ne pose une question que si la réponse
            change matériellement le terrain, l'escalade ou la sortie ; le reste est tranché par
            hypothèse et signalé.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            <span className="tag tag-accent">{library.length} prompt{library.length > 1 ? "s" : ""} en bibliothèque</span>
            <span className="tag">limite {settings.charLimit} car.</span>
            <span className={apiKey ? "tag tag-ok" : "tag tag-ko"}>
              {usingShared ? "clé de l'atelier" : apiKey ? "ta clé" : "clé manquante"}
            </span>
            <span className="tag" title="Dépense API cumulée de ton compte, tous appareils confondus">
              dépense à date {formatCost(totalCost ?? 0)}
            </span>
            {!libRemote && <span className="tag tag-ko">hors ligne</span>}
          </div>
        </section>

        {/* ================= l'idée ================= */}
        <section ref={composerRef} className="card p-6 sm:p-7">
          <textarea
            rows={6}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={busy}
            placeholder={
              "Exemple : une app d'échecs en ligne — parties en direct, classement Elo, puzzles quotidiens ; l'humain ne valide que les mises en production…\n\n" +
              "Ou : un algo de ML qui prédit les ruptures de stock d'un e-commerce depuis l'historique de ventes, réentraîné chaque nuit, avec un tableau de bord de dérive…"
            }
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
                placeholder="Technologies imposées, système d'enregistrement, actions engageantes propres au domaine, critère de sortie souhaité…"
              />
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              className="btn btn-primary"
              type="button"
              onClick={analyze}
              disabled={busy || phase === "questions"}
            >
              {phase === "analyzing" ? "Analyse en cours…" : "Analyser l'idée"}
            </button>
            {(phase === "done" || phase === "questions") && (
              <button className="btn btn-ghost" type="button" onClick={reset} disabled={busy}>
                Recommencer
              </button>
            )}
          </div>

          {error && <p className="note note-error mt-5">{error}</p>}
        </section>

        {/* ================= 01 · questions ================= */}
        {phase === "questions" && (
          <section className="card rise mt-6 p-6 sm:p-7">
            <div className="section-head">
              <span className="section-num">01</span>
              <span className="section-title">Questions matérielles</span>
              <span className="section-line" />
            </div>

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
          </section>
        )}

        {/* ================= 02 · vérificateur ================= */}
        {(phase === "generating" || phase === "done") && (
          <section
            ref={resultRef}
            className={`card rise mt-6 p-6 sm:p-7 ${phase === "generating" ? "working" : ""}`}
          >
            <div className="section-head">
              <span className="section-num">02</span>
              <span className="section-title">Vérificateur</span>
              <span className="section-line" />
              <span className="tag tag-accent">v{version}</span>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div
                  className={`counter ${phase === "generating" ? "pulse" : ""}`}
                  style={{ color: tone }}
                >
                  {phase === "generating" && !prompt ? "····" : count}
                </div>
                <div className="mono mt-1 text-[11px]" style={{ color: "var(--muted-2)" }}>
                  caractères · limite {settings.charLimit} · compte réel
                </div>
              </div>

              {phase === "done" && verif && (
                <span className={verif.pass ? "tag tag-ok" : "tag tag-ko"}>
                  {verif.pass ? "✓ assertions au vert" : "✗ assertion échouée"}
                </span>
              )}
            </div>

            <div className="gauge mt-5">
              <span style={{ width: `${gauge}%`, background: tone }} />
              <span className="gauge-ticks" />
            </div>

            {/* Le compteur vit : il bouge à chaque appel, pendant la
                génération comme à l'audit. Prompt = tous les appels du
                modèle qui produit ; juge = ceux de l'audit. */}
            <div className="mono mt-4 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="tag">prompt {formatCost(runCost.writer)}</span>
              <span className="tag">juge {formatCost(runCost.judge)}</span>
              <span className="tag tag-accent">total à date {formatCost(totalCost ?? 0)}</span>
            </div>

            {log.length > 0 && (
              <div className="mono mt-5 text-[11.5px] leading-relaxed" style={{ color: "var(--muted)" }}>
                {log.map((line, i) => (
                  <div key={i}>› {line}</div>
                ))}
              </div>
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
                    {auditLoading ? "Audit en cours…" : "Audit juge LLM"}
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

            {audit && (
              <div className="card-inset mt-6 p-5">
                <div className="eyebrow mb-3">Juge — {settings.judge}</div>
                <p className="mb-4 text-[15px] leading-relaxed">{audit.verdict}</p>

                {audit.failles?.length ? (
                  <div className="mb-4">
                    <div className="mono mb-2 text-[10.5px] uppercase tracking-[0.2em]" style={{ color: "var(--alarm)" }}>
                      Failles
                    </div>
                    {audit.failles.map((f, i) => (
                      <p key={i} className="text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
                        — {f}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="note note-ok mb-4">Aucune faille — rien à appliquer.</p>
                )}

                {audit.hypotheses?.length > 0 && (
                  <div>
                    <div className="mono mb-2 text-[10.5px] uppercase tracking-[0.2em]" style={{ color: "var(--ember)" }}>
                      Hypothèses tranchées
                    </div>
                    {audit.hypotheses.map((h, i) => (
                      <p key={i} className="text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
                        — {h}
                      </p>
                    ))}
                  </div>
                )}

                {audit.failles?.length > 0 && (
                  <button className="btn btn-primary mt-5" type="button" onClick={applyAudit} disabled={busy}>
                    Appliquer l'audit → v{version + 1}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* ================= 03 · bibliothèque ================= */}
        <section className="card mt-6 p-6 sm:p-7">
          <div className="section-head">
            <span className="section-num">03</span>
            <span className="section-title">Ta bibliothèque</span>
            <span className="section-line" />
            <span className="tag">{library.length}</span>
          </div>

          {library.length > 0 && (
            <input
              type="text"
              className="mb-4"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Chercher un titre, une idée, un mot du prompt…"
            />
          )}

          {/* Copie de secours. La bibliothèque ne vit que dans la clé-valeur :
              un magasin vidé, et tout part. Un fichier chez soi répare ça. */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <button
              className="btn btn-quiet"
              type="button"
              onClick={exportAll}
              disabled={library.length === 0}
            >
              Exporter tout (.json)
            </button>
            <button className="btn btn-quiet" type="button" onClick={() => fileRef.current?.click()}>
              Importer un fichier
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // réimporter le même fichier reste possible
                importAll(file);
              }}
            />
          </div>

          {libNote && <p className="note note-info mb-4">{libNote}</p>}
          {libError && <p className="note note-error mb-4">{libError}</p>}

          {libLoading ? (
            <p className="mono pulse text-sm" style={{ color: "var(--muted-2)" }}>
              chargement…
            </p>
          ) : library.length === 0 ? (
            <p className="lede text-[14.5px]">
              Rien encore. Génère un prompt, puis « Sauvegarder » — il te suivra d'un appareil à
              l'autre, et toi seul y as accès.
            </p>
          ) : shown.length === 0 ? (
            <p className="lede text-[14.5px]">Aucun prompt ne correspond à « {search} ».</p>
          ) : (
            <div className="lib-grid">
              {shown.map((item) => (
                <article key={item.id} className="lib-card">
                  <div className="flex items-start justify-between gap-3">
                    {renamingId === item.id ? (
                      <input
                        type="text"
                        className="lib-rename"
                        value={renameDraft}
                        autoFocus
                        onChange={(e) => setRenameDraft(e.target.value)}
                        /* Entrée et Échap sortent tous deux par le flou :
                           une seule voie de validation, donc pas de double
                           enregistrement — et Échap annule vraiment. */
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
                            setRenamingId(null);
                            return;
                          }
                          commitRename();
                        }}
                      />
                    ) : (
                      <h3 className="lib-title">{item.title}</h3>
                    )}
                    <span className="tag tag-accent">v{item.version}</span>
                  </div>

                  <p className="lib-excerpt">{item.prompt.slice(0, 190)}…</p>

                  <div className="mono flex flex-wrap items-center gap-2 text-[10.5px]" style={{ color: "var(--muted-2)" }}>
                    <span className="tag">{item.count} car.</span>
                    <span>{formatDate(item.updatedAt || item.savedAt)}</span>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-2">
                    <button
                      className="btn btn-quiet"
                      type="button"
                      onClick={() => setOpenId(openId === item.id ? null : item.id)}
                    >
                      {openId === item.id ? "Replier" : "Lire"}
                    </button>
                    <button
                      className="btn btn-quiet"
                      type="button"
                      onClick={async () => {
                        if (await copy(item.prompt)) {
                          setCopiedId(item.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }
                      }}
                    >
                      {copiedId === item.id ? "Copié ✓" : "Copier"}
                    </button>
                    <button className="btn btn-quiet" type="button" onClick={() => openEditor(item)}>
                      Modifier
                    </button>
                    <button className="btn btn-quiet" type="button" onClick={() => startRename(item)}>
                      Renommer
                    </button>
                    <button className="btn btn-quiet" type="button" onClick={() => duplicate(item)}>
                      Dupliquer
                    </button>
                    <button className="btn btn-quiet" type="button" onClick={() => downloadOne(item)}>
                      Télécharger
                    </button>
                    <button className="btn btn-quiet" type="button" onClick={() => setPrinting(item)}>
                      Imprimer
                    </button>
                    {item.idea && (
                      <button className="btn btn-quiet" type="button" onClick={() => reuse(item)}>
                        Reprendre l'idée
                      </button>
                    )}
                    {pendingDelete === item.id ? (
                      <>
                        <button
                          className="btn btn-quiet btn-danger"
                          type="button"
                          onClick={() => removeEntry(item.id)}
                        >
                          Confirmer
                        </button>
                        <button className="btn btn-quiet" type="button" onClick={() => setPendingDelete(null)}>
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

                  {openId === item.id && <pre className="prompt-sheet mt-2">{item.prompt}</pre>}
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="mono mt-14 text-[11px] leading-relaxed" style={{ color: "var(--muted-2)" }}>
          Le prompt généré part du prompt de référence de la session Odoo agentique. Un prompt ne
          se juge pas sur papier — lance-le, et laisse les 48 premières heures faire le prochain
          audit.
        </footer>
      </main>

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

      {printing && createPortal(<PrintSheet entry={printing} />, document.body)}
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

        <label className="field-label mt-4" htmlFor="limit">
          Limite de caractères — {settings.charLimit}
        </label>
        <input
          id="limit"
          type="number"
          min={1500}
          max={8000}
          step={100}
          value={settings.charLimit}
          onChange={(e) =>
            setSettings({
              ...settings,
              charLimit: Math.min(8000, Math.max(1500, Number(e.target.value) || 3000)),
            })
          }
        />

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
  const check = verifyPrompt(draft.prompt, draft.limit || 3000);

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
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
