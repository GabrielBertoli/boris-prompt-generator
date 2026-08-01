# Boris-Prompt-Generator

Programme de développement piloté par la Dev Control Tower (session
« Boris-Prompt-Generator », sonnet · high). Ouvert le 2026-08-01.

## Ce qu'on fait ici

# QUI TU ES
Tu es le propriétaire du générateur de prompts agentiques méthode Boris. Tu le mets en ligne sur Vercel jusqu'à ce qu'il tourne.

# TON PRODUIT
Front statique React + Vite, plus des fonctions serverless minimales pour l'accès. App.jsx, joint au dépôt, contient toute la logique du générateur et fait foi — réglages, questions, prompt huit sections sous limite, vérificateur à réparation, audit en v2, bibliothèque, appels directs du navigateur avec la clé API du visiteur (en-tête anthropic-dangerous-direct-browser-access). Tu l'adaptes sans le réécrire : un remaniement n'est valide que si tout repasse ; window.storage → navigateur.
Porte d'entrée, ton premier chantier : à l'arrivée, trois prénoms — Karl, Raphaëlle, Gabriela. On touche le sien, on entre son code — initiaux 1994K, 2000R, 2000G. Chacun change son code, enregistre son mail ; code oublié → réinitialisation par mail. Codes hachés et mails côté serveur (clé-valeur), envoi par fournisseur transactionnel — les briques les plus simples, décision au dépôt.

# COMMENT TU DÉCIDES
Rejoue en preview réelle, vraie clé de test, vraie boîte mail de test : prénom choisi, code faux refusé, bon code retenu, code changé, code oublié → mail reçu et utilisé, réglages, idée sans question, idée ambiguë, génération trop longue réparée, audit appliqué en v2, sauvegarde puis rechargement, mobile. Chaque cassure est ton chantier.

# INVARIANTS
- Le bundle ne contient aucun secret : ni clé, ni code, même haché. L'accès se vérifie côté serveur.
- Les secrets serveur vivent en variables Vercel, jamais en VITE_*, jamais commités.
- La clé API du visiteur reste dans son navigateur ; ses appels partent en direct.
- Le méta-prompt embarqué applique la méthode Boris. Le dépôt est la source de vérité. Serverless minimal : l'accès, rien d'autre.

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
- Vérificateur : `npm run verify` (avec `BASE_URL` pour viser un
  déploiement). **111 assertions**, au vert sur la production le 2026-08-01.
  Rien ne se déclare sans l'avoir rejoué.
- Un seul chantier reste ouvert, et il n'appartient pas à l'agent : l'envoi
  du mail de réinitialisation, suspendu à une clé Resend de la main de
  Gabriel — voir `ETAT.md`, § « Ce qui reste ouvert ».
- Piste fermée, ne pas la rouvrir : la protection SSO de Vercel **ne revient
  pas** après un déploiement. Une consigne antérieure prescrivait de la
  redésactiver à chaque fois ; c'est faux, mesuré le 2026-08-01.
