import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

/* ================================================================
   PORTE D'ENTRÉE — on touche son prénom, on entre son code.
   Trois personnes, pas d'inscription, pas de mot de passe oublié
   qui traîne : un lien par mail, valable trente minutes.
   ================================================================ */

/* Repli si /api/session ne répond pas : la porte reste dessinée.
   La liste qui fait foi est celle du serveur (api/_lib/http.js). */
const FALLBACK = [
  { id: "gabriel", name: "Gabriel", initial: "G" },
  { id: "karl", name: "Karl", initial: "K" },
  { id: "raphaelle", name: "Raphaëlle", initial: "R" },
  { id: "gabriela", name: "Gabriela", initial: "G" },
];

export default function Gate({ users, reset, degraded, onClearReset, onEnter }) {
  const roster = users && users.length ? users : FALLBACK;
  const resetUser = reset ? roster.find((u) => u.id === reset.id) : null;

  const [picked, setPicked] = useState(null);
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const codeRef = useRef(null);

  useEffect(() => {
    if ((picked || resetUser) && codeRef.current) codeRef.current.focus();
  }, [picked, resetUser]);

  const choose = (user) => {
    setPicked(user);
    setCode("");
    setError("");
    setNotice("");
  };

  const back = () => {
    setPicked(null);
    setCode("");
    setConfirm("");
    setError("");
    setNotice("");
    if (reset) onClearReset();
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    if (!picked || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api.login(picked.id, code);
      onEnter(data.user, data.sharedKey);
    } catch (err) {
      setError(err.message);
      setCode("");
      codeRef.current?.focus();
    }
    setBusy(false);
  };

  const submitReset = async (event) => {
    event.preventDefault();
    if (!resetUser || busy) return;
    if (code !== confirm) {
      setError("Les deux codes ne sont pas identiques.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api.confirmReset(resetUser.id, reset.token, code);
      onEnter(data.user, data.sharedKey);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const askReset = async () => {
    if (!picked || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api.requestReset(picked.id);
      if (data.sent) setNotice(data.message);
      else setError(data.message);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="atelier">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-5 py-12 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          {/* ---------- manifeste ---------- */}
          <section className="rise">
            <div className="mb-7 flex items-center gap-3">
              <span className="brand-mark">B</span>
              <span className="eyebrow">Atelier Boris</span>
            </div>

            <h1 className="display text-[clamp(42px,7.4vw,72px)]">
              De l'idée au prompt
              <br />
              qui fait <em>tourner</em>
              <br />
              la boîte.
            </h1>

            <p className="lede mt-7">
              Générateur de system prompts agentiques, méthode Boris. Huit sections, un
              vérificateur qui refuse ce qui dépasse, un juge qui cherche la faille — et une
              bibliothèque qui garde tes prompts d'une session à l'autre.
            </p>

            <div className="mono mt-9 flex flex-wrap gap-2 text-[10.5px] uppercase tracking-[0.18em]">
              {["But", "Garde-fous", "Vérificateur", "Sortie"].map((word) => (
                <span key={word} className="tag">
                  {word}
                </span>
              ))}
            </div>
          </section>

          {/* ---------- accès ---------- */}
          <section className="card rise p-6 sm:p-8" style={{ animationDelay: "120ms" }}>
            {degraded && (
              <p className="note note-error mb-5">
                L'accès ne répond pas : {degraded}
              </p>
            )}

            {/* nouveau code, arrivé par le lien du mail */}
            {resetUser ? (
              <form onSubmit={submitReset}>
                <div className="section-head">
                  <span className="section-num">00</span>
                  <span className="section-title">Nouveau code — {resetUser.name}</span>
                  <span className="section-line" />
                </div>
                <p className="lede mb-6 text-[14.5px]">
                  Ce lien n'est valable qu'une fois. Choisis un code d'au moins quatre
                  caractères ; il remplace immédiatement l'ancien.
                </p>

                <label className="field-label" htmlFor="new-code">
                  Nouveau code
                </label>
                <input
                  id="new-code"
                  ref={codeRef}
                  type="password"
                  autoComplete="new-password"
                  value={code}
                  disabled={busy}
                  onChange={(e) => setCode(e.target.value)}
                />

                <label className="field-label mt-4" htmlFor="new-code-2">
                  Répète-le
                </label>
                <input
                  id="new-code-2"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  disabled={busy}
                  onChange={(e) => setConfirm(e.target.value)}
                />

                {error && <p className="note note-error mt-5">{error}</p>}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button className="btn btn-primary" type="submit" disabled={busy || !code}>
                    {busy ? "Enregistrement…" : "Enregistrer et entrer"}
                  </button>
                  <button className="link" type="button" onClick={back} disabled={busy}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : !picked ? (
              <>
                <div className="section-head">
                  <span className="section-num">00</span>
                  <span className="section-title">Qui entre ?</span>
                  <span className="section-line" />
                </div>

                <div className="gate-grid">
                  {roster.map((user, index) => (
                    <button
                      key={user.id}
                      type="button"
                      className="gate-card rise"
                      style={{ animationDelay: `${180 + index * 70}ms` }}
                      onClick={() => choose(user)}
                    >
                      <span className="gate-initial">{user.initial}</span>
                      <span className="gate-name">{user.name}</span>
                      <span className="gate-hint">Toucher pour entrer</span>
                    </button>
                  ))}
                </div>

                <p className="mono mt-6 text-[11px]" style={{ color: "var(--muted-2)" }}>
                  Accès vérifié côté serveur. Aucun code ne circule dans la page.
                </p>
              </>
            ) : (
              <form onSubmit={submitLogin}>
                <div className="section-head">
                  <span className="section-num">00</span>
                  <span className="section-title">Code — {picked.name}</span>
                  <span className="section-line" />
                </div>

                <div className="mb-6 flex items-center gap-4">
                  <span className="gate-initial" style={{ fontSize: 46 }}>
                    {picked.initial}
                  </span>
                  <div>
                    <div className="text-lg font-semibold">{picked.name}</div>
                    <button className="link" type="button" onClick={back} disabled={busy}>
                      Ce n'est pas moi
                    </button>
                  </div>
                </div>

                <label className="field-label" htmlFor="code">
                  Code d'accès
                </label>
                <input
                  id="code"
                  ref={codeRef}
                  type="password"
                  autoComplete="current-password"
                  value={code}
                  disabled={busy}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="••••••"
                />

                {error && <p className="note note-error mt-5">{error}</p>}
                {notice && <p className="note note-ok mt-5">{notice}</p>}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button className="btn btn-primary" type="submit" disabled={busy || !code}>
                    {busy ? "Vérification…" : "Entrer"}
                  </button>
                  <button className="link" type="button" onClick={askReset} disabled={busy}>
                    Code oublié
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>

        <footer className="mono mt-14 text-[11px]" style={{ color: "var(--muted-2)" }}>
          Un prompt ne se juge pas sur papier — lance-le, et laisse les 48 premières heures
          faire le prochain audit.
        </footer>
      </div>
    </div>
  );
}
