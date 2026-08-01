import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Gate from "./Gate.jsx";
import App from "./App.jsx";

/* Décide qui voit quoi : le portail, ou l'atelier. */
export default function Root() {
  const [state, setState] = useState({ phase: "loading", user: null, users: [] });
  const [reset, setReset] = useState(null);
  /* Clé de l'atelier : reçue à la connexion, gardée en mémoire seulement —
     jamais recopiée dans localStorage, pour qu'une sortie l'emporte. */
  const [sharedKey, setSharedKey] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset");
    const id = params.get("u");
    if (token && id) {
      setReset({ token, id });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.session();
        if (!alive) return;
        setSharedKey(data.sharedKey || null);
        setState({
          phase: data.authenticated ? "in" : "gate",
          user: data.user,
          users: data.users || [],
          degraded: false,
        });
      } catch (error) {
        if (!alive) return;
        setState({ phase: "gate", user: null, users: [], degraded: error.message });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onEnter = useCallback((user, key) => {
    setReset(null);
    if (key !== undefined) setSharedKey(key || null);
    setState((s) => ({ ...s, phase: "in", user }));
  }, []);

  const onLeave = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* le cookie expire de toute façon */
    }
    setSharedKey(null); // la clé de l'atelier ne survit pas à la sortie
    setState((s) => ({ ...s, phase: "gate", user: null }));
  }, []);

  const onUser = useCallback((user) => setState((s) => ({ ...s, user })), []);

  if (state.phase === "loading") {
    return (
      <div className="atelier grid min-h-screen place-items-center">
        <div className="mono pulse text-sm" style={{ color: "var(--muted-2)" }}>
          ouverture de l'atelier…
        </div>
      </div>
    );
  }

  if (state.phase === "gate") {
    return (
      <Gate
        users={state.users}
        reset={reset}
        degraded={state.degraded}
        onClearReset={() => setReset(null)}
        onEnter={onEnter}
      />
    );
  }

  return <App user={state.user} sharedKey={sharedKey} onUser={onUser} onLeave={onLeave} />;
}
