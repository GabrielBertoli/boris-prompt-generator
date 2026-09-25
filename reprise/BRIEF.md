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
- Fichiers par moteur (2026-09-25, voulu par Gabriel) : **dans chaque dossier MyERP du serveur, chaque
  moteur a ses fichiers et son équipe, jamais ceux de l'autre.** Codex : `AGENTS.md` + `.codex/agents/*.toml`.
  Claude : `CLAUDE.md` + `.claude/AGENTS.md` + `.claude/agents/*.md`. Équipes transposées : dossier Codex →
  Claude reçoit planificateur, explorateur, developpeur(-multi, -critique), testeur, relecteur, juge (Opus 5.5,
  xhigh ramené à high) ; dossier Claude → Codex reçoit convertisseur-module, convertisseur-lourd,
  verificateur (gpt-6-sol). Réglages Claude partout (`~/.claude`, profils Tour `claude-fr` et
  `claude-mac-gmail`, `~/.claude` du serveur) : `instructionFiles: claude-md-and-agents-md` +
  `claudeMdExcludes: ["**/!(.claude)/AGENTS.md"]`. Codex : les deux dossiers mis en confiance dans
  `~/.codex/config.toml` du serveur — sans cela Codex n'y chargeait PAS `.codex/` (mesuré : gpt-6-astra
  au lieu du gpt-6-sol du projet). Prouvé : Claude (`claude -p`, les deux dossiers) et Codex
  (`codex debug prompt-input`, sans appel) ne voient que leurs fichiers. **Reste à prouver** : que Codex
  voit ses définitions d'agents (appel réel, quota Codex épuisé jusqu'au 2026-09-26 14 h).
- Efforts des chefs (2026-09-25, décision de Gabriel) : **chef Codex en max, chef Claude en high**, sous-agents
  Claude en low/medium. Posé : `AGENTS.md` + `.codex/config.toml` du dossier Codex (« Sol max »), `AGENTS.md` +
  nouveau `.codex/config.toml` du dossier Claude (chef Codex max), `.claude/AGENTS.md` (chef Claude high), et les
  deux prompts de cartes via `POST /api/cartes`. La Tour lançait ce chef en medium (effort de la carte, garde
  qui refuse max) : **exception permanente ajoutée à la Tour** avec l'accord explicite de Gabriel — champ
  `effortPermanent` (lib/cartes.js, lib/harnais.js, index.html), `tests/44-effort-permanent.test.js`, `./fini.sh`
  VERT, Tour redémarrée, posé sur la carte Codex (effort de carte : medium ; en mission : max). Détail dans le
  CLAUDE.md de la Tour. Non observé en vrai : un lancement Codex (quota épuisé jusqu'au 2026-09-26 14 h).
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
7. Après le 2026-09-26 14 h (fin de la limite d'usage Codex) : prouver en vrai que Codex voit ses
   définitions d'agents dans les deux dossiers MyERP, et qu'un lancement de la carte « MyERP SSH Distant
   Codex » par la Tour part en max (bandeau « ⚡ max permanent », journal « effort d'exception pour cette
   exécution : max »). Codex : `~/.nvm/versions/node/v24.20.0/bin/codex` sur ldlc-custom1.
8. La carte « MyERP SSH Distant Claude » tournait avant les changements de fichiers du jour : elle lira son
   CLAUDE.md, son `.claude/AGENTS.md` et son prompt corrigé à son prochain lancement.
9. Tour : les copies `lib/*.inacheve-voix-2026-09-25` (chantier « voix » d'Atelier-Cartes) datent d'avant
   `effortPermanent` — à fusionner, jamais à recopier telles quelles (noté dans le CLAUDE.md de la Tour).

## Vérifier avant d'agir
`npm ci && npm run build && env -u ANTHROPIC_API_KEY npm run verify` (548 ✓ attendus) ;
Tour : `./fini.sh` VERT. Jamais de banc ni de vérification sur la clé API sans demande.
