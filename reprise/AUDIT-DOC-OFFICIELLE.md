# L'atelier face à la documentation officielle d'Opus 5.5 (2026-09-25)

**Ce qui a été relu.** Les deux pages officielles d'Anthropic, en entier, le 2026-09-25 :
- le guide de prompting : platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
- le guide de migration : platform.claude.com/docs/en/models/opus-5-5/migration-guide

Ce rapport complète `AUDIT-OPUS55-2026-09-24.md` et `GUIDE-OPUS55-SOURCE.md` (les extraits
exacts du guide y sont). L'audit s'est fait en lecture seule : aucun code modifié, aucun appel de modèle.

**Le point de départ.** La méthode Opus 5.5 vient d'un billet de blog (Addy Osmani, claude.dev),
pas de ces deux pages. Le guide officiel dit l'inverse de ce que la méthode laisse croire :
**l'essentiel du gain vient des réglages et de la mécanique autour du modèle** (on l'appelle ici le
« harnais »). Il ne vient pas de la réécriture du prompt. Les prompts écrits pour Opus 5
« devraient bien marcher sans changement ».

**Deux mots utilisés partout :**
- **Prompt** : le texte que la méthode fait écrire, ou les consignes que l'atelier envoie lui-même
  au modèle.
- **Harnais** : tout le reste. Ce sont les réglages de l'appel (effort, taille maximale de réponse,
  cache), les relances, le minutage et la façon de présenter les textes collés. Ça vaut dans deux
  endroits : les appels que fait l'atelier, et les conseils qu'il devrait donner avec le prompt produit.

**Effort** : le réglage qui dit au modèle combien réfléchir (`low`, `medium`, `high`, `xhigh`,
`max`). Sur Opus 5.5, la réflexion ne se coupe plus. C'est donc le seul bouton.

---

## 1. Ce qui est déjà implémenté

| Règle du guide | Où | Où c'est fait |
|---|---|---|
| Appeler le modèle `claude-opus-5-5`, sans date | harnais | `src/meta.js:138` |
| Ne pas envoyer de champ `thinking` (la réflexion est toujours active) | harnais | `src/api.js:62`, `src/api.js:105-109` |
| Fixer l'effort explicitement à chaque appel | harnais | `src/meta.js:142-146`, `src/api.js:95`, `src/App.jsx:398`, `:481`, `:613-618` |
| Laisser de la place à la réflexion dans la taille maximale de réponse (elle y est comptée) | harnais | `src/api.js:63`, `src/api.js:105-106` (+16 000 jetons) |
| Lire la réponse par type de bloc, jamais « le premier bloc est du texte » | harnais | `src/api.js:212` (seuls les morceaux de texte sont lus) |
| Ne pas envoyer `temperature`, `top_p` ni `top_k` (refusés) | harnais | `src/api.js:91-95` |
| Ne jamais préremplir la réponse du modèle (refusé) : la conversation finit par un message de l'utilisateur | harnais | `src/generate.js:28`, `src/generate.js:39` |
| Ne pas réécrire l'historique en cours de conversation ; le juge part d'une conversation neuve | harnais | `src/generate.js:37-39`, `src/meta.js:154-180` |
| Tarifs d'Opus 5.5 (4 $ / 20 $), cache compris dans le calcul | harnais | `src/meta.js:196`, `src/meta.js:202-218` |
| Pas de « finis en N minutes » dans le prompt ; un délai dur tenu par le code | harnais + prompt | `src/api.js:65-71` |
| Aucun « réfléchis bien » ni « étape par étape », ni dans l'atelier ni dans le prompt produit | prompt | `src/opus55.js:168-172`, `:229`, `:340` |
| Aucune demande d'écrire son raisonnement dans la réponse (le modèle peut refuser) | prompt | `src/opus55.js:173-175`, `:230`, `:341-342` |
| Design : nommer les styles à exclure, avec la liste du guide ; refuser « évite le générique » | prompt | `src/opus55.js:139-145`, `:306-308`, `:176-178`, `:231` |
| Design : regarder ce que le modèle a choisi à la place et allonger la liste | prompt | `src/aide.js:261` (via le fil de correction) |
| Pas de « tiens tes réponses précédentes pour acquises » (le guide le déconseille pour un agent) | prompt | absent de `src/opus55.js` et `src/meta.js`, à bon droit |
| Les points d'avancement vont dans le même message que l'action suivante | prompt | `src/opus55.js:81-82`, vérifié `:218-219` |
| Nommer les arrêts voulus, et garder la confirmation avant un geste destructeur | prompt | `src/opus55.js:90`, `:220-228`, `:326-331` |
| Tenir la liste des tâches dans un fichier sur un long run | prompt | `src/opus55.js:102` |
| Un compte rendu court à la fin | prompt | `src/opus55.js:91`, `:239` |
| Pas de consigne du type « résume tous les 3 appels d'outils » (devenue inutile) | prompt | `src/meta.js:63`, `src/crochets.js:280` |

---

## 2. À implémenter dans le PROMPT

### Priorité 1 : nommer les arrêts qu'on ne veut PAS
- **Le guide.** Opus 5.5 obéit bien à une consigne qui décrit précisément les arrêts à éviter.
  Il en cite quatre :
  1. un résumé qui annonce l'étape suivante sans la faire ;
  2. une offre de continuer « sauf si tu préfères autrement » ;
  3. une liste de décisions dont aucune ne bloque ;
  4. « c'est un bon moment pour faire le point », parce que le tour a été long.

  Le guide ajoute un arrêt voulu : quand ce qui bloque est volontairement hors de portée de l'agent.
- **Aujourd'hui.** La méthode connaît ces quatre arrêts : elle les explique au rédacteur
  (`src/opus55.js:293-294`). Mais le prompt produit ne les nomme pas. Il dit seulement « continue »
  et « arrête-toi seulement si… » (`src/opus55.js:81-90`).
- **Changement proposé.** Allonger la phrase fixe de continuation d'une phrase courte, par exemple :
  « Ne termine pas un message par l'annonce de l'étape suivante, une offre de continuer, une liste
  de choix qui ne bloquent rien, ou un point d'étape parce que le tour a été long : fais la suite. »
  Ajouter à la phrase d'arrêt « ou si ce qui te bloque t'est volontairement interdit ». Il faut aussi
  mettre à jour l'oracle, la grille du juge (critère « arrêts »), les deux exemples de référence et
  la fourchette de mots (une trentaine de mots en plus).
- **Fichiers.** `src/opus55.js` (phrases `CONTINUE`/`ARRET`, `verifyPrompt`, `CRITERES`, exemples,
  `VISEE`), `src/aide.js`, `scripts/verify.mjs`.

### Priorité 2 : distinguer « seul » et « avec quelqu'un qui répond »
- **Le guide.** La consigne « ne t'arrête pas pour rendre compte » est faite pour un agent qui
  tourne seul. Il faut la laisser de côté quand un humain est là pour répondre. Dans ce cas, il vaut
  mieux demander une ligne d'intention avant la première action et un court récapitulatif à la fin.
- **Aujourd'hui.** La méthode vise « Claude Code ou l'app Claude » (`src/opus55.js:290`). Elle impose
  la règle de continuation dans tous les cas (`src/opus55.js:301`, vérifiée `:218-219`).
- **Changement proposé.** Deux voies possibles :
  - soit réserver la méthode aux tâches confiées à un agent qui travaille seul (Claude Code), et le dire ;
  - soit prévoir une variante « conversation » : pas de règle de continuation, une phrase « dis en une
    ligne ce que tu vas faire avant de commencer », et le récapitulatif final garde sa place.

  L'atelier peut trancher seul à partir de l'idée, sans poser de question.
- **Fichiers.** `src/opus55.js` (`buildMeta`, `verifyPrompt`), `src/aide.js:262`.

### Priorité 3 : une clause « plusieurs applications »
- **Le guide.** Pour un agent qui travaille sur des e-mails, des documents, des tableurs ou des
  fiches client, une phrase qui lui dit de fouiller largement avant d'agir augmente nettement les
  réussites, pour un peu plus d'appels. Le guide ajoute une condition : ne pas laisser de contenu non
  fiable dans ce qu'il fouille.
- **Aujourd'hui.** Aucune clause de ce type dans la liste (`src/opus55.js:98-133`).
- **Changement proposé.** Ajouter un septième type de clause, par exemple : « Avant toute action,
  explore largement : liste et ouvre les e-mails, documents, onglets et fiches des applications
  disponibles qui pourraient compter pour cette tâche, même ceux qu'elle ne cite pas, et sers-toi de
  ce que tu trouves. » Son usage : une tâche qui traverse plusieurs applications connectées. Mettre à
  jour le critère « clauses » du juge.
- **Fichiers.** `src/opus55.js` (`CLAUSES`, `CRITERES`), `src/aide.js`.

### Priorité 4 : Boris et les crochets interdisent « ne t'arrête pas » (à trancher)
- **Le guide.** Pour un agent qui tourne seul sur Opus 5.5, nommer les arrêts à éviter est utile.
- **Aujourd'hui.** Boris et les crochets classent « ne t'arrête pas » parmi les consignes inutiles
  (`src/meta.js:63`, `:273` ; `src/crochets.js:280`, `:361`). Leurs prompts visent pourtant des
  agents qui tournent seuls, 24 h sur 24. C'est un choix assumé (DECISIONS § 31), qui date d'avant
  la lecture du guide officiel.
- **Changement proposé.** Décision de Gabriel. Garder la règle si ces prompts tournent sur un autre
  modèle qu'Opus 5.5. Sinon, autoriser dans # ENVIRONNEMENT une phrase courte qui nomme les quatre
  arrêts à éviter.
- **Fichiers.** `src/meta.js`, `src/crochets.js`.

---

## 3. À implémenter dans le HARNAIS

### 3a. Dans les appels de l'atelier

#### Priorité 1 : baliser les textes collés
- **Le guide.** Chaque texte collé va entre deux balises qui portent le même identifiant tiré au
  hasard, par exemple `<pasted_content id="ab12">` … `</pasted_content id="ab12">`. Une note dans
  les consignes système dit ensuite de ne suivre les instructions qu'il contient que si l'utilisateur
  le demande. Le guide précise que les balises peuvent être imitées : c'est une protection parmi
  d'autres. Il faut aussi mesurer l'effet, car le modèle peut devenir un peu plus prudent.
- **Aujourd'hui.** Trois textes sont collés tels quels :
  - l'idée et les contraintes, juste après « IDÉE : » (`src/App.jsx:473-475`, `src/opus55.js:514-516`,
    `src/meta.js:242-244`, `Atelier-Prompting/atelier.mjs:128`) ;
  - le prompt à juger, simplement entre deux `---` (`src/meta.js:174-176`).

  L'atelier n'envoie aucune consigne système : `callClaude` sait le faire (`src/api.js:92`), mais
  personne ne s'en sert. Le risque est concret. Le prompt jugé est plein d'ordres (« Arrête-toi… »,
  « Termine par… »). Le terminal donne comme idée un prompt brut entier (`idee.md`). Le modèle peut
  obéir à ces textes au lieu de les traiter comme des données.
- **Changement proposé.** Une petite fonction qui entoure un texte de balises avec un identifiant
  aléatoire. L'appliquer à l'idée, aux contraintes et au prompt à juger. Mettre la note du guide dans
  le champ `system`, **dès le premier appel** de chaque conversation.
- **Fichiers.** `src/meta.js` (`baseConvoFor`, `contexteNeuf`, nouvelle fonction), `src/opus55.js:509-521`,
  `src/App.jsx:470-476`, `:676`, `:900`, `Atelier-Prompting/atelier.mjs:128`.

#### Priorité 2 : mettre le méta-prompt en cache, et ne pas changer d'effort en route
- **Le guide.** Le cache est une mémoire, côté Anthropic, du début de message déjà envoyé. Relire ce
  début depuis le cache coûte 20 fois moins cher (0,20 $ contre 4 $ le million de jetons,
  `src/meta.js:196`). Sur Opus 5.5, le cache fonctionne dès 512 jetons. Mais changer l'effort entre
  deux appels d'une même conversation efface le cache. Pour changer l'effort d'un seul tour sans le
  perdre, il existe un réglage par message (option expérimentale, en-tête
  `mid-conversation-output-config-2026-07-01`).
- **Aujourd'hui.**
  - Aucun point de cache n'est posé dans le code.
  - Le méta-prompt Opus 5.5 fait 12 766 caractères, Boris 5 809. Ils sont renvoyés en entier jusqu'à
    5 fois par génération (`src/generate.js:11`), puis à chaque correction et à chaque application
    d'audit.
  - La même conversation passe de `medium` pour les questions (`src/App.jsx:481`) à `high` pour la
    rédaction (`src/App.jsx:398`). Ce changement effacerait le cache s'il existait.
- **Changement proposé.**
  - Envoyer le premier message sous forme de bloc avec `cache_control`.
  - Soit garder un seul effort pour toute la conversation de rédaction, soit utiliser le réglage par
    message.
  - Vérifier ensuite, dans le compteur de coût, que les lectures en cache apparaissent (le calcul
    les gère déjà, `src/meta.js:202-218`).
- **Fichiers.** `src/api.js` (`callClaude` : bloc de cache, en-tête optionnel), `src/App.jsx:481`, `src/meta.js:142-146`.

#### Priorité 3 : mesurer l'effort au lieu de le décider
- **Le guide.** Commencer à `medium`, qui est le défaut, puis tester plusieurs niveaux sur ses
  propres essais. Garder `xhigh` et `max` pour les cas où un gain a été **mesuré**. Pour un travail
  qui tournait sans réflexion, commencer à `low`. Refaire ensuite la mesure du coût et du temps de
  réponse au niveau choisi.
- **Aujourd'hui.** Trois niveaux choisis par raisonnement, sans mesure :
  - questions en `medium` ;
  - rédaction en `high` ;
  - juge en `high` (`src/meta.js:128-146`, DECISIONS § 33).

  Le juge du banc tourne en `max` par défaut (`scripts/banc-opus55.mjs:40`, à la demande de Gabriel).
  Le temps de réponse n'est pas mesuré ; seul le coût l'est.
- **Changement proposé.** Un passage du banc (sur l'abonnement, avec l'accord de Gabriel) :
  rédaction et juge à `low`, `medium` et `high` ; questions à `low` et `medium`. Relever la note du
  juge, le coût et la durée. Ne garder `high` que là où la note monte vraiment.
- **Fichiers.** `src/meta.js:142-146`, `scripts/banc-opus55.mjs` (options d'effort, relevé de durée).

#### Priorité 4 : le banc juge contre le blog, pas contre la documentation
- **Aujourd'hui.** Le juge du banc relit le billet de claude.dev (`scripts/banc-opus55.mjs:58`).
  Il mesure donc la fidélité au blog.
- **Changement proposé.** Lui donner aussi les deux pages officielles, ou les extraits de
  `reprise/GUIDE-OPUS55-SOURCE.md`.
- **Fichier.** `scripts/banc-opus55.mjs:58-73`.

#### Priorité 5 : dire pourquoi le modèle a refusé
- **Le guide.** Un refus arrive avec `stop_reason: "refusal"` et un objet `stop_details` qui nomme
  la catégorie : biologie, cybersécurité, extraction de raisonnement. On peut prévoir un modèle de
  secours. Un refus pour extraction de raisonnement n'est jamais relancé automatiquement.
- **Aujourd'hui.** Le refus est détecté, mais la catégorie n'est pas lue. Le message affiché est
  toujours « Reformule l'idée » (`src/api.js:216`, `:231-233`). Il n'y a pas de modèle de secours :
  c'est voulu, un seul modèle (§ 33).
- **Changement proposé.** Lire `stop_details` dans le flux et afficher une phrase par catégorie.
- **Fichier.** `src/api.js`.

#### Priorité 6 : le message « réponse coupée » accuse la mauvaise cause
- **Le guide.** Une réponse coupée vient souvent de la réflexion, qui a mangé la place. Le remède
  est de laisser plus de place ou de baisser l'effort.
- **Aujourd'hui.** Quand la réponse est vide et coupée, l'écran dit « Baisse la limite de
  caractères » (`src/api.js:237`). La place prévue fait environ 17 000 à 18 000 jetons au total
  (`src/App.jsx:120` + `src/api.js:106`).
- **Changement proposé.** Dire « la réflexion a pris toute la place », et relancer une fois avec une
  marge plus grande. La marge n'est pas facturée.
- **Fichier.** `src/api.js:235-240`.

#### Priorité 7 : réponses JSON par « sorties structurées »
- **Le guide (migration).** Pour obtenir un format imposé, utiliser `output_config.format` (sorties
  structurées) plutôt qu'un préremplissage ou un outil forcé.
- **Aujourd'hui.** Les questions et le juge reçoivent seulement la consigne « Réponds UNIQUEMENT
  avec ce JSON ». Le JSON est ensuite repêché à la main (`src/meta.js:110-119`).
- **Changement proposé.** Donner un schéma JSON pour ces deux appels.
- **Fichiers.** `src/api.js`, `src/App.jsx:481`, `:613-618`.

#### Priorité 8 : terminal Prompting, effort du juge
- **Aujourd'hui.** Le terminal fait juger par des sous-agents. Ils prennent l'effort de la session,
  pas celui de `ROLES.juge` (`Atelier-Prompting/atelier.mjs:214-232`).
- **Changement proposé.** Indiquer l'effort dans la consigne donnée à ces sous-agents, ou l'écrire
  dans le journal.

### 3b. Conseils et réglages à livrer avec le prompt produit

Aujourd'hui, la seule aide est une ligne : « colle-le dans Claude Code ou l'app Claude, avec
Opus 5.5 » (`src/aide.js:262`). Rien n'est affiché à côté du prompt.

#### Priorité 1 : afficher les réglages conseillés sous le prompt
- **Le guide.** Effort `medium` par défaut. `xhigh` et `max` seulement si un gain a été mesuré. Pour
  une intégration par l'API avec de longs tours d'agent, prévoir 128 000 jetons de réponse maximum ;
  en `xhigh` ou `max`, partir de 64 000.
- **Changement proposé.** Une ligne « Réglages conseillés » sous chaque prompt Opus 5.5 : l'effort,
  et la taille de réponse pour qui passe par l'API.
- **Fichiers.** `src/opus55.js` (texte), `src/App.jsx` (affichage), `src/aide.js`.

#### Priorité 2 : poser la règle d'arrêt dès le début
- **Le guide.** La consigne contre les arrêts trop tôt se met à la fin des consignes système, **dès
  le premier message** de la session. L'ajouter en cours de route invalide la réflexion déjà faite.
- **Aujourd'hui.** L'aide suggère de la mettre dans le CLAUDE.md (`src/aide.js:262`). Elle ne dit pas
  qu'il faut le faire avant d'ouvrir la session.
- **Changement proposé.** Une phrase dans l'aide : « colle le prompt en premier message d'une
  session neuve, ou mets la règle dans le CLAUDE.md avant de lancer ».
- **Fichier.** `src/aide.js:262`.

#### Priorité 3 : que faire quand l'agent s'arrête quand même
- **Le guide.** Un message final sans action est un rapport, pas une preuve que le travail est fini.
  Si des points restent ouverts sans blocage annoncé, envoyer un court message qui les nomme. S'arrêter
  après 2 ou 3 relances. Si un sous-agent ou une commande tourne encore, attendre son résultat avant
  de conclure.
- **Changement proposé.** Livrer un message de relance prêt à coller, en français : « Il reste des
  points ouverts dans TASKS.md : … Continue. Si l'un est bloqué, dis ce qui le bloque. » Préciser la
  limite de 2 ou 3 relances. Pour Claude Code, citer la possibilité d'un contrôle automatique à la fin
  de chaque tour.
- **Fichiers.** `src/aide.js`, `src/opus55.js`.

#### Priorité 4 : rendre visibles les points d'avancement (intégrations par l'API)
- **Le guide.** Sur Opus 5.5, les notes écrites entre deux actions arrivent comme des blocs de
  réflexion, vides par défaut. Un client qui n'affiche que le texte paraît muet. Il faut activer
  `display: "updates"` (option expérimentale, en-tête `thinking-display-updates-2026-08-18`). Si
  l'agent reste muet environ 5 actions de suite, ajouter un rappel court (au plus 2 ou 3 fois). La
  règle de continuation de la méthode envoie justement ces notes dans le même message que l'action :
  elles arrivent donc dans ces blocs.
- **Changement proposé.** Une note dans l'aide, pour qui branche le prompt sur l'API (Claude Code le
  gère déjà).
- **Fichier.** `src/aide.js`.

#### Priorité 5 : budget de temps pour une équipe d'agents
- **Le guide.** Ne jamais écrire le temps dans le prompt. C'est le harnais qui ajoute
  `elapsed 340s / 1200s` à chaque message, avec un budget un peu au-dessus du temps visé, et qui garde
  son propre délai dur. Sans budget : afficher le temps écoulé et ajouter « le temps compte ; plus tôt
  un résultat juste arrive, mieux c'est ». Il faut vérifier la qualité, car sous pression l'agent
  vérifie un peu moins.
- **Changement proposé.** Un conseil attaché à la clause « sous-agents ».
- **Fichier.** `src/aide.js`.

#### Priorité 6 : conseils ponctuels, selon la tâche
- **Plusieurs applications** (avec la clause de la section 2) : ne pas laisser de contenu non fiable
  dans les sources que l'agent va fouiller.
- **Visuels denses** (graphiques, plans) : donner l'image à la meilleure résolution. Si possible,
  donner aussi un outil de recadrage ou un environnement avec PIL/OpenCV. Un effort plus haut aide à
  mieux utiliser ces outils.
- **Texte collé avec le prompt** (un e-mail, une page) : l'entourer des mêmes balises à identifiant
  aléatoire.

---

## Hors checklist : ce que la documentation officielle dit en plus

La checklist ne contenait pas ces points. Ils viennent des deux pages officielles.

**Guide de prompting :**
- Les noms d'effort ne valent pas la même réflexion d'un modèle à l'autre. `medium` sur 5.5 égale
  ou dépasse `high` sur Opus 5. Sur le code, `low` s'en approche pour bien moins cher.
- Pour moins de réflexion, baisser l'effort plutôt que l'écrire dans le prompt. En dernier recours,
  la phrase « Answer directly without deliberating. » réduit l'attente avant la première réponse
  (mesurer la qualité).
- Retirer toute règle qui interdit de réfléchir. Revérifier les rustines écrites pour un modèle sans
  réflexion. L'atelier n'en a pas.
- Contre les arrêts trop tôt : **nommer les arrêts non voulus ET les arrêts voulus**. Mettre la
  consigne à la fin des consignes système, dès le début. Elle coûte un peu plus d'appels. Elle ne
  convient pas si un humain répond.
- Attendre la fin d'une commande de fond ou d'un sous-agent avant de conclure.
- Vérifier la fin par un petit modèle séparé, qui compare la conversation à la condition de fin.
- Donner à l'agent un outil « envoyer un message à l'utilisateur » pour ce qui doit être transmis
  mot pour mot, déclaré dès le premier appel.
- Demander une ligne d'intention avant la première action et un court récapitulatif à la fin (utile
  surtout avec un humain présent).
- Rappel quand l'agent reste muet : 2 ou 3 fois au plus, en l'ajoutant sans jamais l'effacer, pour
  garder le cache.
- Budget de temps et effort sont deux choses différentes. Baisser l'effort réduit le travail. Un
  budget fait surtout travailler plus d'agents en parallèle. Contrôler la qualité sous pression.
- Balises de texte collé : elles peuvent être imitées, et rendent le modèle un peu plus prudent. À mesurer.
- Visuels : revérifier l'ancien échafaudage, qui est peut-être devenu inutile. Sans outil, plus
  d'effort aide pour les plans techniques mais pas pour les graphiques.
- Refus : trois catégories nouvelles ou élargies (biologie, cybersécurité, extraction de
  raisonnement). Chercher des failles dans du code reste permis. Un modèle de secours est possible,
  sauf pour l'extraction de raisonnement.

**Guide de migration :**
- Pas de `temperature`, `top_p` ni `top_k`, pas de préremplissage : on guide par le prompt ou par
  les sorties structurées.
- Pas d'outil forcé (`tool_choice` `any` ou `tool`) : utiliser `auto`, et dire dans le prompt quand
  l'outil s'applique.
- Renvoyer les blocs de réflexion intacts dans une boucle d'outils. Traiter leur texte comme un
  simple affichage. Ne pas modifier l'historique en cours de route.
- Lire `stop_details` sur un refus, et prévoir un modèle de secours ou une relance.
- Refaire la mesure du coût et du temps de réponse au niveau d'effort choisi. Tester en
  développement avant la production.
- Cache dès 512 jetons.
- Messages système en cours de conversation, pour changer une consigne sans reconstruire
  l'historique et sans perdre le cache.
- Options expérimentales pour les agents : budgets de jetons par tâche, ajout d'outils en cours de
  conversation.
- Prix : 4 $ / 20 $ le million de jetons (l'atelier est à jour).

## Sans objet

Sont sans objet : l'outil forcé, l'outil de contrôle de l'ordinateur, les images dans l'atelier, les
identifiants propres à Bedrock ou Vertex, Priority Tier, le mode rapide, l'en-tête de contexte 1M,
les anciens en-têtes expérimentaux, le parsage du JSON des outils, les blocs de réflexion dans une
boucle d'outils (l'atelier n'a pas d'outils), le passage d'un modèle à un autre, « tiens tes réponses
pour acquises » (à éviter pour un agent), et le programme de vérification pour les sciences de la vie.
