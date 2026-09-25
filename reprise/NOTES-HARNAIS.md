# Chantier « harnais partagé » — décisions et hypothèses (2026-09-25)

À reporter dans DECISIONS.md / ETAT.md / CLAUDE.md par le coordinateur.

## Où ça vit
- Nouveau module `src/harnais.js`, sans aucun import (chargé hors navigateur par la Tour Unifiée via
  `techniques.js`, et par le terminal Prompting). Il porte : l'enveloppe des textes collés
  (`enveloppe`, `idCollage`, `idDe`, `texteDe`), le premier tour commun (`premierTour`,
  `conversationDe`, `blocEnCache`), la note système (`NOTE_TEXTE_COLLE`, `SYSTEME_ATELIER`), les
  phrases de refus (`REFUS`, `messageRefus`) et les réglages conseillés.
- `techniques.js` ré-exporte sous des noms FIGÉS : `REGLAGES_AGENT`, `CONSIGNE_ARRET_SYSTEME`,
  `LIGNE_TEMPS_COMPTE`, `RELANCE_POINTS_OUVERTS(points)`, `RAPPEL_SILENCE`, `NOTE_TEXTE_COLLE`.
  Chaque technique porte `reglages: REGLAGES_AGENT` (le même objet, gelé).

## Décisions
1. **Balises** : un identifiant de 4 caractères hex, tiré une fois par entrée (idée neuve → `analyze`,
   prompt rouvert → `resumeThread`), gardé dans `collageRef` pour tous les appels de l'entrée. Le
   même identifiant sert pour l'idée et pour le prompt jugé (le juge le reprend du premier message,
   `idDe`). Idée ET contraintes vont dans UNE seule enveloppe (même chaîne `ideeComplete()` au
   premier message et au fil reconstruit — le premier bloc est ainsi identique avant et après une
   correction, pour Boris, crochets et Opus 5.5 ; le gantelet reconstruit sous « BUT » et non
   « IDÉE », donc son premier bloc diffère après rechargement — inchangé, hérité).
   La phrase de repli « (idée non conservée…) » n'est pas enveloppée : c'est une consigne de l'atelier.
   Les réponses aux questions et les corrections demandées ne sont pas enveloppées : ce sont les mots
   de l'utilisateur, pas un texte collé d'ailleurs.
2. **Note système** : `SYSTEME_ATELIER` part à CHAQUE appel (questions, rédaction, juge), dès le
   premier. Hypothèse à mesurer (le guide le signale) : le modèle peut devenir un peu plus prudent.
3. **Cache** : `cache_control: {type: "ephemeral"}` sur le premier bloc (méthode + idée) ; l'instruction
   d'étape 1 est un second bloc, hors cache. `contexteNeuf` rend toujours une CHAÎNE (le terminal
   l'écrit dans un fichier) ; il lit les contenus en tableau par `texteDe`. Pas de point de cache sur le
   message du juge (message neuf à chaque version).
4. **Un effort par conversation** : `ROLES.questions.effort` = `ROLES.redaction.effort` = `high`
   (constante `EFFORT_CONVERSATION` dans meta.js). Le juge garde `high`, à part. L'en-tête bêta
   d'effort par message n'est PAS utilisé (non testable sans crédit). Effet de bord : le banc
   (`scripts/banc-opus55.mjs`) lit `ROLES.questions.effort` et questionne donc désormais en `high`.
5. **max_tokens** : réponse vide + `max_tokens` → « la réflexion du modèle a consommé tout le budget de
   jetons… ». Pas de relance automatique avec marge plus grande (l'audit la proposait ; non faite :
   la marge est déjà de 16 000 jetons, et une relance silencieuse double un coût sans mesure).
6. **Refus** : `stop_details` lu dans `message_delta` (`delta.stop_details`, repli `event.stop_details`) ;
   phrases pour `reasoning_extraction`, `cyber`, `bio`, `frontier_llm` ; toute autre catégorie ou
   absence → l'ancien message. L'erreur porte `categorie`. Aucune relance automatique.
7. **Terminal Prompting** (`Atelier-Prompting/atelier.mjs`, copie `atelier.mjs.bak-avant-harnais-2026-09-25`) :
   idée et prompt jugé enveloppés, note en tête du fichier `juge-*.md` (le sous-agent n'a pas de prompt
   système). L'outil Agent n'a AUCUN réglage d'effort : le juge du terminal tourne à l'effort de la
   session, pas à `ROLES.juge.effort` — l'en-tête du fichier (« même juge ») est corrigé en conséquence.
   Compatibilité : `harnais.js` est importé en optionnel ; tant que `Boris-Prompt-Generator/src` (le
   dépôt principal, lu par le terminal) n'a pas reçu ce chantier, le terminal produit l'ancien message,
   sans balises. Testé dans les deux cas (ATELIER_SRC → worktree : balises + note ; défaut : 0 balise).
8. **Réglages conseillés** : cinq rubriques (effort medium / `--effort medium` ; règle d'arrêt C10 verbatim
   dès le lancement via `--append-system-prompt`, jamais en cours de session, omise si un humain répond
   à chaque tour ; relance C9 paramétrée, 2 à 3 fois au plus ; API : `display: "updates"` + en-tête
   `thinking-display-updates-2026-08-18` + rappel C11 après ~5 étapes muettes ; sans budget : ligne C13).
   Affichées sous chaque prompt produit (composant `ReglagesAgent`, replié par défaut), un bouton copier
   par texte à coller. Mesurées sans débordement de 320 à 430 px (nouvelle surface « réglages conseillés
   dépliés » dans la section Mobile de verify).

## Relecture du 2026-09-25 — deux corrections

- **Cache manqué** (App.jsx ~490) : l'analyse construisait son premier tour sans étiquette (donc
  « IDÉE » par défaut) alors que `baseConvoFor` reconstruit sous « BUT » au gantelet — premier bloc
  différent entre l'analyse et le fil rechargé. L'étiquette entre au contrat (`T.etiquette`, « IDÉE »
  par défaut, « BUT » au gantelet dans `techniques.js`) et App.jsx la lit au lieu de l'omettre.
- **Refus facturés non comptés** (api.js ~238, App.jsx ~376) : l'erreur de refus ne portait que le
  message, pas l'usage déjà facturé par Anthropic. `api.js` joint `usage` à l'erreur ; le catch de
  `ask` (App.jsx) l'ajoute au coût du rôle — seul chemin où une erreur porte un usage, donc rien
  n'est compté deux fois.

## Reporté
- **Sorties structurées** (`output_config.format`) pour les questions et le juge : non fait, non testable
  sans crédit API.
- **Effort par message** (en-tête `mid-conversation-output-config-2026-07-01`) : non utilisé, même raison.
- **Mesure réelle** que les lectures en cache apparaissent (`cache_read_input_tokens`) : à constater au
  premier usage réel ; `costOf` les compte déjà.
