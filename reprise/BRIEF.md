# POINT DE REPRISE — Boris-Prompt-Generator (fin de session du 2026-09-25)

Lire d'abord : `ETAT.md` (tête + section 2026-09-25), `DECISIONS.md` § 35.

## Livré et vérifié
- Atelier aligné sur la doc OFFICIELLE Opus 5.5 : harnais partagé des 4 techniques
  (`src/harnais.js`), bloc `REGLAGES_AGENT`, méthode Opus 5.5 à deux modes, rédaction
  et questions en `medium` (mesuré au banc : 7/10 contre 5/10 en high).
- EN PRODUCTION le 2026-09-25 (commit `06c2aef`, puis `cde1abc`) : 567 ✓ / 0 ✗ sur
  l'alias, bundle `index-yW8qO7oj.js` identique au build local. Local : 548 ✓ / 0 ✗.
- Tour Unifiée (autre dépôt, son `CLAUDE.md` du 2026-09-25 fait foi) : consigne d'arrêt
  en prompt système, relance des points ouverts (2 max), garde d'effort (cartes en
  low/medium/high, « ⚡ Lancer une fois en max » avec raison), sous-agent
  `probleme-difficile` en effort max (2 appels/run, 3e refusé par crochet). `./fini.sh`
  VERT, tour redémarrée. Elle IMPORTE `CONSIGNE_ARRET_SYSTEME`, `LIGNE_TEMPS_COMPTE`,
  `RELANCE_POINTS_OUVERTS`, `REGLAGES_AGENT` de `src/techniques.js`.
- Efforts des cartes : 58 en `medium`, « MyERP SSH Distant Claude » en `high`, Qwen en
  `high`. Règle : défaut high/medium/low ; max seulement en exception ponctuelle.
- AGENTS.md : sur ldlc-custom1, AGENTS.md porte les instructions et CLAUDE.md = `@AGENTS.md`
  (dossiers myerp-ssh-distant-claude et -codex, sauvegardes `.bak-avant-agents-md-2026-09-25`).
- Carte SSH « MyERP SSH Distant Claude » relancée (run `run-f39c655b78d2`, cycle 15) :
  `--effort high`, `--agents`, `--settings`, consigne d'arrêt, constatés sur le serveur.

## Ouvert
1. Méthode Opus 5.5 : 3 cas rouges au banc (`vague`, `suivi`, `multiapps`). Une série de
   correctifs a fait tomber le banc complet à 4/10 → retirée. Pistes : `reprise/NOTES-OPUS55.md`
   (un changement à la fois, banc complet, deux passages).
2. À vérifier sur le vrai run : le refus du 3e appel `probleme-difficile` sous permissions
   contournées (doc muette) — regarder l'historique de la carte (table « Efforts d'exception »).
3. Carte Boris-Prompt-Generator passée en `medium` : effet au prochain lancement.
4. Non testable sans crédit API (clé épuisée, à la main de Gabriel) : sorties structurées,
   effort par message, preuve réelle du cache, parcours d'accès avec VERIFY_CODE.
5. À la main de Gabriel : recharge du crédit de la clé partagée ; domaine Resend.
6. `start_tour.sh` annonce « ne répond pas après 10 s » alors que la tour démarre (~15 s) :
   fausse alerte, délai à allonger (Tour Unifiée).

## Vérifier avant d'agir
`npm ci && npm run build && env -u ANTHROPIC_API_KEY npm run verify` (548 ✓ attendus) ;
Tour : `./fini.sh` VERT. Jamais de banc ni de vérification sur la clé API sans demande.
