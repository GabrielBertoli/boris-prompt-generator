# État du run

Mis à jour le 2026-08-01. L'état vit ici : une coupure se reprend en lisant
ce fichier, pas en refaisant le chemin.

## Où ça en est

Le produit est écrit, construit, déployé en preview. Le vérificateur passe
sur tout ce qui ne dépend pas des deux fournisseurs.

| Parcours | État | Preuve |
|---|---|---|
| Prénom choisi | ✅ | trois prénoms servis par `/api/session` |
| Mauvais code refusé | ⛔ bloqué | KV absent → 503 au lieu de 401 |
| Bon code retenu | ⛔ bloqué | idem |
| Code changé | ⛔ bloqué | idem |
| Code oublié → mail | ⛔ bloqué | Resend non provisionné |
| Réglages | ✅ | clé, modèles, limite — navigateur |
| Idée sans question | ✅ | analyse renvoie `{"questions":[]}` → génère |
| Idée ambiguë | ✅ | jusqu'à 3 questions matérielles |
| Génération trop longue réparée | ✅ | 3795 → 3004 → 2694 pour une limite de 3000 |
| Audit appliqué en v2 | ✅ | juge Opus 5, corrections réinjectées |
| Sauvegarde puis rechargement | ⚠️ partiel | double navigateur OK ; serveur bloqué (KV) |
| Mobile | ✅ | grilles fluides, cibles ≥ 44 px, modales pleine largeur |

Preview courante :
`https://boris-prompt-generator-9e41k5hb7-coe-startup.vercel.app`
Protection SSO désactivée sur le projet — sinon Karl, Raphaëlle et Gabriela
se heurteraient au mur Vercel avant même la porte d'entrée.

## Ce qui bloque, et pourquoi je ne l'ai pas franchi

Vercel exige d'accepter les conditions Marketplace **dans un navigateur**
avant de provisionner Upstash (clé-valeur) et Resend (envoi). Le CLI le dit
lui-même : `integration_terms_acceptance_required`, non contournable en
non-interactif.

C'est un engagement juridique au nom de l'org COE Startup. Gabriel m'a
autorisé à cliquer via Chrome ; l'extension Claude-in-Chrome n'était pas
connectée au moment du run, donc je n'ai pas pu. Rien d'autre ne manque.

    https://vercel.com/coe-startup/~/integrations/accept-terms/upstash?source=cli
    https://vercel.com/coe-startup/~/integrations/accept-terms/resend?source=cli

## Reprise — dans l'ordre

```bash
cd "$HOME/Documents/L'Oreal/Boris-Prompt-Generator"

# 1. provisionner (après acceptation des conditions)
vercel integration add upstash/upstash-kv --no-claim -n boris-kv
vercel integration add resend --no-claim -n boris-mail

# 2. récupérer les variables et poser les codes initiaux
vercel env pull .env.local
node scripts/seed.mjs karl=1994K raphaelle=2000R gabriela=2000G

# 3. redéployer, puis rejouer TOUT
npm run build
vercel deploy --yes
BASE_URL=<url> VERIFY_USER=karl VERIFY_CODE=1994K npm run verify
```

`SESSION_SECRET` est déjà posé sur les trois environnements.

`MAIL_FROM` reste sur `onboarding@resend.dev` tant qu'aucun domaine n'est
vérifié : Resend ne délivrera alors qu'à l'adresse propriétaire du compte.
Vérifier un domaine relève de l'escalade — c'est à Gabriel.

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
