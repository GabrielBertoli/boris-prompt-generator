# État du run

**EN PRODUCTION** — https://boris-prompt-generator.vercel.app
Promue par Gabriel le 2026-08-01, vérificateur intégralement au vert sur
l'alias stable.

Mis à jour le 2026-08-01. L'état vit ici : une coupure se reprend en lisant
ce fichier, pas en refaisant le chemin.

## Dernière vérification — 2026-08-01, 11:55 puis 14:38, commit `3f25393`

**43 assertions au vert, deux passes séparées de trois heures**, sur
`https://boris-prompt-generator.vercel.app` — la production elle-même, pas
une preview. Y compris ce qu'apportait le dernier commit : compteur de
dépense (crédité, relu, delta absurde refusé, fermé sans session) et limite
3900 — premier jet à 3737 puis 3663 caractères, aucune réparation
nécessaire ni l'une ni l'autre fois. C'est la mesure qui justifiait le
passage à 3900, reproduite.

Ce que sert la production a été comparé au build local, pas supposé : le
JavaScript est **byte-identique** (SHA-256 `5276815a…`), la feuille de style
est un surensemble de deux utilitaires inemployés — la construction distante
balaie un fichier de plus que la locale. Rien ne manque en ligne.

Contrôlé au passage : protection SSO bien désactivée (l'atelier est servi,
pas le mur Vercel) ; `SESSION_SECRET`, `ANTHROPIC_SHARED_KEY` et les cinq
variables KV présents sur les trois environnements ; `/api/reset` répond
franchement que l'envoi n'est pas câblé, conformément à la décision.

## Où ça en est

Le produit est écrit, construit, déployé en preview. Le vérificateur passe
sur tout ce qui ne dépend pas des deux fournisseurs.

| Parcours | État | Preuve |
|---|---|---|
| Prénom choisi | ✅ | cinq prénoms servis par `/api/session` |
| Mauvais code refusé | ✅ | 401, aucun cookie posé |
| Bon code retenu | ✅ | 200, cookie `HttpOnly` + `Secure` |
| Code changé | ✅ | aller-retour `2000G` → provisoire → `2000G` |
| Code oublié → mail | ⛔ **décidé** | pas d'envoi pour l'instant (voir ci-dessous) |
| Réglages | ✅ | clé, modèles, limite (défaut 3900) — navigateur |
| Clé de l'atelier | ✅ | servie à la session, refusée au portail, absente du bundle |
| Idée sans question | ✅ | analyse renvoie `{"questions":[]}` → génère |
| Idée ambiguë | ✅ | jusqu'à 3 questions matérielles |
| Génération trop longue réparée | ✅ | 3691 → 3137 → 2829 pour une limite de 3000 |
| Audit appliqué en v2 | ✅ | juge Opus 5, corrections réinjectées |
| Sauvegarde puis rechargement | ✅ | écrit, relu, supprimé ; 401 sans session |
| Mobile | ✅ | zéro débordement mesuré à 320, 360, 390 et 430 px |

Production : `https://boris-prompt-generator.vercel.app` (alias stable).
Dernière preview : `https://boris-prompt-generator-3alg21uey-coe-startup.vercel.app`

Comptes en place : Gabriel `1966G`, Karl `1994K`, Raphaëlle `2000R`,
Gabriela `2000G`, Cécile `1998C` — les cinq vérifiés en production, bon
code accepté et mauvais refusé.
Aucun mail enregistré : c'est à chacun de poser le sien depuis Réglages.

Ajouter quelqu'un = trois endroits, plus la graine :
`api/_lib/http.js` (USERS, qui fait foi), `src/Gate.jsx` (repli si l'accès
ne répond pas), `scripts/verify.mjs` (liste attendue, nommée et non comptée),
puis `node scripts/seed.mjs <id>=<code>`.

Protection SSO désactivée sur le projet — sinon Karl, Raphaëlle et Gabriela
se heurteraient au mur Vercel avant même la porte d'entrée. **Elle se
remet à chaque déploiement : la redésactiver après chaque `vercel deploy`.**

## La clé de l'atelier

Une clé Anthropic commune (`ANTHROPIC_SHARED_KEY`, variable Vercel) évite
que chacun ait à en poser une. Elle est servie par `/api/session` **à une
session valide uniquement** : jamais au portail, jamais dans le bundle,
jamais gardée dans `localStorage` — une sortie l'emporte. L'appel part
toujours en direct du navigateur ; aucune fonction ne relaie.

Conséquence assumée, dite à Gabriel avant câblage : **qui entre peut la
lire dans son navigateur.** Trois enfants derrière un code, c'est le bon
compromis. Cette clé a aussi transité par une conversation — à faire
tourner le jour où ça compte.

Chacun peut poser la sienne dans les réglages ; elle prime alors.

## Ce qui reste ouvert : l'envoi d'e-mail

Upstash est provisionné (`boris-kv`), connecté aux trois environnements.

Resend, non. L'intégration Marketplace **exige un domaine d'envoi** :

    Error: Missing required metadata: domain, region.

L'org COE Startup n'a aucun domaine, et « domaine » figure explicitement à
l'ESCALADE du programme.

**Décision de Gabriel, 2026-08-01 : on livre sans mail.** « Code oublié »
répond franchement que la réinitialisation n'est pas câblée ; un code perdu
se repose avec `seed.mjs`. L'adresse e-mail reste enregistrable dans les
réglages : elle servira le jour où l'envoi sera branché.

Deux sorties possibles ce jour-là :

1. **Compte Resend direct** (le plus rapide, aucun domaine). Gabriel crée un
   compte sur resend.com, génère une clé, me la donne :
   `vercel env add RESEND_API_KEY production` (+ preview, development).
   L'expéditeur reste `onboarding@resend.dev` et Resend ne délivre alors
   qu'à l'adresse propriétaire du compte — c'est exactement la boîte de test
   voulue par le programme.
2. **Domaine chez Resend** (durable). Gabriel nomme un domaine qu'il possède,
   je provisionne via le Marketplace et `MAIL_FROM` devient une vraie adresse.

## Reprise — dans l'ordre

```bash
cd "$HOME/Documents/L'Oreal/Boris-Prompt-Generator"

# après avoir posé RESEND_API_KEY (sortie 1) OU provisionné (sortie 2)
npm run build
vercel deploy --yes
vercel project protection disable --sso   # sinon le mur SSO revient
BASE_URL=<url> VERIFY_USER=karl VERIFY_CODE=1994K npm run verify
```

`SESSION_SECRET` et les variables KV sont déjà posés sur les trois
environnements. Les codes sont déjà dans la clé-valeur : `seed.mjs` n'est à
relancer que si le magasin est vidé.

## Mesures qui ont changé le code

**La réparation à cible fixe ne converge pas.** Une consigne « plus dense »,
puis une cible fixe à 82 % de la limite, produisaient une asymptote :
3877 → 3276 → 3141 → 3074 → 3056 pour une limite de 3000. Le modèle rabote
sans jamais franchir la barre, parce qu'il ne compte pas ses caractères, il
les estime. Cible dégressive (85 / 75 / 65 / 55 %) → au vert en deux ou
trois tentatives, sur cinq. Le budget est passé de 3 à 5 pour garder de la
marge : à 3, le vert tombait sur la dernière tentative.

**Le vérificateur testait une copie de la boucle, pas la boucle.** Il faisait
un appel unique là où l'atelier réparait — il déclarait donc rouge ce qui
passait en vrai, et n'aurait rien vu d'une régression de la réparation. La
boucle vit maintenant dans `src/generate.js`, partagée par les deux.

**`.gitignore` : l'exception doit suivre la règle large.** Vercel a ajouté
`.env*` après mon `!.env.example` — le modèle de variables se retrouvait
ignoré. Ordre corrigé, vérifié par `git check-ignore -v`.

**Le vérificateur s'interbloquait lui-même.** Le contrôle mobile ouvre un
serveur de sonde puis lance Chrome ; avec `execFileSync`, la boucle
d'événements de Node reste bloquée et ce serveur — dans le même processus —
ne peut plus répondre. Chrome attendait une page qui ne viendrait jamais,
le vérificateur pendait sans un octet de sortie. Lancement asynchrone.

**Un profil Chrome neuf fait pendre `--dump-dom`.** Ajouté pour éviter une
contention de verrou, `--user-data-dir` jetable dépassait la minute là où le
profil par défaut rend la main en secondes. Retiré ; le délai de 60 s reste
comme garde-fou.

**Le « bug mobile » n'existait pas.** Une capture headless à 390 px montrait
le texte coupé à droite : `--window-size` est ignoré par ce Chrome, le
viewport restait à 485 px, et l'image n'était qu'un rognage. Mesure faite :
zéro débordement de 320 à 430 px. Les durcissements CSS (`min-width: 0` sur
les enfants de grille, `min()` dans les `minmax`) sont conservés — corrects
par construction — mais ils ne réparaient rien. La leçon est dans le
vérificateur : le contrôle mobile y est désormais permanent.

**Quatre prénoms orphelinaient le quatrième.** `auto-fit` sur la grille de
la porte tombait à trois colonnes autour de 700 px, laissant Gabriela seule
sur sa ligne. Paliers explicites — 1, 2, puis 4 colonnes. Mesuré après coup :
deux colonnes de 298,5 px, quatre cartes en 2×2, opacité 1 partout.

**Une capture headless ne prouve pas une mise en page.** Le même écran
montrait une seule carte sur quatre — artefact de peinture, pas de bug : la
sonde DOM a confirmé les quatre cartes visibles et bien placées. Mesurer,
pas regarder.

## Le limiteur, et comment le lire

Huit tentatives de connexion par personne **et par adresse IP**, sur dix
minutes glissantes. Deux enfants sur le même Wi-Fi ont donc chacun leur
compteur : personne ne verrouille personne.

Trois refus à ne pas confondre, tous vérifiés en production :

| Code | Sens |
|---|---|
| `400` | code de moins de 4 caractères — rejeté avant toute comparaison |
| `401` | code refusé |
| `429` | limiteur : huit essais dépassés, dix minutes d'attente |

Un `429` pendant une mise au point n'est pas une panne : c'est le compteur
du vérificateur qui s'ajoute aux essais manuels sur le même compte.

**Le sélecteur de mode a été retiré** (décision de Gabriel, 2026-08-01) :
plus de « Nouvelle start-up / Produit dans une start-up existante », ni de
bandeau « 01 · L'idée ». L'idée dit d'elle-même si l'agent part de zéro ou
s'intègre à un terrain existant — le méta-prompt n'impose plus de MODE.
Le champ `mode` reste toléré dans les données pour les entrées déjà
sauvegardées ; les nouvelles portent la valeur par défaut.

**La grille des prénoms tient à n'importe quel effectif.** Paliers 1, 2, 3,
5 colonnes, et une règle structurelle (`:last-child:nth-child(…)`) étale la
carte qui resterait seule sur sa ligne. Mesuré à cinq : 2×2 + Cécile en
pleine largeur (299/299/611 px).

**Limite par défaut portée à 3900** (demande de Gabriel, 2026-08-01). La
fenêtre de visée n'est plus un texte figé : `targetWindow(limit)` donne
73–90 % de la limite (2200–2700 à 3000, 2850–3500 à 3900) et sert au
méta-prompt, aux instructions d'étape et au vérificateur. Un réglage 3000
déjà en localStorage est migré (c'était le défaut, jamais choisi). Effet
mesuré : à 3900, le premier jet passe sans réparation.

**Compteur de dépense par personne.** Le navigateur mesure (jetons ×
tarif catalogue, `PRICES` dans `src/meta.js`), le serveur additionne :
`/api/usage` (GET/POST, session obligatoire, INCRBYFLOAT atomique, delta
plafonné à 5 $, clé `bpg:user:<id>:usage`). Affiché en continu : puces
« prompt » / « juge » dans le vérificateur, « total à date » aussi dans le
bandeau. Double local par utilisateur si la clé-valeur tombe. C'est un
ordre de grandeur honnête, pas une facture — remises et cache non
modélisés.
