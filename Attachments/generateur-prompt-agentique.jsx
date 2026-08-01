import { useState, useRef, useEffect } from "react";

/* ================================================================
   GÉNÉRATEUR DE PROMPTS AGENTIQUES — MÉTHODE BORIS
   Boucle complète : générer → vérifier (assertions) → juger →
   appliquer l'audit → re-vérifier. Bibliothèque persistante.
   ================================================================ */

const PROMPT_REFERENCE = `# QUI TU ES
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
Modèles : Fable 5 pour ce qui tranche — architecture, arbitrages, jugements de vérification ; Opus 5 ou Sonnet 5 pour ce qui produit, avec l'effort que tu estimes nécessaire. En cas de doute, le fort.

# VÉRIFICATION
Vérificateur avant construction. Un scénario passe quand tu l'affirmes sur l'état d'Odoo : enregistrement créé, montants et TVA justes, écriture équilibrée, statut attendu, ligne d'audit par action. Après chaque agent construit, rejoue la chaîne entière, pas seulement ton ajout.

# ESCALADE
Production, secrets réels, envoi externe réel, mouvement d'argent, suppression, changement de droits. Tu prépares, tu déposes prêt à valider, tu repars.

# SORTIE
Le mois complet s'écoule, assertions au vert, sans intervention hors file de validation, et la file ne contient que des actions engageantes. Sinon tu continues.`;

function buildMeta(limit) {
  return (
    "Tu es un générateur de system prompts agentiques selon la méthode Boris (créateur de Claude Code). " +
    "Le prompt que tu produis sera donné tel quel à un agent autonome qui développera un produit 24/7 sans poser de question.\n\n" +
    "STRUCTURE OBLIGATOIRE — huit sections dans cet ordre, titres '# EN MAJUSCULES', en français, agent tutoyé, phrases denses :\n" +
    "1. # QUI TU ES — identité de patron, mission ; jamais un cahier des charges.\n" +
    "2. # TON PRODUIT — le terrain : ce qui est construit, le système d'enregistrement, le socle. Si une contrainte technologique est imposée : porte de sortie ('ou aucun si plus simple sert mieux'), décision par essai réel et pas par la doc, clause anti-cage (le socle fournit la plomberie, jamais les workflows des agents), décision motivée écrite dans le dépôt.\n" +
    "3. # COMMENT TU DÉCIDES — boucle empirique : lister des ÉVÉNEMENTS métier concrets du domaine, JAMAIS une liste d'agents ou de fonctionnalités ; l'agent dérive le roster en regardant où la chaîne casse. Toujours au moins un canal réel, pas simulé.\n" +
    "4. # INVARIANTS — garde-fous d'architecture et de sécurité, adaptés au domaine. Inclure : système d'enregistrement unique, accès indirect aux données (passerelle, droits minimaux), actions engageantes préparées puis tranchées par une file de validation humaine, journalisation horodatée, environnements séparés, clause anti-hobbling (un but, des garde-fous, un moyen de vérifier, puis laisse-les faire).\n" +
    "5. # ENVIRONNEMENT — des FAITS, pas des corrections : 'personne ne répondra à une question : tu tranches, tu écris l'hypothèse dans le dépôt, tu continues' ; l'état du run vit dans le dépôt (reprise après coupure) ; entretien continu (code mort, instructions inutiles). Routage modèles en principe : 'Fable 5 pour ce qui tranche — architecture, arbitrages, jugements de vérification ; Opus 5 ou Sonnet 5 pour ce qui produit, avec l'effort que tu estimes nécessaire. En cas de doute, le fort.'\n" +
    "6. # VÉRIFICATION — l'oracle avant la construction : un scénario passe uniquement par des ASSERTIONS sur l'état du système d'enregistrement (valeurs justes, statuts attendus, ligne d'audit par action). Rejouer la chaîne entière après chaque ajout.\n" +
    "7. # ESCALADE — les seuls arrêts autorisés (actions engageantes du domaine) : l'agent prépare, dépose prêt à valider, repart.\n" +
    "8. # SORTIE — critère verrouillé aux deux bords : ni truquable en n'escaladant jamais, ni en escaladant tout (la file ne contient que des actions engageantes). Se termine par 'Sinon tu continues.'\n\n" +
    "RÈGLES : le prompt contient le but, les garde-fous, le vérificateur, les critères de sortie — rien d'autre. Aucune correction comportementale (ne t'arrête pas, change d'approche, journalise en détail, topologie de fan-out) : natives sur les modèles actuels. " +
    "LIMITE STRICTE : moins de " + limit + " caractères. Vise 2200 à 2700.\n\n" +
    "EXEMPLE DE RÉFÉRENCE (structure, style et densité à reproduire, adaptés au nouveau domaine) :\n---\n" +
    PROMPT_REFERENCE +
    "\n---\n"
  );
}

async function callClaude(messages) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages,
    }),
  });
  if (!response.ok) throw new Error("Appel API échoué (" + response.status + ")");
  const data = await response.json();
  return (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
}

function parseJson(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON introuvable");
  return JSON.parse(clean.slice(start, end + 1));
}

const countChars = (s) => [...s].length;

function verifyPrompt(text, limit) {
  const fails = [];
  const n = countChars(text);
  if (n >= limit) fails.push("longueur : " + n + " caractères pour une limite de " + limit);
  if (!text.trim().startsWith("# ")) fails.push("ne commence pas par une section '# '");
  if (!text.includes("# SORTIE")) fails.push("section # SORTIE absente — sortie probablement tronquée");
  return { pass: fails.length === 0, fails, count: n };
}

/* ---------- bibliothèque : une seule clé, données groupées ---------- */
const LIB_KEY = "prompt-library";
const storageOk = () => typeof window !== "undefined" && !!window.storage;

async function loadLibrary() {
  if (!storageOk()) return [];
  try {
    const r = await window.storage.get(LIB_KEY);
    if (!r || !r.value) return [];
    const parsed = JSON.parse(r.value);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function persistLibrary(items) {
  if (!storageOk()) return false;
  try {
    const r = await window.storage.set(LIB_KEY, JSON.stringify({ items }));
    return !!r;
  } catch {
    return false;
  }
}

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

export default function GenerateurPromptAgentique() {
  const [mode, setMode] = useState("nouvelle");
  const [idea, setIdea] = useState("");
  const [constraints, setConstraints] = useState("");
  const [showConstraints, setShowConstraints] = useState(false);
  const [charLimit, setCharLimit] = useState(3000);

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

  const [library, setLibrary] = useState([]);
  const [libLoading, setLibLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saved | error
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const resultRef = useRef(null);

  useEffect(() => {
    (async () => {
      const items = await loadLibrary();
      setLibrary(items);
      setLibLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (phase === "done" && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase]);

  const pushLog = (line) => setLog((l) => [...l, line]);

  /* ---------- cœur : génération sous assertions, réutilisée partout ---------- */
  const runVerifiedGeneration = async (baseConvo, instruction) => {
    let convo = [...baseConvo, { role: "user", content: instruction }];
    let text = (await callClaude(convo)).trim();
    let check = verifyPrompt(text, charLimit);
    let attempt = 1;
    pushLog("Tentative " + attempt + " : " + check.count + " caractères — " + (check.pass ? "assertions au vert" : "échec (" + check.fails.join(" ; ") + ")"));
    while (!check.pass && attempt < 3) {
      attempt += 1;
      convo.push({ role: "assistant", content: text });
      convo.push({
        role: "user",
        content:
          "ASSERTION ÉCHOUÉE : " + check.fails.join(" ; ") + ". " +
          "Régénère le prompt COMPLET (les huit sections jusqu'à # SORTIE incluse), nettement plus dense, texte brut uniquement, moins de " + charLimit + " caractères.",
      });
      text = (await callClaude(convo)).trim();
      check = verifyPrompt(text, charLimit);
      pushLog("Tentative " + attempt + " : " + check.count + " caractères — " + (check.pass ? "assertions au vert" : "échec (" + check.fails.join(" ; ") + ")"));
    }
    convo.push({ role: "assistant", content: text });
    return { text, check, convo };
  };

  /* ---------- phase 1 : analyse et questions ---------- */
  const analyze = async () => {
    if (!idea.trim()) {
      setError("Décris d'abord l'idée — c'est la seule entrée obligatoire.");
      return;
    }
    setError("");
    setAudit(null);
    setPrompt("");
    setLog([]);
    setVersion(1);
    setSaveState("idle");
    setPhase("analyzing");
    const modeLine =
      mode === "nouvelle"
        ? "MODE : créer le produit fondateur d'une NOUVELLE start-up. L'agent part de zéro."
        : "MODE : ajouter un produit à une start-up EXISTANTE. Le terrain existant (systèmes, données, clients) est une contrainte du produit : l'agent s'y intègre sans le casser.";
    const first = {
      role: "user",
      content:
        buildMeta(charLimit) +
        modeLine +
        "\n\nIDÉE :\n" +
        idea.trim() +
        (constraints.trim() ? "\n\nCONTRAINTES IMPOSÉES :\n" + constraints.trim() : "") +
        "\n\nÉTAPE 1 — Avant d'écrire le prompt, détermine s'il manque une information qui changerait MATÉRIELLEMENT le terrain, l'escalade ou la sortie. " +
        "Tout ce qui peut être tranché par une hypothèse raisonnable doit l'être, sans question. " +
        "Réponds UNIQUEMENT avec ce JSON, sans autre texte : {\"questions\":[\"...\"]} — 3 questions maximum, tableau vide si rien de matériel ne manque.",
    };
    try {
      const raw = await callClaude([first]);
      const parsed = parseJson(raw);
      const qs = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3) : [];
      const newHistory = [first, { role: "assistant", content: raw }];
      setHistory(newHistory);
      if (qs.length === 0) {
        pushLog("Analyse : rien de matériel ne manque — hypothèses tranchées.");
        await generate(newHistory, null);
      } else {
        setQuestions(qs);
        setAnswers({});
        setPhase("questions");
      }
    } catch (e) {
      setError("L'analyse a échoué : " + e.message + ". Relance-la.");
      setPhase("idle");
    }
  };

  /* ---------- phase 2 : génération ---------- */
  const generate = async (baseHistory, answersMap) => {
    setPhase("generating");
    pushLog("Génération du prompt — v1…");
    let instruction =
      "ÉTAPE 2 — Génère MAINTENANT le system prompt final. Texte brut uniquement : pas de backticks, pas de commentaire, pas de préambule. " +
      "Huit sections '# EN MAJUSCULES', moins de " + charLimit + " caractères, vise 2200 à 2700.";
    if (answersMap) {
      const lines = questions
        .map((q, i) => "Q" + (i + 1) + " : " + q + "\nR : " + (answersMap[i] || "(sans réponse — tranche par hypothèse raisonnable et signale-la dans le dépôt)"))
        .join("\n");
      instruction = "RÉPONSES :\n" + lines + "\n\n" + instruction;
    }
    try {
      const res = await runVerifiedGeneration(baseHistory, instruction);
      setHistory(res.convo);
      setPrompt(res.text);
      setVerif(res.check);
      setPhase("done");
      if (!res.check.pass) setError("Le vérificateur n'est pas au vert après 3 tentatives. Le prompt est affiché — corrige à la main ou relance.");
    } catch (e) {
      setError("La génération a échoué : " + e.message + ". Relance-la.");
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
            "Réponds UNIQUEMENT avec ce JSON : {\"verdict\":\"une phrase\",\"failles\":[\"...\"],\"hypotheses\":[\"...\"]} — " +
            "maximum 3 failles réelles (tableau vide si aucune), maximum 3 hypothèses implicites que l'utilisateur doit connaître. Phrases courtes.",
        },
      ];
      const raw = await callClaude(convo);
      setAudit(parseJson(raw));
    } catch (e) {
      setAudit({ verdict: "L'audit a échoué : " + e.message, failles: [], hypotheses: [] });
    }
    setAuditLoading(false);
  };

  /* ---------- phase 4 : appliquer l'audit et régénérer ---------- */
  const applyAudit = async () => {
    if (!audit || !audit.failles || audit.failles.length === 0) return;
    const corrections = audit.failles.map((f, i) => (i + 1) + ". " + f).join("\n");
    const nextVersion = version + 1;
    setAudit(null);
    setSaveState("idle");
    setError("");
    setPhase("generating");
    pushLog("Application de l'audit → v" + nextVersion + "…");
    try {
      const instruction =
        "ÉTAPE 4 — Applique chacune de ces corrections au prompt ci-dessus :\n" +
        corrections +
        "\nRégénère le prompt COMPLET corrigé (les huit sections jusqu'à # SORTIE incluse), texte brut uniquement, sans backticks ni commentaire, moins de " + charLimit + " caractères, vise 2200 à 2700.";
      const res = await runVerifiedGeneration(history, instruction);
      setHistory(res.convo);
      setPrompt(res.text);
      setVerif(res.check);
      setVersion(nextVersion);
      setPhase("done");
      if (!res.check.pass) setError("Le vérificateur n'est pas au vert après 3 tentatives. Le prompt est affiché — corrige à la main ou relance.");
    } catch (e) {
      setError("La régénération a échoué : " + e.message + ". Relance l'audit ou la génération.");
      setPhase("done");
    }
  };

  /* ---------- bibliothèque ---------- */
  const savePrompt = async () => {
    if (!prompt) return;
    const item = {
      id: String(Date.now()),
      title: idea.trim().slice(0, 72) || "Sans titre",
      mode,
      idea: idea.trim(),
      prompt,
      count: countChars(prompt),
      limit: charLimit,
      version,
      savedAt: new Date().toISOString(),
    };
    const items = [item, ...library];
    const ok = await persistLibrary(items);
    if (ok) {
      setLibrary(items);
      setSaveState("saved");
    } else {
      setSaveState("error");
    }
  };

  const deleteItem = async (id) => {
    const items = library.filter((it) => it.id !== id);
    const ok = await persistLibrary(items);
    if (ok) {
      setLibrary(items);
      if (expandedId === id) setExpandedId(null);
    }
  };

  const copyText = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  const busy = phase === "analyzing" || phase === "generating";
  const count = prompt ? countChars(prompt) : 0;
  const gauge = Math.min(100, Math.round((count / charLimit) * 100));

  return (
    <div className="atelier min-h-screen w-full">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap');
        .atelier{
          --encre:#17151F; --carte:#201D2B; --carte2:#262234; --trait:#37324A;
          --craie:#EDE8DF; --sourdine:#8F89A0; --phosphore:#FFB454;
          --assertion:#7FD1A8; --echec:#E5695E;
          background:
            radial-gradient(1200px 500px at 70% -10%, rgba(255,180,84,0.07), transparent 60%),
            var(--encre);
          color: var(--craie);
          font-family: 'Space Grotesk', system-ui, sans-serif;
        }
        .atelier .mono{ font-family:'IBM Plex Mono', ui-monospace, monospace; }
        .atelier .eyebrow{ font-family:'IBM Plex Mono', ui-monospace, monospace; font-size:11px; letter-spacing:0.22em; color:var(--phosphore); }
        .atelier .card{ background:var(--carte); border:1px solid var(--trait); border-radius:14px; }
        .atelier .card-inset{ background:var(--carte2); border:1px solid var(--trait); border-radius:10px; }
        .atelier textarea, .atelier input[type="text"], .atelier input[type="number"]{
          background:var(--encre); color:var(--craie); border:1px solid var(--trait);
          border-radius:10px; width:100%; padding:12px 14px; font-size:14px; line-height:1.55;
          font-family:'IBM Plex Mono', ui-monospace, monospace;
        }
        .atelier textarea:focus, .atelier input:focus, .atelier button:focus-visible{
          outline:2px solid var(--phosphore); outline-offset:2px;
        }
        .atelier ::placeholder{ color:#5E5870; }
        .atelier .btn{
          border-radius:10px; padding:12px 22px; font-weight:600; font-size:15px;
          transition:transform 120ms ease, opacity 120ms ease; cursor:pointer; border:1px solid transparent;
        }
        .atelier .btn:active{ transform:translateY(1px); }
        .atelier .btn-primary{ background:var(--phosphore); color:#1A1206; }
        .atelier .btn-primary:disabled{ opacity:0.45; cursor:default; }
        .atelier .btn-ghost{ background:transparent; color:var(--craie); border-color:var(--trait); }
        .atelier .btn-ghost:hover{ border-color:var(--sourdine); }
        .atelier .btn-sm{ padding:8px 14px; font-size:13px; }
        .atelier .seg{ border:1px solid var(--trait); border-radius:12px; overflow:hidden; }
        .atelier .seg button{ padding:12px 8px; width:100%; font-size:14px; color:var(--sourdine); background:transparent; }
        .atelier .seg button.on{ background:var(--carte2); color:var(--craie); box-shadow:inset 0 0 0 1px var(--phosphore); }
        .atelier .compteur{ font-family:'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric:tabular-nums; }
        .atelier .gauge{ height:4px; border-radius:999px; background:var(--trait); overflow:hidden; }
        .atelier .gauge > div{ height:100%; transition:width 400ms ease; }
        .atelier .tag{ font-family:'IBM Plex Mono', ui-monospace, monospace; font-size:11px; border:1px solid var(--trait); border-radius:999px; padding:2px 10px; color:var(--sourdine); }
        .atelier .lib-row{ width:100%; text-align:left; background:transparent; border:none; color:var(--craie); cursor:pointer; padding:0; }
        .atelier .blink{ animation: atelierBlink 1.1s ease-in-out infinite; }
        @keyframes atelierBlink{ 0%,100%{opacity:1} 50%{opacity:0.35} }
        @media (prefers-reduced-motion: reduce){ .atelier .blink{ animation:none; } .atelier .gauge > div{ transition:none; } }
        .atelier pre{ white-space:pre-wrap; word-break:break-word; }
      `}</style>

      <div className="mx-auto w-full max-w-3xl px-5 py-10">
        {/* ---------- en-tête ---------- */}
        <header className="mb-10">
          <div className="eyebrow mb-3">MÉTHODE BORIS · BUT — GARDE-FOUS — VÉRIFICATEUR — SORTIE</div>
          <h1 className="text-3xl font-bold leading-tight" style={{ letterSpacing: "-0.01em" }}>
            Générateur de prompts agentiques
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--sourdine)", maxWidth: "56ch" }}>
            De l'idée au system prompt qui lance le développement 24/7. Questions seulement si une
            réponse change matériellement le prompt ; audit juge LLM, corrections appliquées et
            re-vérifiées ; chaque version peut rejoindre la bibliothèque.
          </p>
        </header>

        {/* ---------- formulaire ---------- */}
        <section className="card p-6">
          <div className="eyebrow mb-2">01 · L'IDÉE</div>

          <div className="seg grid grid-cols-2 mb-4">
            <button className={mode === "nouvelle" ? "on" : ""} onClick={() => setMode("nouvelle")} disabled={busy}>
              Nouvelle start-up
            </button>
            <button className={mode === "existante" ? "on" : ""} onClick={() => setMode("existante")} disabled={busy}>
              Produit dans une start-up existante
            </button>
          </div>

          <textarea
            rows={6}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={busy}
            placeholder={"Décris l'idée comme à un associé. Exemple : rendre un ERP open source agentique pour qu'une seule personne fasse tourner sa PME — l'humain ne valide que le critique…"}
          />

          <button className="mt-4 text-sm" style={{ color: "var(--sourdine)" }} onClick={() => setShowConstraints(!showConstraints)} disabled={busy}>
            {showConstraints ? "− Masquer" : "+ Contraintes imposées (optionnel)"}
          </button>

          {showConstraints && (
            <div className="mt-3 flex flex-col gap-3">
              <textarea
                rows={3}
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                disabled={busy}
                placeholder={"Technologies imposées, système d'enregistrement, actions engageantes propres au domaine, critère de sortie souhaité…"}
              />
              <div className="flex items-center gap-3">
                <span className="text-sm" style={{ color: "var(--sourdine)" }}>Limite de caractères</span>
                <input
                  type="number"
                  min={1500}
                  max={8000}
                  step={100}
                  value={charLimit}
                  onChange={(e) => setCharLimit(Math.max(1500, Number(e.target.value) || 3000))}
                  disabled={busy}
                  style={{ width: "120px" }}
                />
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button className="btn btn-primary" onClick={analyze} disabled={busy || phase === "questions"}>
              {phase === "analyzing" ? "Analyse en cours…" : "Analyser l'idée"}
            </button>
            {(phase === "done" || phase === "questions") && (
              <button className="btn btn-ghost" onClick={reset} disabled={busy}>
                Recommencer
              </button>
            )}
          </div>

          {error && (
            <p className="mono mt-4 text-sm" style={{ color: "var(--echec)" }}>{error}</p>
          )}
        </section>

        {/* ---------- questions ---------- */}
        {phase === "questions" && (
          <section className="card p-6 mt-6">
            <div className="eyebrow mb-2">02 · QUESTIONS MATÉRIELLES</div>
            <p className="text-sm mb-4" style={{ color: "var(--sourdine)" }}>
              Chaque réponse change le terrain, l'escalade ou la sortie. Une réponse laissée vide sera
              tranchée par hypothèse raisonnable, signalée dans le prompt.
            </p>
            <div className="flex flex-col gap-4">
              {questions.map((q, i) => (
                <div key={i} className="card-inset p-4">
                  <div className="mono text-sm mb-2" style={{ color: "var(--phosphore)" }}>Q{i + 1}</div>
                  <p className="text-sm mb-3 leading-relaxed">{q}</p>
                  <input
                    type="text"
                    value={answers[i] || ""}
                    onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                    placeholder="Ta réponse (ou laisse vide)"
                  />
                </div>
              ))}
            </div>
            <button className="btn btn-primary mt-5" onClick={() => generate(history, answers)}>
              Générer le prompt
            </button>
          </section>
        )}

        {/* ---------- vérificateur et résultat ---------- */}
        {(phase === "generating" || phase === "done") && (
          <section ref={resultRef} className="card p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="eyebrow">03 · VÉRIFICATEUR</div>
              <span className="tag">v{version}</span>
            </div>

            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <div
                  className={"compteur text-5xl font-medium " + (phase === "generating" ? "blink" : "")}
                  style={{
                    color:
                      phase === "generating"
                        ? "var(--phosphore)"
                        : verif && verif.pass
                        ? "var(--assertion)"
                        : "var(--echec)",
                  }}
                >
                  {phase === "generating" && !prompt ? "····" : count}
                </div>
                <div className="mono text-xs mt-1" style={{ color: "var(--sourdine)" }}>
                  caractères · limite {charLimit} · compte réel
                </div>
              </div>
              {phase === "done" && verif && (
                <div className="mono text-sm" style={{ color: verif.pass ? "var(--assertion)" : "var(--echec)" }}>
                  {verif.pass ? "✓ assertions au vert" : "✗ assertion échouée"}
                </div>
              )}
            </div>

            <div className="gauge mt-4">
              <div
                style={{
                  width: gauge + "%",
                  background:
                    phase === "generating"
                      ? "var(--phosphore)"
                      : verif && verif.pass
                      ? "var(--assertion)"
                      : "var(--echec)",
                }}
              />
            </div>

            {log.length > 0 && (
              <div className="mono mt-4 text-xs leading-relaxed" style={{ color: "var(--sourdine)" }}>
                {log.map((l, i) => (
                  <div key={i}>› {l}</div>
                ))}
              </div>
            )}

            {phase === "done" && prompt && (
              <>
                <div className="card-inset mt-6 p-4">
                  <pre className="mono text-sm leading-relaxed" style={{ color: "var(--craie)" }}>{prompt}</pre>
                </div>
                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  <button className="btn btn-primary" onClick={() => copyText(prompt, null)}>
                    {copied ? "Copié ✓" : "Copier le prompt"}
                  </button>
                  <button className="btn btn-ghost" onClick={savePrompt} disabled={saveState === "saved" || !storageOk()}>
                    {saveState === "saved" ? "Sauvegardé ✓" : "Sauvegarder"}
                  </button>
                  <button className="btn btn-ghost" onClick={runAudit} disabled={auditLoading}>
                    {auditLoading ? "Audit en cours…" : "Audit juge LLM"}
                  </button>
                </div>
                {saveState === "error" && (
                  <p className="mono mt-3 text-sm" style={{ color: "var(--echec)" }}>
                    La sauvegarde a échoué — réessaie.
                  </p>
                )}
              </>
            )}

            {audit && (
              <div className="card-inset mt-5 p-4">
                <div className="eyebrow mb-2">JUGE LLM</div>
                <p className="text-sm leading-relaxed mb-3">{audit.verdict}</p>
                {audit.failles && audit.failles.length > 0 ? (
                  <div className="mb-3">
                    <div className="mono text-xs mb-1" style={{ color: "var(--echec)" }}>FAILLES</div>
                    {audit.failles.map((f, i) => (
                      <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--sourdine)" }}>— {f}</p>
                    ))}
                  </div>
                ) : (
                  <p className="mono text-xs mb-3" style={{ color: "var(--assertion)" }}>
                    Aucune faille — rien à appliquer.
                  </p>
                )}
                {audit.hypotheses && audit.hypotheses.length > 0 && (
                  <div>
                    <div className="mono text-xs mb-1" style={{ color: "var(--phosphore)" }}>HYPOTHÈSES TRANCHÉES</div>
                    {audit.hypotheses.map((h, i) => (
                      <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--sourdine)" }}>— {h}</p>
                    ))}
                  </div>
                )}
                {audit.failles && audit.failles.length > 0 && (
                  <button className="btn btn-primary mt-4" onClick={applyAudit} disabled={busy}>
                    Appliquer l'audit et régénérer → v{version + 1}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* ---------- bibliothèque ---------- */}
        <section className="card p-6 mt-6">
          <div className="eyebrow mb-2">04 · BIBLIOTHÈQUE</div>
          {!storageOk() ? (
            <p className="text-sm" style={{ color: "var(--sourdine)" }}>
              Le stockage n'est pas disponible dans cet environnement — les prompts ne peuvent pas être conservés ici.
            </p>
          ) : libLoading ? (
            <p className="mono text-sm" style={{ color: "var(--sourdine)" }}>Chargement…</p>
          ) : library.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--sourdine)" }}>
              Aucun prompt sauvegardé. Génère un prompt, puis « Sauvegarder » — il restera ici d'une session à l'autre.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {library.map((it) => (
                <div key={it.id} className="card-inset p-4">
                  <button className="lib-row" onClick={() => setExpandedId(expandedId === it.id ? null : it.id)}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-sm font-medium" style={{ maxWidth: "36ch", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.title}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tag">v{it.version}</span>
                        <span className="tag">{it.count} car.</span>
                        <span className="mono text-xs" style={{ color: "var(--sourdine)" }}>{formatDate(it.savedAt)}</span>
                      </span>
                    </div>
                  </button>
                  {expandedId === it.id && (
                    <div className="mt-3">
                      <pre className="mono text-xs leading-relaxed" style={{ color: "var(--craie)" }}>{it.prompt}</pre>
                      <div className="mt-3 flex items-center gap-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => copyText(it.prompt, it.id)}>
                          {copiedId === it.id ? "Copié ✓" : "Copier"}
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--echec)" }} onClick={() => deleteItem(it.id)}>
                          Supprimer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="mono mt-10 text-xs" style={{ color: "#5E5870" }}>
          Le prompt généré part du prompt de référence de la session Odoo agentique. Un prompt ne se
          juge pas sur papier — lance-le, et laisse les 48 premières heures faire le prochain audit.
        </footer>
      </div>
    </div>
  );
}
