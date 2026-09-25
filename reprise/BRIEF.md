# BRIEF — reprise Boris-Prompt-Generator (cycle 6)

## Livré et vérifié
- **En production** depuis 2026-09-23, commit `3de2662`+ poussé sur
  `origin/main`, promu à la demande de Gabriel (ETAT.md:3-10). Vérifié
  **sans clé/VERIFY_CODE** (crédit épuisé) : 437 assertions vertes, JS servi
  byte-identique au build local, CSS surensemble bénin (ETAT.md:8-24).
- **4e technique livrée** : `src/opus55.js` (méthode Opus 5.5), 4e entrée du
  registre `TECHNIQUES` (techniques.js:289,342 — `BORIS, GAUNTLET, CROCHETS,
  OPUS55`) (ETAT.md:45-49, DECISIONS.md §31).
- **Tout l'atelier tourne en Opus 5.5**, effort par rôle, juge en contexte
  neuf (ETAT.md:75-77, DECISIONS.md §33) ; **tarifs relus à la source**,
  Sonnet 5 à 2$/10$ (ETAT.md:71-73, DECISIONS.md §32).
- **Abonnement d'abord câblé et vérifié dans le code** : `scripts/banc-opus55.mjs`
  filtre les vars `ANTHROPIC_*` et lance `spawn("claude", …)` jamais
  `--bare` (banc-opus55.mjs:14-18,137-154) ; `scripts/verify.mjs` ne lit la
  clé que sous `VERIFY_API=1` (verify.mjs:29-37,1919-1921) (ETAT.md:79-83,
  DECISIONS.md §34).
- Lancement de carte réparé **côté Tour Unifiée** (profil Claude-fr,
  séparateur `--`), pas dans ce dépôt (ETAT.md:85-92, commit `1810e89`).

## Ouvert (propriétaire)
- **Gabriel** : recharger le crédit `ANTHROPIC_SHARED_KEY` (= clé de test),
  vidé le 2026-09-23 par le banc (ETAT.md:35-41,96-98). Aucun `.env` présent
  dans le worktree (seul `.env.example`), cohérent avec crédit à sec.
- **Gabriel** : domaine d'envoi Resend pour le mail de réinitialisation
  (ETAT.md:649-663, DECISIONS.md « Reste à la main de Gabriel »).
- **Agent, dette ancienne non résolue** : `npm run pilotage` (Playwright)
  jamais réinstallé/rejoué depuis longtemps — mesure des hauteurs, pas de
  clics (ETAT.md:26-28, package.json script `pilotage`).
- **Hors périmètre de ce dépôt** : ajouter Opus 5.5 au catalogue `MODELES`
  de la Tour Unifiée (ETAT.md:102-104).

## Dernier chantier en cours à la coupure
Rien. `git status` propre, dernier commit `651d1a4` le 2026-09-23 09:30
(git log -5 iso). Les 4 derniers commits (a454c0b→651d1a4, tous 08:49-09:30
le 23) sont déjà reflétés dans ETAT.md ; aucune trace de travail du cycle 5
sur le profil Claude-fr (aucun fichier modifié depuis, aucun WIP).

## Vérification (commandes + pièges)
- `npm run verify` (scripts/verify.mjs, 361 sites `assert(` statiques,
  certains en boucle) : par défaut sans clé ni `VERIFY_CODE` ; `VERIFY_CODE`
  pour les parcours d'accès ; `VERIFY_API=1` pour les générations réelles
  payantes (verify.mjs:5-6,33-37) — **ne pas lancer ici**, consigne du
  Lecteur.
- `npm run banc` (scripts/banc-opus55.mjs) : coûte le quota hebdo de
  l'abonnement Max via `claude -p` isolés — **ne pas lancer**.
- `npm run pilotage` : Playwright hors dépôt, absent de la machine
  (ETAT.md:337-342).

## Écarts constatés
1. **DECISIONS.md, fin de fichier** (« Reste à la main de Gabriel ») dit
   encore « Valider le déploiement en production (déposé, jamais promu par
   l'agent) », alors qu'ETAT.md:99-101 dit la production **faite** le
   2026-09-23 sur demande de Gabriel. Texte de DECISIONS.md non mis à jour
   après coup.
2. Comptes d'assertions rapportés dans ETAT.md diffèrent selon le contexte
   (437 sans clé en prod vs 424 avec clé / 408 sans clé en preview) —
   plausible (verify.mjs a été retouché après la preview, commits `49bb040`,
   `3de2662`, `a454c0b`), mais **non revérifié ici** (consigne : ne pas
   lancer `npm run verify`).

## Prochain geste recommandé
Rien à lancer côté agent avant la recharge du crédit (Gabriel) ou une
décision Resend. Si l'agent reprend seul : corriger l'écart n°1 dans
DECISIONS.md, puis s'attaquer à la dette Playwright/`npm run pilotage`.
