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

---

## Reste à la main de Gabriel

- Vérifier un domaine d'envoi chez Resend, pour que le lien de
  réinitialisation parte vers de vraies adresses.
- Valider le déploiement en production (déposé, jamais promu par l'agent).
