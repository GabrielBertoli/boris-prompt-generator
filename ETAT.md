# État du run

**EN PRODUCTION** — https://boris-prompt-generator.vercel.app

Dernier déploiement : **2026-08-23, commit `b1b50dd`**, poussé sur
`origin/main`, arbre propre. Vérifié sur l'alias stable **avec** `VERIFY_CODE`,
donc parcours d'accès compris : zéro échec.

Le JavaScript servi est byte-identique au build local. **La feuille de style,
non — et c'est bénin, vérifié règle par règle** : la construction distante
contient DEUX règles utilitaires de plus (`.blur`, `.resize`), et **aucune
règle locale ne lui manque**. Tailwind v4 devine ses classes en balayant les
sources : les mots `blur` et `resize` existent dans notre propre CSS, et le
build distant, qui restaure un cache, n'en retient pas exactement le même jeu.
Deux classes inutilisées de plus, aucune différence de comportement. Comparer
les hachages ne suffit donc plus à conclure sur le CSS : il faut comparer les
RÈGLES, et c'est ce qui a été fait ici (les deux règles corrigées sont
identiques des deux côtés).

**`npm run pilotage` n'a toujours pas été rejoué** (Playwright absent de la
machine) : c'est la dette de ce déploiement. Le harnais éprouve désormais le
palier à 1800 px, mais il mesure des hauteurs — il ne clique pas.

Déploiement précédent : 2026-08-02, commit `e87cbf3`, 228 au harnais + 142 au
pilotage.

## 2026-09-04 — troisième technique : la pile de crochets

Demande de Gabriel : une technique inspirée des **Function Hooks** de Claude
Code (proposition Anthropic du 2026-09-03, non livrée, `anthropics/claude-code#91870`).
Arbitrage complet dans **DECISIONS § 30**. En deux phrases : un mandat de GARDE
en cinq sections où ce que l'agent ne doit jamais faire est **retiré de son
monde** plutôt qu'interdit en prose, et où chaque règle est un crochet accroché
à un geste nommé, du plus haut au plus bas — le premier enveloppe les autres.

**Ce qui a bougé :** `src/crochets.js` (nouveau — mesure, oracle, méta-prompt,
étapes, juge, exemple de référence), `src/techniques.js` (troisième entrée du
registre, `id: "hooks"`), `src/App.jsx` (case de réglage `charLimitHooks`,
défaut 3000, et la phrase sous le curseur), `src/aide.js` (chapitre
« Pile de crochets — les cinq sections », « Les trois techniques », source
citée), `scripts/verify.mjs` (section « L'oracle de la pile de crochets »,
appel réel, quinze chapitres, trois tuiles).

**Vérifié :** `npm run build` au vert, `npm run verify` **341 assertions au
vert**, dont deux appels réels — Sonnet 5 rend un prompt de crochets au vert
en deux tentatives puis du premier coup. **Déployé en preview, pas en
production** : la promotion reste à la main de Gabriel.

**Atelier-Cartes** (demande du même jour) : oracle Python `verifier.py
crochets` (33 cas), fiche `techniques/crochets.md`, carte de la tour mise à
jour par l'API (voie 0 : BORIS, GANTELET ou CROCHETS ; ligne 3 923/3990).

## 2026-08-26 — le gantelet écrit désormais autour de 2500 caractères

Demande de Gabriel : le générateur ne doit plus être limité à 1300 caractères
mais à 2500. Il s'agit de la **boucle du gantelet** — Boris est à 3900 depuis le
2026-08-02 et n'a pas bougé. Arbitrage complet dans **DECISIONS § 29**.

**Ce qu'il ne fallait surtout pas faire : monter le seul plafond.** La longueur
du gantelet est décidée par un compte en MOTS, pas en caractères ; le réglage
serait passé à 2500 pendant que le méta-prompt continuait de demander 140 à 190
mots, et le vérificateur aurait refusé pour excès de mots tout prompt qui aurait
vraiment fait 2500 caractères. Curseur qui monte, rien qui change, rien en
rouge.

**Ce qui a bougé, ensemble, dans `src/gauntlet.js`** — le seul endroit où ces
nombres vivent : visée **290–380 mots** (au lieu de 140–190), fourchette
acceptée **230–420** (au lieu de 110–210), réglage par défaut **2500** (1300),
plafond dur **3000** (1600), plancher du curseur **1700** (800, devenu
incohérent : sous 1700 caractères le bas de la fenêtre de mots ne tient plus).
Un réglage enregistré avant ce jour vaut 1300, donc sous le plancher : il est
traité comme « jamais choisi » et rendu au défaut, plutôt que remonté au
plancher par `capLimit`.

**L'exemple de référence a été réécrit** (186 → 347 mots, 1 973 car.), parce
qu'il est passé à son propre vérificateur par une assertion et surtout montré au
modèle comme cible de forme : laissé court, il aurait enseigné la longueur qu'on
venait d'abandonner. Mêmes sept mouvements, rien de gonflé.

**Sept chiffres écrits à la main ont disparu** au passage (aide ×2,
`techniques.js`, et quatre bornes du vérificateur) : tous auraient survécu au
changement EN VERT, en mesurant la fenêtre d'avant. Ils se déduisent maintenant
de `VISEE` / `MOTS_MIN` / `MOTS_MAX`.

**Attribution CC BY 4.0 :** la licence autorise l'adaptation et impose de la
signaler. Le skill d'origine prescrit 120 à 180 mots ; l'aide le dit maintenant
noir sur blanc.

**Vérifié :** `npm run build` au vert, `npm run verify` **290 assertions au
vert**, appel Anthropic réel compris — le générateur a rendu un prompt de
gantelet de **369 mots / 2 128 caractères du premier coup**, oracle au vert,
sans réparation. **Pas déployé** : local uniquement, à promouvoir quand Gabriel
le décide.

## 2026-08-23, 09h — le panneau du juge ne défilait pas

Signalé par Gabriel une heure après la mise en ligne : le juge liste ses
failles et **aucun moyen de lancer la v2**. Cause mesurée, correctif posé,
assertion qui mord — tout est dans `DECISIONS.md` § 28. En deux phrases : la
colonne de droite débordait sa rangée de 187 px faute d'un `min-height: 0`
(un élément de grille vaut `min-height: auto`, qui l'emporte sur
`height: 100%`), donc son corps n'avait aucune hauteur à contraindre et
`overflow-y: auto` ne produisait aucune barre ; le bouton était dans le DOM,
son bas à 1018 px pour une fenêtre de 913. **Défaut antérieur au gantelet**
(vérifié sur `2368eeb`), réveillé par la longueur d'un audit.

Le harnais gagne une quatrième surface, « trois panneaux (1800 px) » : c'est
la première fois qu'un palier au-dessus de 1100 px est éprouvé
automatiquement. `--window-size` est honoré par ce Chrome headless — § 18 ne
valait que pour la sonde de débordement, pas pour Chrome.

**Reste vrai :** ce harnais mesure des hauteurs, il ne clique pas. Playwright
est toujours à installer.

## 2026-08-23, 08h — une seconde technique, EN PRODUCTION

L'atelier sait produire **deux** familles de prompts : la méthode Boris, et la
**boucle du gantelet** (technique de Matt Shumer, skill de RoboNuggets, CC BY
4.0 — voir DECISIONS § 27). Le choix se fait sur deux tuiles au-dessus de
l'idée ; tout le reste de l'écran suit la technique armée.

**En ligne depuis le 2026-08-23**, deux commits (`b7aa5d1` la technique,
`2993646` la surface mobile qui manquait), preview vérifiée avant promotion.

**Ce qui est vrai à cette heure :**

- `npm run build` au vert, `npm run verify` **283 assertions au vert** en local
  (dont **43** pour les techniques et **12** pour la nouvelle surface mobile),
  et un aller-retour réel contre `api.anthropic.com` qui a rendu un prompt de
  gantelet de 188 mots accepté du premier coup.
- Parcours complet éprouvé dans un Chrome réel, appel Anthropic simulé en flux :
  choix de la technique → 3 barres proposées → barre choisie → prompt au marbre
  (1 105 car., 183 mots) → note du juge 8,2 avec **sa** grille → audit → v2.
- **Une troisième surface au harnais mobile : « atelier neuf ».** Les deux
  autres ouvrent sur un prompt déjà là, donc la carte de l'idée y est REPLIÉE —
  et le choix de la technique, qui vit dedans, n'était mesuré à AUCUNE largeur.
  Même forme de défaut que la barre supérieure qui débordait de 15 px à 320 px
  (§ audit du 2026-08-01) : une grille à deux colonnes qui ne retomberait pas
  sur une seule ne se serait vue nulle part. Mesuré : zéro débordement à 320,
  360, 390 et 430 px, tuiles rendues.
- `npm run pilotage` n'a PAS été rejoué (Playwright absent de la machine). Le
  harnais couvre désormais les quatre largeurs de la nouvelle surface ; il ne
  remplace toujours pas un parcours au clic.

**La seule dette de ce déploiement :** installer Playwright et rejouer
`npm run pilotage` sur la production, en exerçant le parcours du gantelet au
clic (barres proposées, barre choisie, prompt, note, audit → v2). Le harnais
prouve que rien ne déborde et que l'écran suit la technique ; il ne prouve
pas qu'on peut cliquer d'un bout à l'autre.

Fichiers touchés : `src/gauntlet.js` (neuf), `src/techniques.js` (neuf),
`src/App.jsx`, `src/meta.js`, `src/generate.js`, `src/library.js`,
`src/aide.js`, `src/atelier.css`, `scripts/verify.mjs`.

## Reprendre — dans cet ordre

```bash
cd "$HOME/Documents/L'Oreal/Boris-Prompt-Generator"
npm run build && npm run verify              # 197 assertions, sans réseau d'accès
npm run dev &                                # puis, dans un autre terminal :
npm run pilotage                             # 142 assertions, Chrome réel, 10 paliers
```

Pour viser un déploiement :
`BASE_URL=<url> VERIFY_USER=karl VERIFY_CODE=<Gabriel te le donne> npm run verify`
puis `npm run pilotage -- <url>`.

**Les deux instruments sont nécessaires** et ne mesurent pas la même chose :
le harnais ne peut exercer AUCUN palier responsive (§ 18), donc ni les trois
panneaux, ni « tout tient dans l'écran ». Le skill `.claude/skills/verify/`
dit lequel prouve quoi.

## Journée du 2026-08-02 — ce qui a été livré

Six commits, tous en production et poussés :

| Commit | Ce qu'il apporte |
|---|---|
| `c370bb7` | la note du juge en tête de carte, le bouton ⏹ Arrêter |
| `ee4a44f` | mise en ligne (les deux chantiers dormaient non déployés) |
| `f01c4f3` | trois panneaux, l'écran de travail collé en haut |
| `29cfbf1` | les codes sortent du dépôt public, garde-fou contre la récidive |
| `5c865a1` | l'aide en douze chapitres, le pied de page, « Nouveau prompt » |
| `e87cbf3` | tout tient dans l'écran au-delà de 1400 px |

**Rien n'est en cours.** Aucun fichier modifié, aucun chantier à moitié
fait, aucun processus en fond. Le seul travail ouvert n'appartient pas à
l'agent : l'envoi du mail de réinitialisation, suspendu à une clé Resend de
la main de Gabriel (§ « Ce qui reste ouvert »).

**La leçon du jour, et elle a coûté une matinée à Gabriel : le vert local
ne met rien en ligne.** Deux chantiers finis et vérifiés — la note du juge,
le bouton Arrêter — sont restés **non commités et non déployés** pendant que
la production servait la version de la veille (18:35, 13 h de retard). Le
commit du matin lui-même (« le fil au pupitre ») n'y était pas. Gabriel a
donc cherché à l'écran une jauge, un bouton d'arrêt et un fil déplacé qui
n'existaient que sur ce disque. **Un chantier n'est pas fini tant qu'il n'est
pas en ligne** : commit et déploiement font partie du chantier, pas de la
clôture de session.

Avant cela : déployée sur ordre de Gabriel le 2026-08-01, 122 assertions au
vert, et **le parcours entier conduit au clic dans un vrai navigateur** :
porte, génération, correction en v2, autre appareil, 320 px, suppression.
Voir « L'audit au pilotage » plus bas.

## La note du juge, et l'arrêt — 2026-08-02

En tête de carte, le grand chiffre n'est plus la longueur mais une **note
sur 10 du juge**, sur une jauge à trois bandes peintes à demeure. Un seul
juge, un seul appel : il note ET audite dans la même réponse. La note
globale n'est pas la moyenne, rien n'est cru sur parole (`normalizeNote`
borne et reconstruit), et elle porte le numéro de sa version. Elle vit dans
l'entrée de bibliothèque et sur son tour du fil — donc elle survit au
rechargement et suit d'un appareil à l'autre. Motifs en `DECISIONS.md` § 21.

Et un bouton **⏹ Arrêter**, posé à côté du temps écoulé : il coupe l'appel
réseau en cours — pas un drapeau lu entre deux tentatives —, donc aussi la
réparation qui vient de partir et le juge qui enchaîne. `Arret` est une
erreur à part : un arrêt voulu ne s'affiche pas en rouge d'échec et
n'écrase pas la version en place. `DECISIONS.md` § 22.

**Le fil reste à gauche** (le pupitre) — arbitré par Gabriel le 2026-08-02
après qu'il l'a cherché à droite. La décision § 20 tient : deux panneaux à
gauche ne laissaient plus de milieu au prompt, mais un seul, oui.

## Trois panneaux — 2026-08-02

Demandé par Gabriel sur capture. **Gauche : le fil** (discussion et
itérations). **Centre : le prompt** et les gestes qu'on fait dessus.
**Droite : l'épreuve** — tout ce qui se surveille : la note du juge, ce
qu'il reproche, la dépense, le journal de la course, le chrono et le
bouton d'arrêt.

Et **l'écran de travail commence en haut** dès qu'une analyse part ou
qu'un prompt est rappelé de la casse : la manchette d'accueil s'efface,
l'idée se replie en une ligne (« Modifier » la rouvre). Mesuré : le prompt
naissait au-delà de 800 px, il naît à 245.

L'accueil garde le premier écran d'une session, avec une description en
français courant — sans oracle, sans invariants, sans escalade. Motifs et
mesures en `DECISIONS.md` § 23.

**Le pilotage Playwright est entré au dépôt** : `npm run pilotage`
(`scripts/pilotage.mjs`). C'est le seul instrument qui prouve un palier
responsive, donc le seul qui prouve trois colonnes — le laisser en script
jetable revenait à ne pas pouvoir rejouer cette décision. Playwright reste
installé **hors** du dépôt (`/tmp/drive`, ou `PLAYWRIGHT_HOME`) ; le script
le dit et sort en code 2 s'il manque.

Preuves : **165 assertions** locales + **77 au pilotage**, zéro échec.

## L'aide, le pied de page, « Nouveau prompt » — 2026-08-02

**Une aide en douze chapitres** (bouton « ? » de la barre), un par partie
de l'écran, plus la méthode et la sécurité. Elle est écrite en **données**
(`src/aide.js`) et non en balisage, pour une raison précise : une aide
vieillit en silence et **se lit comme vraie**. Le vérificateur prouve donc
que les huit sections qu'elle annonce sont exactement celles qu'impose
`buildMeta()`, dans le même ordre, que le plafond cité est `HARD_LIMIT`
relu depuis le code, que les douze chapitres attendus sont là, et qu'aucun
mot de jargon n'a reparu dans la prose. `DECISIONS.md` § 24.

**Un pied de page** : `© 2026 Gabriel Bertoli — Atelier Boris®`, les droits
réservés, et une note de sécurité en clair. Hors de la coquille — les deux
bords sont collants et n'ont pas de bas.

**« Créer un nouveau prompt »**, dans la barre : le geste le plus courant
n'avait pas de bouton.

Cinq défauts sortis avec ces ajouts, tous corrigés (`DECISIONS.md` § 25) :
la barre ne pouvait plus porter deux boutons de plus (dégraissage par
paliers) ; le sigle du compte était décoratif alors qu'il devient la seule
porte vers les réglages **et la déconnexion** sous 560 px ; le nouveau
bouton perdait son nom accessible sous 700 px ; Échap ne fermait aucun
panneau ; et la sonde de débordement ne nommait pas le coupable — elle le
nomme désormais, avec sa largeur.

Preuves du jour : **197 assertions** locales (`npm run verify`) + **142 au
pilotage** (`npm run pilotage`), zéro échec.

## Tout tient dans l'écran — 2026-08-02

Mesuré : la page faisait **1 148 px pour 935 visibles** sur un 16 pouces,
avec un prompt de 4 068 caractères — elle dépassait de 213 px. Au-delà de
1400 px, la fenêtre est désormais divisée une fois pour toutes (barre +
colonnes + pied) et **chaque colonne défile chez elle**. Vérifié à cinq
tailles d'écran réelles : **0 px de dépassement**, pied visible, « Copier
le prompt » atteignable sans défiler.

Sous 1400 px la page défile encore, et c'est voulu : l'épreuve y est
empilée sous le marbre, une hauteur figée la couperait. `DECISIONS.md`
§ 26.

## Les codes ont été réémis — 2026-08-02

**Les cinq codes d'accès étaient en clair dans un dépôt GitHub public**
(`GabrielBertoli/boris-prompt-generator`, créé le 2026-08-02 à 07:02) —
dans `ETAT.md`, `CLAUDE.md` et le skill `verify`, **depuis le premier
commit**. Le bundle, lui, était propre : l'invariant du programme ne dit
que « le bundle ne contient aucun secret », et il regardait à côté.

Ce que ça coûtait : `api/session.js` sert `ANTHROPIC_SHARED_KEY` à toute
session valide. **Code lisible = clé Anthropic lisible**, à la charge de
Gabriel. Exposition mesurée : environ une heure, 0 fork, 0 étoile.

Décision de Gabriel : **garder le dépôt public, réémettre les codes.**
Fait le 2026-08-02 :

- cinq codes neufs posés par `scripts/seed.mjs` (scrypt, 86 caractères de
  condensat chacun) ;
- vérifié en production sur trois comptes : **ancien code → 401, nouveau
  → 200** ;
- les codes purgés des trois fichiers ; **ils ne sont écrits nulle part
  dans le dépôt**, et Gabriel seul les détient. Ils restent dans
  l'historique git public — c'est sans effet, ils ne valent plus rien.

**Un garde-fou empêche la récidive** : `npm run verify` relit tous les
fichiers suivis par git et échoue si le code de `VERIFY_CODE` y figure.
Prouvé dans les deux sens le jour même — vert sur le dépôt purgé, rouge
dès qu'on y remet un code. Le contrôle est exact (le code réellement en
service) plutôt que générique : une expression qui devinerait « ce qui
ressemble à un code » se ferait piéger au premier changement de format.

Chacun peut changer le sien depuis Réglages — c'est ce qu'il faut faire
d'un code transmis de la main à la main.

## La casse, à gauche

La bibliothèque a quitté le bas de page pour devenir un panneau : **la
casse**, le meuble où le typographe range ses caractères. Chaque prompt y
tient son cassetin — clic sur le titre et il revient sur le marbre avec son
fil, « ⋯ » déplie ses huit gestes, export/import en pied. Panneau permanent
au-delà de 1100 px, tiroir coulissant en dessous.

Le tiroir n'est **jamais démonté** du document : il se referme par
transformation. Ce qu'on y range reste donc atteignable au clavier — et
mesurable par une sonde.

## Le penseur

Un vrai GIF fabriqué depuis la photo de Gabriel (`public/penseur.gif` —
24 images, 160 px, 140 Ko), affiché **à chaque appel à Claude et seulement
alors** : analyse, génération, juge, correction. Le libellé suit ce qui se
passe (« il lit l'idée », « il compose », « le juge relit ») et les
secondes défilent.

Le GIF ne porte que le mouvement photographique. La trame de similigravure
et l'anneau de repérage sont en CSS : trois fois plus léger, net sur écran
à forte densité, et immobile pour qui a réglé son système sur « moins de
mouvement ».

Refabriquer le GIF : `ffmpeg` + ImageMagick + `gifsicle`, recette dans
`DECISIONS.md` § 17.

**Panne corrigée le 2026-08-01 : une génération pouvait tourner plus de
trois minutes, muette.** Rien ne bornait l'appel à `api.anthropic.com` — ni
délai, ni affichage avant la fin — et la boucle de réparation en enchaîne
jusqu'à cinq. Une réponse lente était donc indiscernable d'un blocage.
Réparé par le **flux** (le texte s'affiche pendant qu'il arrive), le temps
écoulé visible, un délai d'**inactivité** de 60 s réarmé à chaque morceau
— c'est le silence qui est anormal, pas la durée — et un plafond dur de
300 s. Mesuré en production : 45 morceaux, premier à 1,6 s.

Mis à jour le 2026-08-01, session close proprement, arbre git propre.
L'état vit ici : une coupure se reprend en lisant ce fichier, pas en
refaisant le chemin.

**Un seul chantier reste ouvert, et il n'appartient pas à l'agent** :
l'envoi du mail de réinitialisation, suspendu à une clé Resend de la main
de Gabriel (§ « Ce qui reste ouvert »). Tout le reste est livré et vérifié.

Reprendre par : `npm run verify` seul (assertions locales), puis avec
`BASE_URL=…` pour viser un déploiement.

## Le fil de correction — le pupitre, à gauche

**Déplacé le 2026-08-02.** Le fil a quitté le marbre : il tient désormais le
bord gauche sur toute la hauteur (le **pupitre**), seul son corps défile, et
le composeur ne quitte jamais l'écran. Empilé sous le prompt, il obligeait à
faire défiler toute la page pour relire ce qu'on venait de demander — et le
prompt sortait de l'écran au moment précis où on écrivait ce qu'il fallait y
changer. Le prompt reste au milieu et **tient dans un écran** (feuille bornée
à la hauteur utile, marge de défilement sous la barre collante). En dessous
de 1100 px, le pupitre repasse dans le flux, sous le marbre.

La casse redevient donc un **tiroir** (bouton ☰ de la barre) à toutes les
largeurs : deux panneaux permanents à gauche ne laissaient plus de milieu au
prompt. Cela renverse sciemment `DECISIONS.md` § 16 ; le motif est en § 20.

Chaque génération porte son fil : on écrit en français ce qu'il faut
changer, l'atelier régénère le prompt **entier**, le mesure, et garde la
trace. « Reprendre le fil » sur une carte rouvre le prompt avec son
historique ; « Remettre cette version » revient en arrière. L'audit du juge
entre au fil comme une correction — le fil dit d'où vient chaque version.

**Tout prompt affiché porte son bouton copier** (2026-08-02) : la version en
cours, chaque version antérieure du fil, chaque entrée de la casse, et le
prompt ouvert dans l'éditeur. Les versions antérieures s'affichaient en
entier sans aucun moyen de les copier — un texte qu'on ne peut que
sélectionner à la souris n'est pas livré. Un tour **coupé** n'en porte pas :
il ne contient plus le prompt mais une ligne d'état, et la copier serait
mentir.

**Le fil vit dans l'entrée de bibliothèque**, donc dans le profil de son
propriétaire (`/api/prompts`, clé dérivée de la session), et il suit d'un
appareil à l'autre. La première correction **enregistre d'office** : un fil
n'est jamais perdu faute d'avoir cliqué « Sauvegarder ».

Deux bornes, sans lesquelles ça ne tiendrait pas :

- **La coupe.** Seules les trois dernières réponses gardent leur texte
  entier ; au-delà, une ligne dit ce qu'elles étaient (`v3 — 3 240
  caractères, au vert`). Les demandes, elles, ne sont jamais coupées. Sans
  cette coupe, douze corrections sur une entrée dépassent à elles seules la
  charge utile acceptée. Une version coupée ne se restaure plus — c'est le
  prix, il est dit dans l'interface.
- **La reconstruction.** Une correction repart TOUJOURS du prompt en
  vigueur (`baseConvoFor` : méthode + idée + dernier état), jamais de la
  conversation accumulée. Coût borné, et surtout comportement **identique
  avant et après un rechargement** — le fil ne se comporte pas différemment
  selon que la page a été rouverte ou non.

## Ce qu'on peut faire d'un prompt qu'on possède

| Geste | Où | Note |
|---|---|---|
| Sauvegarder | après génération | existait |
| Copier | résultat et carte | existait |
| Modifier (titre + texte) | carte → feuille | existait |
| Supprimer | carte, avec confirmation | existait |
| Reprendre l'idée | carte | existait |
| **Renommer** | carte, champ en ligne | Entrée valide, Échap annule |
| **Dupliquer** | carte | « X (copie) », puis « (copie 2) » |
| **Télécharger .md** | résultat et carte | prompt en clôture de code |
| **Imprimer** | résultat et carte | feuille propre, noir sur blanc |
| **Exporter tout / Importer** | bandeau de la bibliothèque | copie de secours en JSON |

L'export existe pour une raison précise : la bibliothèque ne vit que dans la
clé-valeur, et le dépôt documente déjà qu'un magasin vidé perd tout. Un
fichier chez soi répare ça. L'import **fusionne** au lieu d'écraser — à
identifiant égal, la date de modification tranche, donc réimporter deux fois
le même fichier ne duplique rien.

L'impression passe par un **portail hors du `#root`** : la règle `@media
print` n'a plus qu'une chose à masquer, l'application entière. Pas de fenêtre
surgissante, donc rien à bloquer.

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

**Troisième passe sur une preview neuve** (`…-ljvvoudrf`, 14:40), avec un
autre compte — Gabriela : 43 assertions au vert également. Les
variables de l'environnement Preview fonctionnent donc pour de bon, et la
bibliothèque réelle de Gabriela est ressortie intacte de la sonde (une
entrée conservée, la sonde effacée).

### Puis, après les gestes de bibliothèque : **77 assertions**, et **111** après le fil

Production déployée sur ordre de Gabriel et vérifiée dans la foulée (compte
Gabriel). Le vérificateur a gagné 34 assertions :

- **22 sur les fonctions pures** de `src/library.js` — renommage, duplication
  numérotée, Markdown, aller-retour export→import, refus d'un fichier qui
  n'est pas du JSON, fusion qui ignore le plus ancien et n'ajoute rien à la
  seconde importation. Elles tournent en Node, sans navigateur : c'est pour
  cela que ces fonctions ne touchent ni au DOM ni au réseau.
- **5 sur l'impression, réellement jouée** : le bouton est cliqué dans
  Chrome, la feuille se monte hors du `#root`, elle contient le prompt et son
  titre, et `window.print` est appelé une fois exactement. `window.print` est
  neutralisé avant tout le reste — sans quoi une boîte d'impression
  suspendrait Chrome, et le vérificateur avec.
- **Le contrôle mobile mesurait une seule surface.** La sonde répondait
  « non authentifié » avec zéro prénom : elle ne voyait donc qu'un portail
  vide, et l'atelier n'avait **jamais** été mesuré — ni ses cartes, ni leurs
  neuf boutons. Elle sert maintenant deux surfaces, portail et atelier chargé
  d'une carte, chacune avec un **marqueur** vérifié dans le DOM : sans lui,
  un « zéro débordement » ne serait qu'un faux vert sur une page blanche.
  Mesuré : aucun débordement, 320 à 430 px, sur les deux.

Contrôlé au passage : `SESSION_SECRET`, `ANTHROPIC_SHARED_KEY` et les cinq
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
| Code changé | ✅ | aller-retour code → provisoire → code |
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

Comptes en place : Gabriel, Karl, Raphaëlle, Gabriela, Cécile — les cinq
vérifiés en production, bon code accepté et mauvais refusé. **Les codes ne
sont écrits nulle part dans le dépôt** — voir « Les codes ont été réémis ».
Aucun mail enregistré : c'est à chacun de poser le sien depuis Réglages.

Ajouter quelqu'un = trois endroits, plus la graine :
`api/_lib/http.js` (USERS, qui fait foi), `src/Gate.jsx` (repli si l'accès
ne répond pas), `scripts/verify.mjs` (liste attendue, nommée et non comptée),
puis `node scripts/seed.mjs <id>=<code>`.

Protection SSO désactivée sur le projet — sinon Karl, Raphaëlle et Gabriela
se heurteraient au mur Vercel avant même la porte d'entrée. **Elle ne
revient pas.** Une note antérieure disait de la redésactiver après chaque
`vercel deploy` : c'est faux, et vérifié comme tel. `vercel project
protection boris-prompt-generator` rend `"ssoProtection": null`, et une
preview déployée sans toucher au réglage sert l'atelier en 200. La
désactivation est un réglage de projet, pas une propriété de déploiement ;
ce qui l'avait fait croire, c'est l'état initial du projet, protégé par
défaut à sa création. Un geste de moins à chaque reprise.

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

## L'audit au pilotage — 2026-08-01

Playwright, Chrome réel, la production. Tout est passé : mauvais code
refusé (« Code refusé. »), génération (réparation 5360 → 4038 → 3697), fil
de correction en v2, **prompt affiché une seule fois**, réouverture sur un
**contexte neuf sans localStorage** — le fil revient, il vient donc bien du
profil —, correction vide refusée, gestes du cassetin, suppression puis
rechargement.

**Un défaut trouvé, corrigé, revérifié : l'avatar débordait de 15 px à
320 px.** La barre supérieure portait un élément de trop depuis l'ajout du
bouton de la casse, et c'est le dernier qui payait (`scrollWidth` 335 pour
320). Dégraissage par paliers : la marque disparaît à 460 px, le mot
« Casse » à 400 px. Revérifié à de vrais viewports, 4 largeurs × 3 états,
zéro débordement, en local puis en production.

**Le harnais ne pouvait pas le voir**, et c'est le vrai enseignement : voir
`DECISIONS.md` § 18. En deux mots — sa sonde force la largeur du document,
les media queries s'évaluent sur le vrai viewport, aucun palier n'est donc
exercé. Le skill `.claude/skills/verify/SKILL.md` dit quel instrument
prouve quoi.

## Reprise — dans l'ordre

```bash
cd "$HOME/Documents/L'Oreal/Boris-Prompt-Generator"

# après avoir posé RESEND_API_KEY (sortie 1) OU provisionné (sortie 2)
npm run build
vercel deploy --yes
BASE_URL=<url> VERIFY_USER=karl VERIFY_CODE=<Gabriel te le donne> npm run verify
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

**Plafond dur à 3950, et il n'est plus réglable** (2026-08-02). Un prompt de
plus de 4000 caractères est sorti « au vert » : le curseur montait à **8000**
et le vérificateur comparait à cette limite-là — il notait le réglage, pas le
prompt. `HARD_LIMIT` vit maintenant dans `verifyPrompt`, par où passent la
génération, l'audit appliqué, la correction du fil, la remise d'une ancienne
version et l'édition à la main ; le curseur ne fait plus que descendre, et un
réglage à 8000 déjà enregistré est rabattu à la relecture.

Ce qui en découle, et qui compte autant que le chiffre :

- Un prompt hors plafond **ne s'affiche pas**. Il ne s'affichait qu'assorti
  d'un avertissement, sous un bouton « Copier le prompt » — livrer un
  produit cassé en s'en excusant.
- Une correction refusée n'écrase pas la version en vigueur : elle entre au
  fil marquée *coupée* (trace gardée, texte non), donc ni copiable ni
  restaurable.
- La boucle rend la **meilleure** tentative, plus la dernière : cinq
  serrages, rien ne dit que le cinquième bat le troisième.
- Le compteur, la jauge et le journal des tentatives restent à l'écran —
  c'est la preuve de ce qui s'est passé. Seule la feuille manque.

**Compteur de dépense par personne.** Le navigateur mesure (jetons ×
tarif catalogue, `PRICES` dans `src/meta.js`), le serveur additionne :
`/api/usage` (GET/POST, session obligatoire, INCRBYFLOAT atomique, delta
plafonné à 5 $, clé `bpg:user:<id>:usage`). Affiché en continu : puces
« prompt » / « juge » dans le vérificateur, « total à date » aussi dans le
bandeau. Double local par utilisateur si la clé-valeur tombe. C'est un
ordre de grandeur honnête, pas une facture — remises et cache non
modélisés.
