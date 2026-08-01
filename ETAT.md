# État du run

Mis à jour le 2026-08-01. L'état vit ici : une coupure se reprend en lisant
ce fichier, pas en refaisant le chemin.

## Où ça en est

Le produit est écrit, construit, déployé en preview. Le vérificateur passe
sur tout ce qui ne dépend pas des deux fournisseurs.

| Parcours | État | Preuve |
|---|---|---|
| Prénom choisi | ✅ | trois prénoms servis par `/api/session` |
| Mauvais code refusé | ✅ | 401, aucun cookie posé |
| Bon code retenu | ✅ | 200, cookie `HttpOnly` + `Secure` |
| Code changé | ✅ | aller-retour `2000G` → provisoire → `2000G` |
| Code oublié → mail | ⛔ bloqué | pas de fournisseur d'envoi (voir ci-dessous) |
| Réglages | ✅ | clé, modèles, limite — navigateur |
| Idée sans question | ✅ | analyse renvoie `{"questions":[]}` → génère |
| Idée ambiguë | ✅ | jusqu'à 3 questions matérielles |
| Génération trop longue réparée | ✅ | 3691 → 3137 → 2829 pour une limite de 3000 |
| Audit appliqué en v2 | ✅ | juge Opus 5, corrections réinjectées |
| Sauvegarde puis rechargement | ✅ | écrit, relu, supprimé ; 401 sans session |
| Mobile | ✅ | grilles fluides, cibles ≥ 44 px, modales pleine largeur |

Preview courante :
`https://boris-prompt-generator-b9bgx8hu6-coe-startup.vercel.app`

Codes en place : `1994K`, `2000R`, `2000G`. Aucun mail enregistré — c'est à
chacun de poser le sien depuis Réglages.

Protection SSO désactivée sur le projet — sinon Karl, Raphaëlle et Gabriela
se heurteraient au mur Vercel avant même la porte d'entrée. **Elle se
remet à chaque déploiement : la redésactiver après chaque `vercel deploy`.**

## Ce qui bloque : l'envoi d'e-mail

Upstash est provisionné (`boris-kv`), connecté aux trois environnements.

Resend, non. L'intégration Marketplace **exige un domaine d'envoi** :

    Error: Missing required metadata: domain, region.

L'org COE Startup n'a aucun domaine, et « domaine » figure explicitement à
l'ESCALADE du programme. Je prépare, je dépose, je repars — je ne choisis
pas un domaine d'envoi à la place de Gabriel.

Deux sorties, au choix :

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
