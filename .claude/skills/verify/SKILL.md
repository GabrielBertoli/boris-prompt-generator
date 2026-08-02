---
name: verify
description: Conduire l'Atelier Boris pour de vrai — connexion, génération, fil de correction, casse, mobile — et capturer ce qu'on observe. À utiliser avant de déclarer qu'un changement marche.
---

# Vérifier l'Atelier Boris

Deux instruments, et ils ne mesurent pas la même chose. Les deux sont
nécessaires ; aucun ne remplace l'autre.

## 1. Le harnais d'assertions — `npm run verify`

```bash
npm run build                                   # dist/ doit être à jour : le harnais le lit
npm run verify                                  # assertions locales (bundle, fonctions pures, mobile, génération)
BASE_URL=https://boris-prompt-generator.vercel.app \
  VERIFY_USER=karl VERIFY_CODE=<code> npm run verify   # + les parcours d'accès contre un déploiement
```

Couvre : secrets absents du bundle, fonctions pures de `src/library.js`,
fil de correction, accès et bibliothèque contre un vrai déploiement,
impression réellement jouée dans Chrome, génération contre l'API Anthropic.

**Ce qu'il ne peut PAS faire — à savoir avant de lui faire confiance.**
Sa sonde mobile force `documentElement.style.width` ; les media queries,
elles, s'évaluent sur le vrai viewport (485 px sous ce Chrome headless).
**Aucun palier responsive n'est exercé.** Mesuré : `--window-size=320,720`
laisse `window.innerWidth` à 500 — ce Chrome l'ignore. Un défaut qui
n'apparaît qu'à 320 px lui est donc invisible.

Le Chrome de la sonde rate parfois son délai de 60 s quand d'autres
instances tournent. `pkill -f "Google Chrome.*headless"` puis rejouer.

## 2. Le pilotage réel — `npm run pilotage`

C'est le seul moyen d'exercer les paliers responsive, et le seul qui
prouve un parcours au clic. **Il est entré au dépôt le 2026-08-02**
(`scripts/pilotage.mjs`, 142 assertions) : il prouve les trois panneaux,
« tout tient dans l'écran », l'aide, le pied de page et « Nouveau prompt »
— rien de tout cela n'est visible du harnais.

```bash
npm run dev            # dans un autre terminal
npm run pilotage       # http://localhost:5173
npm run pilotage -- https://…vercel.app     # ou un déploiement
```

Playwright n'est pas une dépendance du dépôt : l'installer à côté (le
script sort en code 2 avec la marche à suivre s'il manque).

```bash
mkdir -p /tmp/drive && cd /tmp/drive && npm init -y && npm i playwright
# chromium n'a pas besoin d'être téléchargé : channel "chrome" utilise le Chrome installé
```

```js
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 320, height: 780 }, isMobile: true });
// débordement horizontal réel :
await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
```

### Parcours qui valent le coup

1. **Portail** — toucher un prénom, mauvais code (« Code refusé. »), bon code.
   Codes : ils ne sont écrits NULLE PART dans le dépôt — Gabriel les donne.
   Ils y figuraient en clair jusqu'au 2026-08-02, dans un dépôt public ; ils
   ont été réémis. Passe-les par `VERIFY_CODE`, jamais en dur.
   Limiteur : 8 essais par personne **et par IP** sur 10 min glissantes — alterner
   les comptes entre deux campagnes, sinon 429.
2. **Génération** — l'analyse pose souvent 3 questions. Elles arrivent en
   `<input placeholder="Ta réponse…">`, **pas** en `textarea` : attendre le bouton
   `Générer le prompt` plutôt que de compter les zones de texte. Les laisser vides
   est un cas valide — l'atelier doit trancher par hypothèse.
   Compter jusqu'à ~3 min : la réparation enchaîne jusqu'à 5 appels.
3. **Penseur** — `.penseur` doit paraître à CHAQUE appel et disparaître après.
   `await page.waitForFunction(() => !document.querySelector(".penseur"))`.
4. **Fil de correction** — `.thread textarea`, bouton `Corriger → vN`.
   Le prompt ne doit paraître qu'**une** fois : le dernier tour affiche
   `.turn-courant`, pas le texte.
5. **Le fil vient du profil, pas du navigateur** — rouvrir dans un contexte neuf
   avec les cookies SEULS (`storageState: { cookies, origins: [] }`). Si le fil
   revient, il vient bien du serveur.
6. **Casse** — `.casse-toggle` (tiroir), `.casse-open` (remettre sur le marbre),
   `.casse-more` (gestes), puis Supprimer + Confirmer.

### Nettoyer derrière soi

Toute correction **enregistre d'office** dans le profil du compte utilisé.
Marquer l'idée d'un jeton (`PILOTAGE-<horodatage>`), puis supprimer les
entrées créées par l'interface en fin de campagne, et recharger pour
confirmer leur disparition.

## Escalade

Production, domaine, suppression de données : décision de Gabriel.
`ETAT.md` et `DECISIONS.md` font autorité sur tout le reste.
