# Décisions

Personne ne répond aux questions : chaque arbitrage est tranché ici, avec son
motif. Une décision se relit et se renverse ; elle ne se redécouvre pas.

---

## 1. Clé-valeur : Upstash Redis (REST), via le Marketplace Vercel

Edge Config se lit vite mais s'écrit par API de contrôle — or on écrit à chaque
changement de code, de mail et de bibliothèque. Redis fait les deux, s'appelle en
un `POST` sans dépendance npm, et s'installe depuis Vercel sans créer de compte
tiers. `api/_lib/kv.js` accepte les deux jeux de noms (`KV_REST_API_*` et
`UPSTASH_REDIS_REST_*`) : l'intégration peut changer sans toucher au code.

Clés : `bpg:user:<id>:code`, `:email`, `:prompts`, `bpg:reset:<empreinte>`,
`bpg:rl:<seau>`.

## 2. Codes : scrypt, jamais en clair, jamais dans le dépôt

`node:crypto` suffit — scrypt N=16384, sel de 16 octets, comparaison en temps
constant. Les codes initiaux (initiales + année) sont posés **une fois** par
`scripts/seed.mjs`, passés en argument depuis un poste de confiance. Ils
n'existent ni dans le dépôt, ni dans les variables Vercel, ni dans le bundle.

Conséquence assumée : si la clé-valeur est vidée, plus personne n'entre tant que
`seed.mjs` n'a pas été relancé. C'est le prix d'un dépôt sans code en clair.

## 3. Session : cookie HMAC, pas de librairie JWT

`base64url(payload).base64url(HMAC-SHA256)`, signé par `SESSION_SECRET`, posé en
`HttpOnly; Secure; SameSite=Lax`, valable 30 jours. Le serveur ne stocke rien :
un jeton se vérifie, il ne se cherche pas. Rien à révoquer côté base, rien à
purger.

## 4. Réinitialisation : lien à usage unique, 30 minutes

`/api/reset` action `request` → jeton aléatoire de 32 octets ; c'est son
**empreinte HMAC** qui est stockée, jamais le jeton. Le lien arrive par mail,
ouvre le formulaire de nouveau code, et la clé est effacée à la première
utilisation. Trois demandes par heure et par prénom.

Sans adresse enregistrée, la réponse le dit franchement plutôt que de faire
semblant d'envoyer : à trois personnes, l'anti-fuite d'information coûterait
plus qu'il ne rapporte.

## 5. Envoi : Resend en REST

Le fournisseur transactionnel le plus simple à câbler depuis Vercel, sans SDK.
`MAIL_FROM` est une variable : tant qu'aucun domaine n'est vérifié, Resend
n'accepte que `onboarding@resend.dev` comme expéditeur, et ne délivre qu'à
l'adresse propriétaire du compte. Vérifier un domaine relève de l'escalade
(§ ESCALADE du programme) — la variable est déjà là pour le jour où.

## 6. Clé API du visiteur : `localStorage`, appels directs

La clé Anthropic ne touche jamais une fonction serverless. Elle vit dans le
navigateur (`atelier-boris:cle-api`) et part directement vers
`api.anthropic.com` avec `anthropic-dangerous-direct-browser-access: true`.
Aucune fonction de relais : le serverless fait l'accès, rien d'autre.

## 7. Modèles : Sonnet 5 produit, Opus 5 juge

Le playbook l'impose : *le juge n'est jamais le modèle qui a produit — angles
morts corrélés.* Sonnet 5 écrit (rapide, suffisant sous 3000 caractères), Opus 5
audite. Les deux sont modifiables dans les réglages ; l'interface prévient quand
juge et auteur se confondent.

Réflexion coupée (`thinking: {type:"disabled"}`) : la longueur de sortie reste
prévisible sous `max_tokens`, et la boucle d'assertions joue déjà le rôle
d'auto-correction. Exception câblée : Fable et Mythos pensent toujours et
rejettent le réglage (400) — le champ est alors omis.

`claude-sonnet-4-6` de la pièce jointe était périmé au moment de la reprise.

## 8. `window.storage` → navigateur **et** serveur

La pièce jointe s'appuyait sur un `window.storage` propre à son environnement
d'origine. Remplacé par une bibliothèque **personnelle** : le serveur fait foi
(`/api/prompts`, clé dérivée de la session — jamais d'un paramètre), le
navigateur garde un double qui prend le relais si la clé-valeur tombe.

C'est un élargissement assumé du « serverless minimal : l'accès, rien d'autre » :
Gabriel a demandé que chacun puisse sauvegarder, modifier et supprimer ses
prompts, ce qui n'a de sens que si la bibliothèque suit son propriétaire d'un
appareil à l'autre. Le point reste minimal : une clé par personne, deux verbes.

## 9. Tailwind v4

La pièce jointe est écrite en classes utilitaires. Les garder évite de récrire
la mise en page — donc évite la classe de régressions qu'un remaniement traîne.
Le thème (couleurs, fontes, composants) vit dans `src/atelier.css`.

## 10. Typographie et couleur

Instrument Serif (titres), Archivo (interface), JetBrains Mono (tout ce qui se
mesure : compteurs, prompts, journaux). Encre chaude presque noire, braise
orange, craie. Le compteur de caractères est le seul chiffre géant de la page :
c'est lui qui dit si le prompt passe.

## 11. Gestes de bibliothèque : fonctions pures d'un côté, DOM de l'autre

Renommer, dupliquer, mettre en Markdown, exporter, réimporter, fusionner :
tout cela vit en fonctions **pures** dans `src/library.js` — ni `document`,
ni `fetch`. Le vérificateur les rejoue alors en Node, sans navigateur, pour
le prix d'un import. Seule `downloadText` touche au DOM, et seulement à
l'appel. C'est la raison d'être de la séparation : 22 assertions gratuites.

L'import **fusionne** au lieu d'écraser. À identifiant égal, c'est la date de
modification qui tranche : un fichier plus ancien n'efface jamais plus récent
que lui, et réimporter deux fois le même fichier ne duplique rien. Toute
entrée venue du dehors est reconstruite champ par champ (`normalize`) — on ne
garde jamais un objet importé tel quel.

L'export existe parce que la bibliothèque ne vit que dans la clé-valeur : la
décision n° 2 acte déjà qu'un magasin vidé perd tout. Un fichier chez soi est
la seule reprise possible.

## 12. Impression : un portail hors du `#root`

La feuille d'impression est montée par `createPortal` dans `document.body`,
hors de l'arbre React. La règle `@media print` n'a dès lors qu'une chose à
masquer — `#root`, l'application entière — au lieu de dépendre de la
structure du DOM. Pas de fenêtre surgissante : rien à bloquer, rien à
autoriser.

Conséquence pour le vérificateur : `window.print` doit être **neutralisé
avant tout le reste** avant de cliquer le bouton dans Chrome. Une vraie boîte
d'impression suspendrait le navigateur, et le vérificateur avec — la même
classe de blocage que celle déjà rencontrée avec `execFileSync`.

## 13. Le vérificateur mesure les surfaces réelles, avec marqueur

La sonde mobile répondait « non authentifié » et servait zéro prénom : elle
ne mesurait qu'un portail vide. L'atelier — ses cartes, leurs neuf boutons —
n'avait jamais été mesuré. Elle sert désormais **deux surfaces**, chacune
avec ses réponses d'API en dur.

Chaque surface porte un **marqueur** vérifié dans le DOM (« Karl » pour le
portail, « Dupliquer » pour l'atelier). Sans lui, une page qui ne se rend pas
donnerait « zéro débordement » — un faux vert. La règle générale : une mesure
n'a de valeur que si l'on prouve d'abord qu'on a mesuré la bonne chose.

## 14. Appel en flux, et borné dans le temps

Une génération pouvait tourner plus de trois minutes sans qu'aucune limite
ne s'y oppose et sans qu'un seul caractère n'apparaisse. Deux manques, pas
un : rien ne bornait l'attente (un `fetch` qui traîne ne se termine jamais
de lui-même, et la boucle de réparation en enchaîne cinq), et rien ne
s'affichait avant la fin.

Le flux règle le second (`onDelta` : le texte arrive au fur et à mesure).
Pour le premier, le délai porte sur l'**inactivité** — 60 s réarmées à
chaque morceau reçu — et non sur la durée totale : un modèle lent reste
acceptable, un modèle muet ne l'est pas. Un plafond dur de 300 s couvre le
reste. Le vérificateur appelle désormais `callClaude` lui-même : il ne
recopie plus le `fetch`, pour la même raison qu'il ne recopie plus la
boucle de génération.

## 15. Le fil de correction vit dans l'entrée, coupé et reconstruit

Le fil est enregistré **dans l'entrée de bibliothèque** — donc dans le
profil, par `/api/prompts`, sans nouvelle surface serveur. C'est le
prolongement de la décision n° 8, pas un nouvel élargissement.

Deux bornes le rendent tenable :

**La coupe.** Seules les trois dernières réponses gardent leur texte
entier ; au-delà, une ligne les résume. Les demandes ne sont jamais
coupées : ce sont elles qui disent l'intention, et elles ne pèsent rien.
Sans cette coupe, douze corrections sur une seule entrée dépassent la
charge utile — l'écriture de TOUTE la bibliothèque échouerait alors, pas
seulement celle du fil. Conséquence assumée : une version coupée ne se
restaure plus.

**La reconstruction.** Une correction repart toujours de `baseConvoFor`
(méthode + idée + prompt en vigueur), jamais de la conversation accumulée.
Deux raisons : le coût par appel reste constant quel que soit le nombre de
corrections, et le comportement est **identique avant et après un
rechargement**. Rejouer l'historique aurait donné un atelier qui répond
autrement selon qu'on a rouvert la page ou non — le pire des deux mondes.

Le serveur ne fait confiance à personne : `sanitize` reconstruit chaque
tour champ par champ et replafonne (40 tours, 24 000 caractères chacun).
C'est aussi ce qui rend l'assertion nécessaire — un champ non déclaré y
disparaît en SILENCE, et le profil ne garderait rien.

## 16. La casse : un panneau, pas une section de bas de page

La bibliothèque au bas de la page obligeait à faire défiler pour retrouver
un prompt, alors que c'est l'objet qu'on manipule le plus. Elle devient un
panneau permanent au-delà de 1100 px, tiroir coulissant en dessous.

Le tiroir se referme par **transformation**, jamais par démontage. Deux
raisons, la seconde compte autant que la première : ce qu'il contient
reste dans l'ordre de tabulation et lisible par un lecteur d'écran, et il
reste atteignable par une sonde — un tiroir démonté serait invérifiable.

## 17. Le penseur : un GIF pour la photo, du CSS pour le reste

Gabriel voulait un GIF animé de sa photo pendant les appels. Animer un
visage demande un modèle de génération vidéo (Veo, Kling) : API payante,
aucune clé, et la question du portrait d'une personne réelle. Ce qui est
livré est un vrai GIF, fabriqué localement, qui porte un mouvement
**photographique** — souffle, léger redressement, encre qui respire — pas
une animation faciale. C'est dit tel quel.

Recette : `magick` produit 24 images (échelle 170 → +3 %, rotation ±0,5°,
duotone `#100c0a → #f6e3d4`), `ffmpeg` assemble en palette deux passes
(`palettegen stats_mode=diff` puis `paletteuse dither=none`), `gifsicle
-O3 --lossy=90` optimise. 160 px, 140 Ko.

La trame de similigravure et l'anneau de repérage sont restés en **CSS**.
Dans le GIF, la trame dérivante détruisait la compression inter-images :
1,3 Mo contre 140 Ko. En CSS elle est nette à toute densité d'écran, et
`prefers-reduced-motion` peut l'arrêter — ce qu'un GIF ne sait pas faire.

## 18. Deux instruments de vérification, et ce que chacun ne prouve pas

Le harnais d'assertions (`npm run verify`) et le pilotage réel
(Playwright) ne mesurent pas la même chose. Aucun ne remplace l'autre.

**Ce que le harnais ne peut pas faire.** Sa sonde mobile force
`documentElement.style.width`, mais les media queries s'évaluent sur le
**vrai viewport** — 485 px sous ce Chrome headless. Aucun palier
responsive n'est donc exercé. Mesuré : `--window-size=320,720` laisse
`window.innerWidth` à 500, ce Chrome l'ignore pour de bon. C'est pourquoi
le débordement de l'avatar à 320 px lui était invisible.

**Et pourquoi on ne l'a pas « durcie ».** Ajouter « bord droit hors
cadre » à la sonde la faisait signaler des éléments que les paliers
corrigent : elle ne peut pas distinguer un vrai défaut d'un faux, puisque
les paliers ne s'appliquent pas chez elle. Retiré. Une sonde qui ne sait
pas trancher ne doit pas trancher — mieux vaut une limite écrite qu'une
assertion qui ment dans les deux sens.

La vérification responsive passe donc par un pilote qui règle vraiment le
viewport. Playwright n'est pas une dépendance du dépôt : on l'installe à
côté, `channel: "chrome"` évite tout téléchargement. Le mode d'emploi
complet est dans `.claude/skills/verify/SKILL.md`.

## 19. Le plafond de longueur est dans le vérificateur, pas dans le réglage

Mesuré le 2026-08-02 : un prompt de plus de 4000 caractères est sorti « au
vert ». Il l'était — le curseur des réglages montait à 8000 et le
vérificateur comparait à **cette** limite. Une limite réglable par
l'utilisateur mesure son propre réglage, pas ce qu'un agent accepte : le
vérificateur se notait lui-même.

`HARD_LIMIT = 3950` vit donc dans `verifyPrompt`, par où TOUT passe —
première génération, application d'audit, correction du fil, remise d'une
ancienne version, édition à la main. Le clamp du curseur (`capLimit`) n'est
qu'une politesse d'affichage ; le plafond est la garantie.

Trois conséquences assumées :

- `check.over` est distinct de `check.pass`. Une faute de structure se
  répare à la main et le prompt s'affiche ; un dépassement ne se répare
  pas, et **rien ne s'affiche**. Montrer un prompt hors limite sous un
  bouton « Copier le prompt », c'était livrer un produit cassé en s'en
  excusant.
- Une correction refusée n'écrase pas la version en vigueur. Elle entre au
  fil marquée `compacted` : la trace reste, le texte non — sinon le bouton
  copier du fil rendrait par la bande le prompt qu'on vient de refuser.
- `runVerifiedGeneration` rend la **meilleure** tentative, plus la
  dernière. Chaque serrage est un coup de dé ; rendre le cinquième jetait
  un texte plus court déjà obtenu et déjà payé.

## 20. Le fil quitte le marbre, la casse redevient un tiroir

Une correction est un dialogue qui dure ; le prompt est la pièce qu'on
regarde. Empilés, ils obligeaient à faire défiler toute la page pour relire
ce qu'on venait de demander — et le prompt disparaissait de l'écran au
moment précis où on écrivait ce qu'il fallait y changer.

Le fil devient le **pupitre**, collé au bord gauche sur toute la hauteur :
seul son corps défile, le composeur ne quitte jamais l'écran. En dessous de
1100 px il repasse dans le flux, **sous** le marbre (`order`) — il n'y a
plus de bord à occuper.

La casse repasse donc en tiroir (bouton ☰ de la barre) : elle renversait la
décision 16, et c'est voulu. Deux panneaux permanents à gauche ne laissaient
plus de milieu au prompt, et c'est le prompt qu'on vient lire. Le tiroir se
referme toujours par transformation — la raison de 16 tient toujours.

Deux mesures qui vont avec, et sans lesquelles « tenir dans un écran » est
un vœu : `--topbar-h` est appliquée par la barre elle-même (`min-height`),
donc la constante ne peut pas mentir à ce qui se cale dessous ; et les
sections du marbre portent un `scroll-margin-top`, sinon le défilement
automatique glissait l'en-tête de la carte sous la barre collante et la
carte arrivait déjà amputée.

## 21. Le grand chiffre dit ce que vaut le prompt, plus ce qu'il pèse

En tête de carte s'affichait la LONGUEUR : la mesure exacte de la seule
chose qui ne dit rien de la qualité. Deux prompts de 3 800 caractères,
l'un sans oracle et l'autre qui tient la méthode, montraient le même
chiffre. La longueur reste — en puce, avec ce qui se compte.

À sa place, une **note sur 10 du juge**, et une jauge à trois bandes
peintes à demeure (rouge sous 6, orange de 6 à 8, vert au-delà) : on lit
où tombe un 7,5 et de combien il s'en faut pour passer au vert. Une barre
qui change seulement de couleur ne dit ni l'un ni l'autre. Le repère
traverse l'épaisseur de l'arc et ne part pas du centre — mesuré, une
aiguille depuis le centre barrait le chiffre.

Quatre choix qui portent le reste :

- **Un seul juge, un seul appel.** Il note ET audite dans la même réponse.
  Deux appels, c'étaient deux jugements du même texte qui pouvaient se
  contredire — une note de 8,5 au-dessus de trois failles graves, et rien
  pour dire lequel croire. Il tourne tout seul après chaque version ;
  c'est le prix d'une note toujours à l'écran, et il est visible dans la
  puce « juge » du compteur de dépense.
- **La note globale n'est pas la moyenne** : elle ne dépasse pas de plus
  de 2 points le plus faible des six critères. Sans cette règle, cinq
  critères à 9 et un vérificateur à 2 donnaient 7,8 — « bon prompt » pour
  un prompt sans oracle. Si le juge oublie la note globale, c'est le
  maillon faible qui la remplace, jamais la moyenne.
- **Rien n'est cru sur parole.** `normalizeNote` reconstruit champ par
  champ et borne : une note de 47 — déjà vue quand un modèle note sur
  100 — deviendrait une aiguille hors cadran sans que rien ne le signale.
  Les fichiers importés passent par le même normaliseur.
- **La note porte le numéro de sa version** (`pourVersion`). Le juge
  répond après que la version est enregistrée : sans ce numéro, la note
  de la v2 restait affichée au-dessus de la v3 pendant les vingt secondes
  du jugement — un chiffre juste, sur le mauvais prompt.

Elle vit où vit le prompt : dans l'entrée de bibliothèque **et** sur son
tour du fil. Un tour coupé garde le chiffre et perd les six critères —
c'est ce qu'on relit dans un fil ancien (« la v3 valait 8,5, la v4 est
retombée à 6 ») et cela ne pèse rien.

## 22. Une génération s'arrête

Elle dure des dizaines de secondes, enchaîne jusqu'à cinq réparations puis
un jugement. La seule façon de reprendre la main était de recharger la
page — et de perdre ce qui n'était pas encore enregistré.

Le bouton coupe **l'appel réseau en cours**, pas un drapeau que la boucle
regarderait entre deux tentatives : une réparation qui vient de partir
tient encore une minute, et pendant cette minute le bouton n'aurait rien
fait — ce qui se lit comme un bouton cassé. Un même `AbortController` par
départ couvre donc la génération, ses réparations et le juge qui enchaîne.

`Arret` est une erreur À PART, reconnaissable : un arrêt voulu n'est pas
une panne. Il ne s'affiche pas en rouge d'échec, n'invente pas de verdict
de juge, et le tour qu'il laisse au fil est marqué *coupé* — il porte une
ligne d'état, pas un prompt, donc ni copie ni remise en place. Rien n'est
écrasé : la version en place n'a pas bougé, ce que le message dit.

Il est posé **à côté du temps écoulé** : c'est la ligne qu'on regarde
pendant qu'on attend, et c'est là qu'on décide qu'on a assez attendu.

## 23. Trois panneaux, et l'écran de travail en haut

Demandé par Gabriel le 2026-08-02, sur capture : *« le droit montrera
toujours le travail en cours, le centre les résultats du prompt, et le
gauche là où se passent la discussion et les itérations. »*

Le fil était déjà à gauche (§ 20) et le prompt au milieu. Ce qui manquait,
c'est que **l'état du travail se disputait la colonne du prompt** : la
note du juge, le journal des tentatives, la dépense, le chrono et le
verdict étaient empilés AU-DESSUS du prompt, dans la même carte. Lire ce
que valait le prompt chassait donc le prompt de l'écran, et regarder le
prompt cachait la course.

Ils sont séparés : le marbre (centre) ne porte plus que **la pièce et les
gestes qu'on fait dessus** ; l'**épreuve** (droite) porte **tout ce qui se
surveille**. Le nom vient de l'atelier : l'épreuve est la feuille qu'on
tire pour voir ce que vaut le travail avant de le tirer pour de bon.

Quatre choses qui portent le reste :

- **Le seuil est à 1400 px, pas à 1100.** Mesuré : à 1100, trois colonnes
  laissaient au prompt moins de 420 px — moins que la ligne de texte
  qu'il contient. Entre 1100 et 1400, l'épreuve repasse **dans le flux,
  sous le marbre**, et son placement y est explicite (`grid-column: 2`) :
  laissée à l'automatisme de la grille, elle tombait sous le pupitre.
- **Le pupitre couvre les deux rangées** dans cet intervalle
  (`grid-row: 1 / span 2`). Sans cela, sa zone collante s'arrêtait au bas
  du marbre et le fil décollait dès qu'on descendait sur l'épreuve.
- **`height`, pas `max-height`, sur l'épreuve.** À `max-height`, le
  panneau s'arrêtait à la hauteur de son contenu : le liseré et le fond
  mouraient au milieu de l'écran, et le bord droit avait l'air d'une carte
  flottante en face d'un pupitre qui va au bout.
- **La manchette d'accueil s'efface et l'idée se replie en une ligne** dès
  qu'un travail est ouvert — analyse lancée, prompt en cours, prompt
  rappelé de la casse. « Bonjour Gabriel » en 64 px plus six lignes de
  composeur occupaient la première page entière : **le prompt qu'on venait
  de demander naissait sous le pli.** Mesuré au pilotage : il commençait
  au-delà de 800 px, il commence à 245. Le repli seul ne suffit pas — si
  la page est déjà défilée au moment où le travail s'ouvre, on remonte,
  une fois, au basculement.

L'accueil garde sa place au premier écran d'une session, et **sa
description est en français courant** (demandé le même jour) : oracle,
invariants, escalade, sortie verrouillée sont ce que l'atelier ÉCRIT, pas
ce qu'il faut savoir pour s'en servir. Quatre assertions du pilotage
interdisent ces mots dans la manchette.

**Cette décision ne se prouve pas avec `npm run verify`.** Le harnais
force la largeur du document ; les media queries s'évaluent sur le vrai
viewport (§ 18). C'est pourquoi le pilotage Playwright est entré au dépôt
(`npm run pilotage`, `scripts/pilotage.mjs`) au lieu de rester un script
jetable : 77 assertions, 10 paliers de 320 à 1920 px, et le contrôle que
les trois panneaux sont bien sur la MÊME ligne — sans ce contrôle de
l'ordonnée, trois blocs empilés seraient passés au vert.

Trouvé par lui, au passage : deux boutons **« Replier »** dans la même
page — celui de la casse et celui de l'idée. Indistinguables à l'oreille
d'un lecteur d'écran. Le second est devenu « Replier l'idée ».

## 24. L'aide est une donnée, pas une page

Demandé par Gabriel le 2026-08-02 : « une section help qui contient la
totalité de l'app, comment l'utiliser et à quoi chaque section sert, par
chapitre ». Douze chapitres, un par partie de l'écran, plus la méthode et
la sécurité.

Elle est écrite en **données** (`src/aide.js`), pas en balisage. Le motif
n'est pas l'élégance : c'est qu'une aide vieillit en silence. Elle décrit
un produit qui a changé sans elle, et **elle se lit comme vraie** — c'est
pire que pas d'aide. En données, le vérificateur la relit sans navigateur
et prouve ce qui compte :

- Les **huit sections annoncées sont exactement celles qu'impose
  `buildMeta()`**, dans le même ordre. C'est LE contrôle : le jour où le
  méta-prompt bougera, l'aide tombera en rouge au lieu de mentir.
- Le plafond cité est `HARD_LIMIT`, relu depuis le code — un chiffre écrit
  à la main aurait vieilli au premier changement.
- Les douze chapitres attendus sont nommés un par un : ajouter un panneau
  sans son chapitre échoue.
- **Aucun jargon** (`oracle`, `invariant`, `webhook`…) dans la prose : la
  demande était que n'importe qui comprenne, et c'est ce qui se perd le
  plus vite. Les mots du métier sont ce que l'atelier ÉCRIT ; l'aide les
  traduit, elle ne les suppose pas.

Le sommaire n'est pas décoratif : douze chapitres dans un panneau qui
défile, on n'atteint le douzième qu'en passant devant onze. Le pilotage
vérifie que **chaque entrée mène réellement à sa cible** — une ancre morte
ne se voit pas en comptant des éléments.

## 25. Le pied de page, le bouton qui manquait, et ce qui allait avec

Trois demandes du même jour, et trois défauts qu'elles ont fait sortir.

**Le pied de page** porte la mention légale (`© 2026 Gabriel Bertoli —
Atelier Boris®`) et une note de sécurité en clair : où reste la clé, comment
sont gardés les codes, qui voit les prompts. Il vit **hors de la coquille** :
les deux panneaux de bord sont collants et n'ont pas de bas — un pied posé
dans la colonne du milieu aurait été un pied de colonne. Son contenu est
dans `aide.js` avec le reste, donc relu par le vérificateur.

Sur le `®` : il désigne une marque *déposée*. Rien n'indique que « Atelier
Boris » le soit ; c'est la demande de Gabriel, elle est appliquée telle
quelle, et cette ligne existe pour qu'il sache que le symbole n'est pas
anodin s'il diffuse le site hors du cercle familial.

**« Créer un nouveau prompt »** n'avait pas de bouton — le geste le plus
courant de l'atelier. Il fallait rouvrir l'idée, y trouver « Recommencer »,
ou recharger la page. Il est dans la **barre**, parce qu'on peut vouloir
repartir depuis n'importe où. `reset()` seul ne suffisait pas : il fallait
aussi vider l'idée précédente (sans quoi le composeur rouvre sur le texte
d'avant et on croit que rien ne s'est passé), rouvrir la section repliée,
refermer la casse et poser le curseur dans la saisie.

Ce que ces ajouts ont fait tomber, et qui compte autant :

- **La barre ne pouvait plus porter deux boutons de plus.** C'est
  exactement ce qui l'avait fait déborder de 15 px la veille. Ils sont
  dégraissés par paliers AVANT la mesure — « Aide » perd son mot à 900 px,
  « Nouveau prompt » à 700, « Réglages » disparaît à 560 — et ils gardent
  leur signe : un bouton sans libellé reste un bouton, un bouton disparu
  ne l'est plus.
- **Le sigle du compte est devenu un bouton.** Il était décoratif. Sous
  560 px, « Réglages » cède la place et « Sortir » est déjà masqué sous
  640 px : sans ce clic, les réglages **et la déconnexion** devenaient
  inatteignables sur un téléphone.
- **Un bouton sans nom accessible.** Sous 700 px le mot « Nouveau prompt »
  est masqué et le « + » est `aria-hidden` : le bouton n'avait plus aucun
  nom pour un lecteur d'écran. Trouvé par le pilotage, dont le sélecteur ne
  le trouvait plus non plus. Corrigé par `aria-label`.
- **Échap ne fermait rien.** C'est le premier geste qu'on essaie devant un
  panneau modal. Un cran par pression — la feuille d'abord, le tiroir
  ensuite : les fermer tous deux d'un coup ferait disparaître un contexte
  qu'on n'a pas demandé à quitter.
- **La sonde de débordement ne nommait pas le coupable.** « 1 élément trop
  large » dit qu'il y a un défaut sans dire où ; il a fallu deviner deux
  fois avant de trouver `p.pied-legal` (436 px, `flex: none`, donc
  incapable de rétrécir). Elle nomme maintenant le premier fautif et sa
  largeur réelle.

## 26. Tout tient dans l'écran

Mesuré le 2026-08-02 sur un 16 pouces (1728 × 935) avec un prompt de
4 068 caractères : **la page faisait 1 148 px pour 935 visibles — elle
dépassait de 213 px.** Gabriel devait faire défiler pour voir le bas de
son propre atelier.

Les trois quarts n'étaient pas du contenu :

- **96 px de rembourrage** en bas (`pb-24`), hérité d'une page qui
  défilait ;
- **92 px** pour une note de bas de colonne devenue redondante avec le
  pied de page ajouté une heure plus tôt — sa phrase est passée à l'aide,
  chapitre 04, où elle est lue ;
- **110 px de pied de page** là où un bandeau d'une ligne suffit. Un pied
  MENTIONNE, l'aide explique : la note de sécurité complète y prenait
  trois lignes. Elle reste entière dans l'infobulle et au chapitre 12 ;
  le bandeau n'en porte qu'une ligne, qui s'abrège au lieu de se replier.

Le reste était structurel, et c'est le vrai sujet : **trois colonnes
posées côte à côte empilent quand même leur hauteur sur la PAGE.** Elles
ne le doivent pas — un atelier se regarde d'un coup d'œil. La fenêtre est
donc divisée une fois pour toutes (barre + colonnes + pied) et **chaque
colonne défile chez elle**. Le pupitre et l'épreuve le faisaient déjà ;
le marbre s'y met.

Quatre points qui portent le reste :

- **Seulement au-delà de 1400 px**, là où les trois panneaux coexistent.
  En dessous, l'épreuve est empilée sous le marbre : une hauteur figée la
  couperait, et le défilement de page est alors la bonne réponse. Mesuré :
  à 1280 × 720 la page dépasse toujours de 309 px, et c'est voulu.
- **`min-height: 0` sur la coquille** est ce qui fait tenir l'édifice.
  Sans lui, un enfant de flex refuse de descendre sous la hauteur de son
  contenu : la coquille repousse le pied hors de l'écran et on n'a rien
  gagné.
- **La barre cesse d'être collante** au-delà de 1400 px : plus rien ne
  défile au-dessus d'elle, elle n'aurait rien à quoi se coller, et son
  `top: 0` la superposerait au premier enfant.
- **`remonter()` vise deux cibles.** La fenêtre ne défile plus du tout à
  ces largeurs : `window.scrollTo` seul ne faisait donc plus rien
  précisément là où la disposition à trois panneaux existe. Il faut aussi
  remettre le marbre à zéro.

Le contrôle est au pilotage, à cinq tailles d'écran réelles, avec un vrai
prompt : mesurer avec soixante caractères prouverait qu'une page vide
tient dans l'écran. Il vérifie quatre choses par taille — que la page ne
dépasse pas, que le pied est visible sans défiler, que « Copier le
prompt » est atteignable d'emblée, et que **le marbre défile chez lui** :
sans cette dernière, « ça tient » voudrait dire « c'est tronqué ».

---

## 27. Une seconde technique — la boucle du gantelet

L'atelier ne connaissait qu'une méthode. Il en connaît deux, choisies avant
d'écrire, sur deux tuiles au-dessus de l'idée.

**Ce que c'est.** La *gauntlet loop* est une technique de **Matt Shumer**,
écrite en construisant *Claude of Duty*, empaquetée en skill par **Jay E /
RoboNuggets** (`github.com/robonuggets/gauntlet-loop`, **CC BY 4.0**) et reprise
ici en français. L'attribution est une obligation de la licence : elle vit dans
l'en-tête de `src/gauntlet.js` ET dans le chapitre « Les deux techniques » de
l'aide, avec une assertion qui la tient.

**Pourquoi elle n'est pas une variante de Boris.** Les deux répondent à deux
questions différentes, et la différence tient en un mot : *où est la preuve*.
Chez Boris elle est DANS le mandat — l'agent se donne des contrôles et les
rejoue. Au gantelet elle est DEHORS — une chose réelle, déjà bonne, nommée,
qu'un critique va chercher et met à côté du travail **à l'aveugle**. D'où deux
objets qui n'ont rien en commun : huit sections contre sept mouvements, 3 950
caractères contre 170 mots, une escalade contre une victoire.

**Le choix d'architecture, et ce qu'il évite.** Semer des `if (technique ===
…)` dans l'atelier garantissait la panne classique : un chemin oublié qui
applique la règle de l'une au prompt de l'autre, *en silence*. Un vérificateur
qui cherche huit sections dans un prompt de 170 mots dit « à refaire » sans que
rien soit à refaire — et personne ne relit le code pour un verdict qui a l'air
d'un avis. Chaque technique expose donc **le même contrat** (`src/techniques.js`)
et l'atelier ne manipule plus qu'un objet `T` : plus une seule règle de méthode
n'est écrite dans l'écran. Une assertion vérifie que le contrat est rempli des
deux côtés, champ par champ — un champ manquant ne se voit pas au chargement,
il se voit à la génération, une fois l'appel payé.

Conséquences câblées, chacune pour une confusion possible :

- **`generate.js` ne connaît plus aucune méthode** : il reçoit l'oracle, la
  réparation et le choix de la meilleure tentative. Ses défauts restent ceux de
  Boris — il n'en avait qu'une quand il a été écrit.
- **Le choix de la meilleure tentative diffère.** Boris rend la plus COURTE
  parmi celles dont seule la longueur pèche. Au gantelet une tentative peut
  pécher **par le bas** (80 mots, trois mouvements manquants) et « la plus
  courte » choisirait la plus mutilée : on garde la plus proche de la fenêtre.
- **Une limite par technique** (`charLimit` / `charLimitGauntlet`). Un curseur
  partagé aurait fait hériter à l'une le réglage choisi pour l'autre, et un
  réglage hérité est indistinguable, à l'écran, d'un réglage choisi.
- **Aucune clé de critère n'est commune aux deux grilles du juge** (`sortie` et
  `economie` sont devenus `victoire` et `sobriete`). Le juge reconstruit ses
  critères PAR CLÉ : deux homonymes auraient laissé une note de gantelet se
  recomposer à moitié contre la grille de Boris — deux lignes justes, quatre
  vides, et rien pour le dire.
- **La technique suit l'entrée de bibliothèque**, et rouvrir un prompt bascule
  l'atelier dessus. Sans cela, un prompt de gantelet rouvert sous Boris se
  voyait mesurer contre huit sections absentes : pastille rouge et note « à
  refaire » sur un prompt parfaitement valide.
- **Le choix se verrouille dès qu'un prompt est au marbre.** Changer de
  technique sous un prompt existant le ferait juger et corriger avec les règles
  de l'autre, sans que rien ne le dise. « Nouveau prompt » rouvre le choix.
- **Tout le texte d'écran vient de la technique** — bandeau, accroche, exemples
  des champs vides, titre de l'étape 1. Laissés en dur, ils proposaient une app
  d'échecs et citaient « TON PRODUIT » à quelqu'un venu écrire une page de
  tarifs jugée contre Stripe : un exemple hors sujet se lit comme « tu t'es
  trompé d'outil ».

**L'oracle du gantelet.** Il compte en MOTS (110–210, visée 140–190) parce que
c'est l'unité de la technique, mais garde un plafond en caractères comme Boris,
parce que c'est ce que toute la plomberie mesure et enregistre. Il refuse, une
assertion par faute que la technique nomme comme mortelle : barre absente,
comparaison à l'aveugle retirée, critique sans contexte neuf, `/loop` ou
`ultracode` manquants, **nombre de tours fixé** (on sort en gagnant, jamais en
comptant), titres ou puces. Deux détails mesurés : les fautes de longueur
commencent toutes par « longueur » — c'est à ce préfixe que le choix de la
meilleure tentative reconnaît une faute réparable ; et les apostrophes
typographiques sont normalisées avant recherche, sinon « l’aveugle » fait
échouer une assertion qui a pourtant raison.

**Ce qui a été éprouvé.** 43 assertions nouvelles, dont un aller-retour réel
contre `api.anthropic.com` : Sonnet 5, ce méta-prompt, cet oracle — 188 mots au
vert **du premier coup**. Un vérificateur trop strict ne se voit pas sur un
texte écrit à la main pour lui plaire. L'exemple de référence passe son propre
vérificateur (une assertion le tient), et les deux oracles sont prouvés NON
interchangeables : celui de Boris rejette un prompt de gantelet, et l'inverse.

**Langue et cible, tranchées avec Gabriel** : le prompt sort en **français**
comme le reste de l'atelier, et garde `/loop` + `ultracode` — la forme Claude
Code, la plus forte, et celle des agents qu'il lance. Le skill d'origine décrit
la variante portable ; elle est documentée dans l'aide, pas produite.

---

## 28. Le juge reprochait ce qu'on ne pouvait plus corriger

Signalé par Gabriel le 2026-08-23, écran large : le juge liste trois failles, et
**aucun moyen de lancer la v2**. Le bouton « Appliquer l'audit → v2 » était
pourtant dans le DOM.

**Ce n'était pas un bouton manquant, c'était un panneau qui ne défilait pas.**
Mesuré à 1800 × 1000 : rangée de 801 px, colonne de droite de **988** — elle
débordait sa rangée de 187 px, hors de la coquille qui coupe. Son corps valait
donc exactement son contenu (`scrollHeight === clientHeight === 897`),
`overflow-y: auto` ne produisait aucune barre, et le bouton avait son bas à
**1018 px pour une fenêtre de 913** : présent, atteignable au clavier,
inatteignable à la souris.

**La cause, en une ligne de CSS absente.** Un élément de grille vaut
`min-height: auto` par défaut : il refuse de descendre sous la hauteur de son
contenu, et cette valeur l'emporte sur le `height: 100%` écrit juste en dessous.
`.pupitre` et `.epreuve` n'avaient pas leur `min-height: 0` — le pendant exact
de celui que § 26 avait posé sur la coquille, et pour la même raison. Le corps
de l'épreuve manquait en plus son `flex: 1`, que le pupitre avait : sans lui,
« défile chez elle » ne veut rien dire, le corps se dimensionnant sur son
contenu. Les deux sont corrigées ; les deux sont ANTÉRIEURES à la boucle du
gantelet (vérifié sur le commit `2368eeb`). Ce n'est pas une régression du
2026-08-23, c'est un défaut latent que la longueur d'un audit a réveillé.

**Pourquoi rien ne l'avait dit.** Le palier au-delà de 1400 px n'était éprouvé
par AUCUN instrument automatique : le harnais force la largeur du document et
les media queries s'évaluent sur le vrai viewport (§ 18), le pilotage demande
Playwright, absent de la machine. C'est très exactement la dette écrite dans
`ETAT.md` au déploiement du matin, et elle s'est présentée le jour même.

**§ 18 est à moitié faux, et c'est la vraie trouvaille.** `--window-size` EST
honoré par ce Chrome headless — vérifié : une fenêtre de 1800 px rend bel et
bien la disposition à trois panneaux. Ce qui est vrai de la SONDE de
débordement (elle force `documentElement.style.width`, donc n'exerce aucun
palier) ne l'est pas de Chrome. Le harnais peut donc ouvrir une vraie grande
fenêtre, et il le fait maintenant.

**Quatrième surface : « trois panneaux (1800 px) ».** Sonde de débordement
désactivée — la forcer à 320 px détruirait la disposition qu'on vient éprouver
— et la surface mesure elle-même, sur une colonne chargée comme la vie la
charge (cassetin rouvert, six critères dépliés). Cinq assertions, dont les deux
qui portent : la colonne ne déborde pas sa rangée, et son corps est BORNÉ.
Vérifié qu'elles mordent : le correctif retiré, elles passent au rouge en
nommant les chiffres (« épreuve 892 px pour une rangée de 801 »).

**Ce qui reste vrai malgré tout :** ce harnais mesure des hauteurs, il ne
clique pas. Le pilotage Playwright reste le seul à prouver un parcours au clic,
et il reste à installer.

---

## 29. Le gantelet passe à 2500 caractères — et pourquoi le plafond seul n'aurait rien fait

Demandé par Gabriel le 2026-08-26 : « que le générateur de prompt ne soit plus
limité à 1300 caractères mais plutôt à 2500 ». Il s'agit bien de la **boucle du
gantelet**, pas de la méthode Boris, qui est à 3900 depuis § 19.

**Le piège, et c'est tout l'arbitrage : la longueur du gantelet ne se décide pas
en caractères.** La technique compte en MOTS — c'est sa règle, § 27 — et le
plafond en caractères n'est là que parce que c'est ce que toute la plomberie de
l'atelier mesure et enregistre. Monter le seul réglage à 2500 aurait donné
exactement ceci : le curseur affiche 2500, le méta-prompt continue de demander
« 140 à 190 mots », le modèle continue de rendre ~1 100 caractères, et si par
accident il en rendait 2500, `verifyPrompt` le REFUSERAIT pour excès de mots et
le ferait réécrire plus court. Un curseur qui monte sans effet visible, avec un
vérificateur qui ramène en silence : la panne la plus chère à diagnostiquer,
parce que rien n'est en rouge.

**Les deux comptes montent donc ensemble, du même facteur (×1,92).** Visée
140–190 → **290–380 mots**, fourchette acceptée 110–210 → **230–420**, réglage
par défaut 1300 → **2500**, plafond dur 1600 → **3000** (sous les 3950 de Boris :
les deux techniques restent d'ordres de grandeur différents). Le rapport mesuré
sur l'exemple de référence est de **5,7 caractères par mot** dans ce français-là,
ce qui met le haut de la visée à ~2 170 caractères et le haut de la fourchette à
~2 400 : **c'est la fourchette de mots qui mord en premier, jamais le plafond**,
exactement comme avant.

**`LIMITE_MIN` monte aussi, 800 → 1700, et ce n'est pas de l'hygiène.** Sous
1700 caractères, le BAS de la fenêtre de mots (290 mots ≈ 1 650 car.) ne tient
plus : le curseur proposerait un réglage où chaque génération échouerait sur la
longueur, sans qu'aucun écran ne le dise. Conséquence sur les réglages
enregistrés : une valeur d'avant vaut 1300, donc **sous le nouveau plancher**, et
`capLimit` la remonterait au PLANCHER (1700) — un réglage que personne n'a
choisi et trop serré pour la fenêtre. `loadSettings` traite donc une valeur sous
le plancher comme « écrite par une version antérieure » et rend le défaut, même
migration que celle du 3000 → 3900 de Boris.

**L'exemple de référence a été réécrit, il le devait.** Il est passé à son
propre vérificateur par une assertion (§ 27) : laissé à 186 mots, il aurait
échoué au premier `npm run verify` — et surtout, montré au modèle comme cible de
forme et de densité, il lui aurait appris la longueur qu'on venait d'abandonner.
Il fait 347 mots pour 1 973 caractères, mêmes sept mouvements, rien de gonflé :
ce qui a été ajouté est du contenu que la version courte laissait implicite
(aller chercher la vraie page soi-même, la moitié mesurable, pourquoi le critique
ne rend qu'UN manque).

**Quatre chiffres écrits à la main ont été supprimés au passage, et c'est la
leçon récurrente de ce dépôt.** « environ 170 mots » dans l'aide (deux fois),
« un prompt court, autour de 170 mots » dans `techniques.js`, la fenêtre
`140 && 190` de l'assertion sur l'exemple, les bornes `110 && 210` de
l'assertion sur le prompt réellement généré, et les trois tentatives factices
du choix de la meilleure. Tous auraient survécu au changement **en vert**, en
mesurant la fenêtre d'avant : une assertion verte pour une règle que le code
n'applique plus est pire qu'une assertion absente. Ils se déduisent désormais de
`gauntlet.VISEE` / `MOTS_MIN` / `MOTS_MAX`, source unique.

**La licence.** CC BY 4.0 autorise l'adaptation et impose de la SIGNALER : le
skill de Matt Shumer prescrit 120 à 180 mots, l'atelier n'en produit plus autant.
C'est écrit dans `gauntlet.js` et, surtout, dans l'aide que l'utilisateur lit.

**Vérifié :** `npm run verify` — **290 assertions au vert**, appel Anthropic réel
compris. Le générateur a rendu un prompt de gantelet de **369 mots / 2 128
caractères du premier coup**, oracle au vert, sans réparation.

---

## 30. Une troisième technique — la pile de crochets

Demande de Gabriel le 2026-09-04 : analyser la « nouvelle méthode » annoncée
par ClaudeDevs et en tirer une technique pour l'atelier.

**Ce que c'est, mesuré aux sources.** Le post (x.com/ClaudeDevs, 2026-09-03)
annonce *Function Hooks* : une **proposition** d'Anthropic, **non livrée**, mise
en discussion sur `anthropics/claude-code#91870` (Alice Poteat, *Function
Hooks: Core Architecture*, 8 pages). Ce n'est pas une méthode de prompt : c'est
une architecture de plugin. Des crochets TypeScript `($, e, next)` façon
Koa/Express ; `$` est le monde — tout ce qu'un plugin peut voir ou faire, et
**rien d'ambiant** ; un événement est une méthode de `$` (`tool.call`,
`fs.write`, `ui.render`) ; **l'ordre d'enregistrement est l'emboîtement** (le
premier enveloppe les autres, les admins mettent leurs contrôles en tête) ;
cinq placements (avant, après, pendant, à la place, modifiant) ; un
administrateur **retire des capacités de `$`** et rien en dessous ne peut les
invoquer ; un crochet sur `*` voit tout et fait un journal d'audit en une
fonction. La doc officielle des hooks (code.claude.com/docs/en/hooks) décrit
les hooks *actuels* — command, prompt, agent, http, sur une trentaine
d'événements — que la proposition complète d'un cinquième type.

**Pourquoi c'est une technique de prompt malgré tout.** Le fil de l'issue le
dit mieux que la proposition : « une prohibition exprimée en prose tient la
plupart du temps et lâche exactement quand les enjeux sont les plus hauts ;
une contrainte mécanique tient ». Et : des hooks shell qui « ne peuvent pas
échouer » rendent un journal muet — « ran and worked » indiscernable de « ran
and silently did nothing ». Transposé à un mandat d'agent, ça donne trois
règles que ni Boris ni le gantelet n'imposent : l'interdit est une **absence**
du monde, pas une consigne ; chaque règle est **accrochée à un geste nommé**
avec un placement ; **l'ordre est une autorité**, et le journal est en tête.

**La forme retenue** (`src/crochets.js`) : cinq sections `# LE MONDE`,
`# RETIRÉ`, `# CROCHETS`, `# LE FOND`, `# SORTIE`. Les crochets tiennent sur
une ligne : « N. sur <événement> {filtre} — <placement> : <décision> », de 3 à
8, `sur *` **en premier**, `sur session.stop` obligatoire, au moins un « à la
place ». Dernière ligne « Sinon la chaîne continue. » — pas celle de Boris, pour
que les deux oracles ne se confondent jamais. Longueur en caractères, plafond
dur commun 3 950, défaut 3 000, fenêtre 73–90 % comme Boris.

**Ce qui a été évité, un piège par assertion :**

- **L'oracle de Boris ACCEPTE un prompt de crochets** (il ne teste que la
  première section et « # SORTIE »). Ce n'est pas un défaut à corriger, c'est
  la raison pour laquelle la technique doit suivre l'entrée de bibliothèque —
  déjà câblé au § 27, et l'assertion le dit désormais dans ce sens.
- **Les tirets.** Un modèle rend « — », « – » ou « - » ; un vérificateur qui
  n'accepte que le cadratin refuse un prompt juste. Les trois sont normalisés
  avant lecture, mais **jamais en tête de ligne**, où « - » est une puce du
  retrait.
- **La réparation par défaut parle de huit sections** : elle est propre à la
  technique, et une assertion vérifie qu'elle dit « cinq » et nomme les cinq
  placements.
- **Étape 1 sans troisième branche d'écran** : les crochets posent des
  questions comme Boris (`cle: "questions"`), mais sur le monde et le
  retrait. Rien n'a bougé dans `App.jsx` hors la case de réglage
  (`charLimitHooks`) et la phrase sous le curseur.
- **Grilles du juge disjointes deux à deux** (l'assertion à deux termes
  Boris/gantelet est devenue un ensemble sur les trois).

**Éprouvé.** `npm run verify` : **341 assertions**, dont deux appels réels à
Sonnet 5 avec ce méta-prompt — 2 657 caractères en deux tentatives, puis 2 958
du premier coup, 7 crochets, `sur *` en premier, `session.stop` retenu, le
remboursement retiré comme l'idée le demandait. L'oracle est tenable par un
modèle réel.

**Attribution.** Pas de licence en jeu — c'est une idée d'architecture, pas un
texte repris — mais la source est citée dans l'en-tête du fichier, dans
l'aide (assertion : « Function Hooks » et « 91870 »), et ici.

**Atelier-Cartes.** La même technique est rejouée en Python dans
`Atelier-Cartes/techniques/verifier.py crochets` (33 cas au test de l'oracle),
documentée dans `techniques/crochets.md`, et la carte de la tour Dev propose
désormais BORIS, GANTELET ou CROCHETS (prompt 3 822, ligne 3 923/3990).


---

## 31. Une quatrième technique — la méthode Opus 5.5

Demande de Gabriel le 2026-09-23 : analyser le guide d'Anthropic *Getting the
most out of Opus 5.5 in Claude and Claude Code* (Addy Osmani, claude.dev,
2026-09-22) et en tirer une méthode, en s'inspirant de Boris et du gantelet.
Analyse d'abord, validée par lui avant d'écrire ; forme choisie par lui :
**prose courte** ; périmètre choisi par lui : **la méthode + Opus 5.5 au
sélecteur de modèles**, sans toucher aux trois autres méthodes.

**Ce que le guide dit d'écrire, et pourquoi le modèle le demande.** La tâche
entière en un message, avec une ligne d'arrivée (« done means : the tests
pass ») — 5.5 tient mieux le long travail en plusieurs étapes. Les arrêts
**nommés** : c'est le comportement nouveau, 5.5 s'arrête parfois pour rendre
compte (résumé qui nomme l'étape suivante sans la faire, « je continue ? »,
choix non bloquants), et il suit une consigne qui nomme ces arrêts. Retirer
« think carefully » : il pense avant chaque réponse. Ne jamais demander de
reproduire le raisonnement : c'est une catégorie de signalement. Puis des
conseils par type : styles exclus **nommés** pour le design, sous-agents dont
on vérifie les preuves + un tableau pour un audit, liste de tâches dans un
fichier pour un long run, « bloquer la fusion » pour une revue, « marque ce
que tu n'as pas pu confirmer » pour une recherche, relecture des
contradictions pour un long document, livrable fini plutôt qu'un plan, et un
compte rendu qui commence par ce qui attend l'humain.

**La forme retenue** (`src/opus55.js`) : cinq mouvements en prose, sans titre
ni puce — la tâche entière et son livrable fini ; « Fini veut dire : » et des
critères observables ; la règle d'arrêt reprise mot pour mot (« Quand une
étape n'a pas besoin de moi, continue… » puis « Arrête-toi et demande-moi
seulement si… » avec les gestes destructeurs du domaine nommés) ; les clauses
du type, seulement celles qui s'appliquent ; dernière ligne « Termine par
trois titres : Bloqué sur moi, Changé, Trouvé. ». Longueur en **mots** (leçon
du § 29) : visée 150–240, fourchette 110–300, défaut 2 200 car., plancher
1 600, plafond dur 2 600. Étape 1 à la forme `questions` (aucune branche dans
l'écran) : deux questions au plus, seulement sur l'arrivée ou l'objet du
travail ; le type de tâche, les clauses et les styles se tranchent sans
demander.

**Une contradiction assumée.** Boris (critère `economie`) et les crochets
(critère `fermeture`) interdisent « ne t'arrête pas » comme correction de
comportement devenue native. Pour 5.5, le guide dit l'inverse sur ce seul
point. La nouvelle méthode ne partage donc aucune règle avec `meta.js`, et
les deux autres grilles n'ont **pas** été retouchées — choix de Gabriel.

**Les pièges évités, un par assertion :**

- **`\b` ne voit pas de frontière devant « é »** : « étape par étape »
  passait sous le filtre anti-« réfléchis ». Les bornes sont des gardes
  Unicode (`(?<!\p{L})`), et l'assertion provoque la faute. Inversement, la
  règle d'arrêt contient « une étape » : une assertion vérifie qu'elle n'est
  pas prise pour une consigne de réflexion.
- **L'espace fine insécable** que la typographie française met devant « : »
  ferait échouer « Fini veut dire : » : normalisée avant lecture.
- **Opus 5.5 refuse `thinking: disabled` (400)**, comme Fable ; `api.js`
  l'envoyait à tout ce qui n'était pas Fable/Mythos. Et sa réflexion se
  compte **dans** `max_tokens` : avec les 1 200 jetons de l'étape 1, il aurait
  tout pensé avant d'écrire l'accolade, et l'atelier aurait dit « réponse
  coupée ». Les modèles qui pensent toujours (`PENSE_TOUJOURS`) n'ont plus de
  réglage de réflexion et reçoivent 16 000 jetons de marge — non facturés,
  seuls les jetons produits le sont. Assertion sur le corps réellement envoyé
  (fetch intercepté), pour 5.5 et pour Sonnet 5 qui garde l'ancien comportement.
- **Le tarif** : 4 $ / 20 $ le million, lecture en cache à 0,20 $ — le
  vingtième, pas le dixième que `costOf` supposait. Champ `cache` par modèle.
- Grilles du juge disjointes deux à deux sur les quatre ; les quatre oracles
  se rejettent mutuellement leurs exemples de référence.

**Éprouvé au banc — et c'est le banc qui a écrit la moitié de la méthode.**
Demande de Gabriel en cours de route : « un juge LLM en effort max avec Opus
5.5 pour s'assurer que le prompt respecte à 100 % la nouvelle méthode », avec
des utilisateurs bidon pour vérifier les questions. `scripts/banc-opus55.mjs`
(`npm run banc`) : huit utilisateurs fictifs (migration à l'arrivée donnée,
idée vague « améliore mon site », landing page, recherche comparative, revue
de PR, renommage, tableur à partir d'une liste, idée piégée « réfléchis étape
par étape et montre ton raisonnement »), le vrai circuit (étape 1 → réponses
d'un utilisateur simulé qui ne sait que ce qu'on lui a donné → étape 2 sous
oracle), puis Opus 5.5 en effort `max` qui lit le guide relu à la source et
rend, règle par règle, conformité et justesse des questions.

| tour | rédacteur | conformes à 100 % | questions justes | notes | moyenne |
|---|---|---|---|---|---|
| 1 | Sonnet 5 | 0/8 | 6/8 | 5–8,5 | 6,7 |
| 3 | Sonnet 5 | 0/8 | 7/8 | 6–8 | 6,8 |
| 4 | Sonnet 5 | 2/8 | 5/8 | 4,5–9,5 | 7,5 |
| 4 | **Opus 5.5** | 3/8 | 8/8 | 7,5–10 | 8,8 |
| 7 (×2) | Opus 5.5 | 4/8 et 5/8 | 16/16 | 7,5–10 | 9,1 |
| 8 (×2, coupé) | Opus 5.5 | 6/6 jugés | 6/6 | 9,5–10 | 9,7 |

L'oracle déclarait VERTS les huit prompts du premier tour ; le juge les
trouvait tous non conformes. Ce que l'oracle ne peut pas voir, et que le banc
a trouvé, a été corrigé tour après tour :

- **L'exemple se recopie.** Un exemple nu (une migration) a été recopié jusque
  dans une revue de PR : son arrêt « si un test échoue… », ses gestes
  destructeurs, son critère de bout en bout. Remède : **deux** exemples de
  types différents, montrés **avec l'idée d'où ils viennent**, sans arrêt
  propre ni critère que leur idée ne justifie pas.
- **La phrase d'arrêt est devenue FIXE** (`ARRET`), vérifiée à la lettre : la
  règle écrite « n'ajoute un arrêt propre que si l'idée le demande » a été
  contournée trois tours de suite. Un arrêt demandé s'écrit à part
  (« Arrête-toi aussi… »). Une phrase fixe se vérifie ; une règle se contourne.
- **L'arrivée infidèle** : critères inventés (tri, message de confirmation,
  « sans warning », recommandation), portée rétrécie (« la page d'accueil »
  pour « chaque page »), mots de jugement (« correctement », « lisible »,
  « clair » — désormais refusés à l'oracle, `FLOU`), un seul bord tenu
  (dédoublonner sans dire que rien ne se perd). Règles de fidélité dans le
  méta-prompt, et une **relecture avant de rendre** (`RELECTURE`) — le geste
  que le guide recommande lui-même, sans aucune consigne de réflexion.
- **« Améliore… »** recopié de l'idée alors que les réponses disaient quoi
  faire : refusé à l'oracle (`VERBE_FLOU`).
- **Gestes destructeurs** : la base du guide (supprimer des données, forcer
  un push, toucher hors du périmètre), puis ceux du domaine. Une première
  version disait « supprimer ou écraser des fichiers » : elle bloquait la
  suppression de l'ancien client que l'arrivée exigeait. Dans un dépôt
  versionné, modifier un fichier se défait.
- **Les questions** : le framework (qui se lit dans le dépôt), le nombre de
  formules tarifaires (contenu provisoire), l'accès, « sur quoi se
  concentrer » étaient demandés à tort ; la question de l'arrivée manquait sur
  l'idée vague. Étape 1 réécrite autour d'un test : si « je ne sais pas,
  tranche » serait une réponse acceptable, la question est superflue.
- **Le plancher de mots** poussait les tâches simples au remplissage : visée
  descendue de 150–240 à 120–230 mots.

**Décision : la méthode écrit avec Opus 5.5, quel que soit le réglage.** Le
tableau le dit : à règles égales, Sonnet 5 plafonne vers 7,5 et pose une
question superflue sur trois ; Opus 5.5 ne s'est plus trompé de question.
Champ `redacteur` au contrat des techniques (le seul qui l'impose), lu par
l'écran à la place de « Produit le prompt », dit dans les réglages. Le juge
par défaut (Opus 5) reste un autre modèle ; l'avertissement « juge = modèle
qui a produit » compare désormais au rédacteur effectif.

**Relecture indépendante du diff** (un agent séparé, sans appel payant) :
un vrai défaut — la phrase sous le curseur de limite était un ternaire
Boris / gantelet / « le reste », et la méthode Opus 5.5 y recevait le texte
des crochets ; elle est désormais un champ `noteLimite` de chaque technique,
tenu par l'assertion du contrat. Et quatre cas limites de l'oracle, chacun
désormais provoqué par une assertion : l'arrivée lue jusqu'à la fin de la
LIGNE (un prompt sans saut de paragraphe prenait « son propre sous-agent »
pour un critère flou) ; « écris un guide pas à pas » refusé comme consigne
de réflexion ; le geste destructeur « trouvé » dans le mot « destructeur »
de la phrase fixe elle-même (vérification qui ne pouvait pas échouer) ;
« décris ton raisonnement » non vu, Unicode décomposé et trait d'union
insécable non normalisés.

**Coupé par le crédit.** Le huitième tour s'est arrêté sur « credit balance
is too low » : la clé de test est **la même** que la clé partagée de
l'atelier (vérifié par égalité, sans l'afficher). L'atelier ne génère donc
plus avec sa propre clé tant que le crédit n'est pas rechargé. Escalade à
Gabriel ; aucun appel payant n'a été relancé. Le banc coûte surtout par le
juge en effort max (huit longs appels par tour, onze tours joués).

---

## 32. Les tarifs, relus à la source

Demande de Gabriel le 2026-09-23 : facturer avec les derniers coûts de l'API
pour tous les modèles. Relus sur la page officielle
(platform.claude.com/docs/en/about-claude/pricing) le jour même.

- **Sonnet 5 était compté 3 $ / 15 $ ; il coûte 2 $ / 10 $.** C'est le
  rédacteur par défaut : le compteur surestimait d'environ moitié la plupart
  des générations. Opus 5, Fable 5, Haiku 4.5 et Opus 5.5 étaient justes sur
  l'entrée et la sortie.
- **Le cache était faux dans les deux sens** : lecture supposée au dixième de
  l'entrée (Opus 5.5 lit au vingtième), écriture comptée au prix de l'entrée
  (elle coûte 1,25 fois pour 5 minutes, 2 fois pour 1 heure). `PRICES` porte
  désormais les quatre prix par modèle, et `costOf` ventile l'écriture par
  durée quand l'API la détaille (`cache_creation.ephemeral_1h_input_tokens`).
  L'atelier ne pose pas encore de `cache_control` : c'est aujourd'hui sans
  effet, et juste le jour où il en posera.
- Assertions : chaque modèle proposé a ses quatre prix (sinon il coûterait
  « 0 $ » en silence), les écritures suivent 1,25× et 2× l'entrée, et trois
  calculs témoins.
- **Ce qui n'est pas rattrapable** : les totaux « dépense à date » déjà
  enregistrés ont été cumulés à l'ancien tarif. Seul le total est conservé,
  pas le détail par modèle : il ne peut pas être recalculé. Il cesse de
  dériver à partir de maintenant.
- Non modélisés : les remises (lot, lancement) et le mode rapide.

---

## 33. Tout en Opus 5.5, un effort par rôle — et le juge en contexte neuf

Demande de Gabriel le 2026-09-23 : « que tous les modèles soient en Opus
5.5 avec le bon effort, ainsi que le juge ». Le choix des modèles disparaît
des réglages ; il est affiché, pas caché (`MODELE`, `ROLES` dans `meta.js`).

**Les efforts.** Opus 5.5 n'a pas d'autre réglage de profondeur (il refuse
`thinking: disabled`) et son défaut est `medium`. Questions : `medium` — un
JSON de deux lignes. Rédaction : `high` — c'est là que la fidélité se gagne,
le banc du § 31 l'a montré. Juge : `high` — il tourne après chaque version
et l'écran l'attend ; `max` reste au banc, où la lenteur ne coûte rien.
L'effort part dans `output_config.effort` (assertion sur le corps envoyé).

**La règle qu'il a fallu déplacer.** « Le juge n'est jamais le modèle qui a
produit — angles morts corrélés » ne peut plus tenir par le modèle. Elle
tient désormais par le CONTEXTE : le juge ne reçoit plus la conversation où
il a écrit le prompt (tentatives, réparations, et le fait d'en être
l'auteur), mais un message neuf — la méthode et l'idée, les précisions de
l'utilisateur (réponses, barre, corrections demandées), puis le prompt
présenté comme l'œuvre d'un autre (`contexteNeuf`). C'est la règle du
critique « au contexte neuf » du gantelet, appliquée à l'atelier lui-même.
Six assertions la tiennent. Ce qu'elle ne rend pas : un second modèle aux
angles morts différents — c'est le prix du choix, et il est écrit ici.

**Le silence.** À effort `high`, Opus 5.5 pense avant son premier mot, sans
rien afficher : le délai de silence toléré passe de 60 s à 150 s pour les
modèles qui pensent toujours (`STALL_MS_PENSEUR`) ; le plafond absolu de
300 s ne bouge pas.

**Ce qui disparaît.** Le champ `redacteur` du § 31 (plus rien à imposer
quand tout est Opus 5.5), les sélecteurs de modèle, l'avertissement « juge =
rédacteur ». Les réglages enregistrés avec `writer` / `judge` sont lus sans
erreur, ces deux clés ignorées. `PRICES` garde les cinq modèles : le
compteur reste juste si un modèle revient.

**Non éprouvé en réel** : le crédit Anthropic est épuisé. Le corps envoyé
est vérifié (effort, pas de réglage de réflexion, marge de jetons), les
générations réelles du harnais passent désormais par Opus 5.5 + effort
`high` — elles tourneront à la recharge.

---

## 34. Abonnement d'abord : aucun agent ne dépense la clé API sans qu'on le demande

Le 2026-09-23, le banc du § 31 a vidé le crédit prépayé de la clé du `.env`
— qui est aussi la clé partagée du site. Gabriel est en abonnement Max ; il
n'attendait aucune dépense d'API. Sa consigne : « que n'importe quelle carte,
si je ne le spécifie pas, utilise mon abonnement et pas ma clé API ».

**Constaté d'abord :** aucune session ni aucune carte ne tournait sur une clé
— ni variable d'environnement, ni profil shell, ni réglage Claude Code, ni
`env` sur les 31 cartes de la tour. Ce qui dépense une clé, ce sont les
SCRIPTS qu'un agent lance et qui la lisent dans un fichier. La règle vise
donc les agents, là où tous la lisent : `~/.claude/CLAUDE.md` (après le bloc
oh-my-claudecode, qui se régénère), le `CLAUDE.md` racine de `L'Oreal`, et
`~/.codex/AGENTS.md`.

**Et dans ce dépôt, elle est câblée :**
- `npm run banc` ne connaît plus de clé : chaque appel est un `claude -p`
  isolé (aucun outil, skill, MCP ni réglage ; dossier vide ; prompt système
  neutre ; aucune variable `ANTHROPIC_*` transmise). Mesuré : 491 jetons de
  contexte au lieu de 75 000 sans isolation. Jamais `--bare`, qui ignore
  l'abonnement. Un cas complet (juge en effort `low`) : 0,26 $ d'équivalent
  API, pris sur le forfait.
- `npm run verify` ne lit plus la clé d'office : ses générations réelles
  demandent `VERIFY_API=1`.
- Le site, lui, garde sa clé — il appelle l'API depuis le navigateur pour ses
  utilisateurs, et un abonnement Max ne peut pas servir une application à des
  tiers. Quand elle est à sec, l'écran le dit en français et indique le geste
  (coller sa propre clé), au lieu de l'erreur brute de l'API.

---

## Reste à la main de Gabriel

- **Le crédit de la clé partagée de l'atelier** est épuisé depuis le
  2026-09-23 (banc Opus 5.5) et Gabriel ne peut pas le recharger pour
  l'instant : le site ne génère qu'avec la clé personnelle d'un visiteur,
  collée dans Réglages. Recharger (platform.claude.com → Billing) rétablit
  la clé commune.
- Vérifier un domaine d'envoi chez Resend, pour que le lien de
  réinitialisation parte vers de vraies adresses.
- Valider le déploiement en production (déposé, jamais promu par l'agent).
