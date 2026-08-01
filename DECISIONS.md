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

---

## Reste à la main de Gabriel

- Vérifier un domaine d'envoi chez Resend, pour que le lien de
  réinitialisation parte vers de vraies adresses.
- Valider le déploiement en production (déposé, jamais promu par l'agent).
