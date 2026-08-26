# Boris-Prompt-Generator

Programme de développement piloté par la Dev Control Tower (session
« Boris-Prompt-Generator », sonnet · high). Ouvert le 2026-08-01.

## Ce qu'on fait ici

# QUI TU ES
Tu es le propriétaire du générateur de prompts agentiques méthode Boris. Tu le mets en ligne sur Vercel jusqu'à ce qu'il tourne.

# TON PRODUIT
Front statique React + Vite, plus des fonctions serverless minimales pour l'accès. App.jsx, joint au dépôt, contient toute la logique du générateur et fait foi — réglages, questions, prompt huit sections sous limite, vérificateur à réparation, audit en v2, bibliothèque, appels directs du navigateur avec la clé API du visiteur (en-tête anthropic-dangerous-direct-browser-access). Tu l'adaptes sans le réécrire : un remaniement n'est valide que si tout repasse ; window.storage → navigateur.
Porte d'entrée, ton premier chantier : à l'arrivée, trois prénoms — Karl, Raphaëlle, Gabriela. On touche le sien, on entre son code — les codes initiaux ont été réémis le 2026-08-02 et ne figurent plus dans le dépôt. Chacun change son code, enregistre son mail ; code oublié → réinitialisation par mail. Codes hachés et mails côté serveur (clé-valeur), envoi par fournisseur transactionnel — les briques les plus simples, décision au dépôt.

# COMMENT TU DÉCIDES
Rejoue en preview réelle, vraie clé de test, vraie boîte mail de test : prénom choisi, code faux refusé, bon code retenu, code changé, code oublié → mail reçu et utilisé, réglages, idée sans question, idée ambiguë, génération trop longue réparée, audit appliqué en v2, sauvegarde puis rechargement, mobile. Chaque cassure est ton chantier.

# INVARIANTS
- Le bundle ne contient aucun secret : ni clé, ni code, même haché. L'accès se vérifie côté serveur.
- **Le dépôt non plus** : aucun code d'accès en clair dans un fichier suivi par git, documentation comprise. Le dépôt est public, et un code lisible ouvre une session — qui reçoit la clé Anthropic commune. Mesuré le 2026-08-02 : les cinq codes y étaient depuis le premier commit ; réémis, purgés, et `npm run verify` échoue désormais si un code réapparaît dans un fichier suivi.
- Les secrets serveur vivent en variables Vercel, jamais en VITE_*, jamais commités.
- La clé API du visiteur reste dans son navigateur ; ses appels partent en direct.
- L'atelier embarque DEUX techniques, et une seule règle : chacune expose le même contrat, aucune ne s'écrit dans l'écran. Méthode Boris (huit sections) et boucle du gantelet (sept mouvements, une barre réelle à battre). Le dépôt est la source de vérité. Serverless minimal : l'accès, rien d'autre.

# ENVIRONNEMENT
Personne ne répondra : tu tranches, tu écris l'hypothèse dans le dépôt, tu continues. L'état du run vit dans le dépôt : reprise après coupure. CLI Vercel authentifié ; clé de test dans .env jamais commitée ; fournisseur d'email et clé-valeur en variables Vercel ; boîte mail de test accessible. Supprime au fil de l'eau ce qui ne sert plus.
Modèles : Fable 5 tranche ; Opus 5 ou Sonnet 5 produisent, effort auto-estimé. Doute → le fort.

# VÉRIFICATION
Vérificateur avant construction. Assertions en preview : build au vert ; grep du bundle sans aucun secret ni code ; mauvais code bloqué, bon code passe ; le mail de réinitialisation arrive réellement et fonctionne ; prompt de test à huit sections sous la limite ; persistance après rechargement. Après chaque changement, rejoue tout.

# ESCALADE
Production, domaine, suppression de données ou du projet Vercel, secret hors variables prévues, mail vers une adresse réelle hors boîte de test, dépassement du budget. Tu prépares, tu déposes, tu repars.

# SORTIE
Tous les parcours passent en preview, assertions au vert bundle et mail compris ; la production est déposée, seule, en validation. Sinon tu continues.

## D'où l'on part

- [travail] /Users/gabrielbertoli/Documents/L'Oreal/Dev Control tower/Boris-Prompt-Generator
- [pièce jointe] Attachments/generateur-prompt-agentique.jsx
- [pièce jointe] Attachments/playbook-prompt-agentique.md

## Mémoire de travail

<!-- Tenue par la session elle-même. Ce qui est écrit ICI survit à la
     fermeture de la fenêtre ; ce qui ne reste que dans la conversation est
     perdu. Décisions prises et pourquoi, pistes fermées (pour ne pas les
     rouvrir), état d'avancement, pièges rencontrés. -->

- Ouvert le 2026-08-01. **Livré et en production le jour même** :
  https://boris-prompt-generator.vercel.app
- L'état fait foi dans **`ETAT.md`** (où ça en est, ce qui reste, la reprise)
  et **`DECISIONS.md`** (chaque arbitrage et son motif). Une reprise se fait
  en les lisant — pas en refaisant le chemin.
- **Deux techniques depuis le 2026-08-23** — méthode Boris et boucle du
  gantelet (Matt Shumer / RoboNuggets, CC BY 4.0), motivées dans
  `DECISIONS.md` § 27. La règle qui les tient : **aucune règle de méthode
  n'est écrite dans l'écran**. Chaque technique remplit le contrat de
  `src/techniques.js` (longueur, étapes, oracle, grille du juge, textes
  d'écran) et `App.jsx` ne manipule qu'un objet `T`. Trois pièges déjà payés
  ailleurs et fermés ici : une limite par technique (un curseur partagé fait
  hériter le réglage de l'autre), aucune clé de critère commune aux deux
  grilles du juge (elles se reconstruisent PAR CLÉ), et la technique
  enregistrée sur l'entrée de bibliothèque (sinon un prompt rouvert est
  mesuré contre la méthode de l'autre). L'attribution CC BY vit dans
  `src/gauntlet.js` et dans l'aide, tenue par une assertion.
- **Le gantelet écrit autour de 2500 caractères depuis le 2026-08-26**
  (`DECISIONS.md` § 29), et la leçon tient en une phrase : **sa longueur se
  règle en MOTS, jamais en caractères seuls**. Monter le plafond sans monter la
  fenêtre de mots donne un curseur qui monte, un prompt qui ne change pas, et un
  vérificateur qui refuse en silence tout prompt vraiment plus long. Visée
  290–380 mots, fourchette 230–420, défaut 2500, plafond dur 3000, plancher
  1700 — tout dans `src/gauntlet.js`, et nulle part ailleurs. Un chiffre de
  longueur recopié à l'écran ou dans une assertion est une bombe à retardement
  VERTE : sept l'ont été, tous supprimés ce jour-là.
- **Deux instruments de vérification**, et le skill `/verify` du dépôt
  (`.claude/skills/verify/SKILL.md`) dit lequel prouve quoi :
  1. `npm run verify` — **290 assertions en local** au 2026-08-26 (112 au
     2026-08-02), au vert
     (les parcours d'accès s'y ajoutent quand `BASE_URL` est fourni : 122
     sur la production le 2026-08-01). Rien ne se déclare sans l'avoir
     rejoué. **Mais il n'exerce aucun palier responsive** : il force la
     largeur du document et les media queries s'évaluent sur le vrai
     viewport (`DECISIONS.md` § 18).
     Piège d'ENVIRONNEMENT, mesuré le 2026-08-02 : la sonde utilise le
     **profil Chrome par défaut** (un profil jetable fait pendre
     `--dump-dom`). Quand le Chrome de Gabriel est ouvert et occupé, le
     lancement headless passe de quelques secondes à plus de 60 s, et les
     deux surfaces échouent sur « Chrome n'a pas rendu la main » — c'est
     l'environnement, pas le code, et allonger le délai n'y change rien
     (essayé à 240 s). Les assertions Node ne dépendent de rien : elles
     restent la preuve utilisable dans ce cas.
  2. Le pilotage réel (Playwright, `channel: "chrome"`, installé hors du
     dépôt) — le seul qui prouve un parcours au clic et les paliers
     mobiles. C'est lui qui a trouvé le débordement de 15 px à 320 px.
- Deux règles de produit posées le 2026-08-02, motivées dans `DECISIONS.md`
  § 19 et § 20 : **aucun prompt au-dessus de 3950 caractères ne sort de
  l'atelier** (plafond dans `verifyPrompt`, pas dans le réglage), et **tout
  prompt affiché porte son bouton copier**. Le fil de correction est passé
  au bord gauche (le pupitre), la casse est redevenue un tiroir.
- Un seul chantier reste ouvert, et il n'appartient pas à l'agent : l'envoi
  du mail de réinitialisation, suspendu à une clé Resend de la main de
  Gabriel — voir `ETAT.md`, § « Ce qui reste ouvert ».
- Piste fermée, ne pas la rouvrir : la protection SSO de Vercel **ne revient
  pas** après un déploiement. Une consigne antérieure prescrivait de la
  redésactiver à chaque fois ; c'est faux, mesuré le 2026-08-01.
