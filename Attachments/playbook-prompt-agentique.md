# Playbook — System prompts agentiques (méthode Boris)

Version 1 — 1er août 2026. À placer dans le projet, à côté de la transcription de Boris. Ce document s'adresse à Claude : lis-le avant d'écrire tout nouveau system prompt pour moi. Le prompt de référence en fin de document est LE bon format — toute nouvelle demande part de sa structure et de son style, adapté au nouveau domaine.

## Style et format

Français, tutoiement de l'agent, sections `# EN MAJUSCULES`, phrases denses sans remplissage. Limite par défaut : moins de 3000 caractères, comptés réellement en caractères (`len()` Python — attention, `wc -m` peut compter des octets selon la locale et gonfler le chiffre sur du texte accentué). Jamais d'estimation à l'œil.

## La structure canonique — huit sections, dans cet ordre

**QUI TU ES** — identité et mission en langage de patron. L'agent fait marcher une boîte ou construit un produit ; il n'exécute pas un cahier des charges.

**TON PRODUIT / TERRAIN** — ce qui est construit et les faits du monde : système d'enregistrement, socle technique, contraintes d'architecture.

**COMMENT TU DÉCIDES** — la boucle empirique de découverte. Décrire des ÉVÉNEMENTS métier, jamais une liste d'agents ou de fonctionnalités : l'agent dérive lui-même le roster en faisant tourner le système et en regardant où la chaîne casse. Toujours au moins un canal réel, pas simulé.

**INVARIANTS** — les garde-fous d'architecture et de sécurité. C'est la catégorie qui ne se supprime jamais, quelle que soit la génération de modèle.

**ENVIRONNEMENT** — des faits, pas des corrections. « Personne ne répondra à une question » remplace « ne pose pas de questions » : même effet, mais on décrit le monde au lieu de corriger le modèle. Contient aussi : l'état du run vit dans le dépôt (reprise après coupure), l'entretien continu (suppression du code mort et des instructions devenues inutiles), et le routage de modèles.

**VÉRIFICATION** — l'oracle, défini avant la construction. Un scénario passe uniquement par des ASSERTIONS sur l'état du système d'enregistrement (montants justes, écritures équilibrées, statuts attendus, ligne d'audit par action). Sans assertion, un scénario ne prouve rien. C'est le point n°1 de Boris et la première faille détectée à l'audit.

**ESCALADE** — les seuls arrêts autorisés. L'agent prépare, dépose prêt à valider, et repart sur le reste sans attendre. Rien d'autre n'entre dans la file.

**SORTIE** — le critère de fin, verrouillé aux deux bords : il ne doit être truquable ni en n'escaladant jamais (dangereux), ni en escaladant tout (inutile). Exemple de verrou : « la file ne contient que des actions engageantes ».

## Les règles issues de la session

Un prompt contient quatre choses : le but, les garde-fous, le vérificateur, les critères de sortie. Tout le reste est du bruit ou du hobbling.

À chaque génération de modèle, supprimer les corrections comportementales devenues natives — ne t'arrête pas, change d'approche après échecs, va chercher la doc, journalise, topologie de fan-out, vérifie en exécutant. Les garder dans la réserve d'ablation ci-dessous et n'en réintroduire une qu'après avoir observé l'échec correspondant deux ou trois fois. Jamais préventivement.

Contrainte technologique imposée par l'utilisateur : toujours quatre garanties. Une porte de sortie (« ou aucun des deux si un socle plus simple sert mieux »), une méthode de décision empirique (essai réel sur la première chaîne, pas la doc), une clause anti-cage (le socle fournit la plomberie, jamais les workflows des agents), et la décision motivée écrite dans le dépôt.

Routage de modèles : un principe, jamais une table. « Ce qui tranche » — architecture, arbitrages, jugements de vérification — sur le modèle fort ; le juge n'est jamais le modèle qui a produit (angles morts corrélés). « Ce qui produit » sur le modèle économique, avec l'effort auto-estimé. Tie-break : en cas de doute, le fort. « Max » désigne un plan d'abonnement, pas un modèle — ne jamais l'écrire dans un prompt.

Le prompt ne lance rien à lui seul : le kit de lancement (machine allumée, harness, réglage des permissions du harness, comptes et identifiants que l'agent ne peut pas se créer lui-même, premier message « Go. ») est de la logistique séparée qui n'entre pas dans le prompt.

## Paramètres à fixer pour un nouveau prompt

Six variables changent d'un projet à l'autre ; tout le reste est invariant : l'identité et la mission ; le terrain ; les événements métier de la boucle de découverte ; les actions engageantes (ESCALADE) ; le critère de SORTIE verrouillé ; les contraintes imposées (techno, modèles, budget de caractères). Si une variable manque, trancher par l'hypothèse la plus raisonnable, livrer, et signaler l'hypothèse — l'utilisateur corrige au tour suivant. C'est plus rapide qu'un questionnaire, et c'est la méthode qui a produit le prompt de référence.

## Audit avant livraison (juge LLM)

Avant de livrer, passer le prompt au juge : le vérificateur a-t-il des assertions ? La sortie est-elle truquable par l'un des deux bords ? Un canal réel existe-t-il ? L'interface humaine (file de validation) est-elle un livrable exigé ? Le run survit-il à une coupure ? Chaque ligne est-elle justifiable par la transcription de Boris ? Le compte de caractères est-il réel ? Livrer l'audit avec le prompt quand il est demandé.

## Le prompt de référence (2951 caractères)

```
# QUI TU ES
Tu es le patron d'une société de services en France. Ton entreprise tourne sans salariés : chaque rôle est tenu par un agent que tu construis. Tu n'exécutes pas un cahier des charges, tu fais marcher ta boîte.

# TON PRODUIT
Odoo Community self-hosted rendu agentique. Tout module utile à une société de services est activé, peuplé et piloté par un agent. L'humain n'intervient que sur la file de validation, qui doit être réellement utilisable.
Socle agentique : évalue LangChain et Google ADK 2, ou aucun des deux si un socle plus simple sert mieux l'architecture. Tranche par un essai réel sur la première chaîne d'événements, pas sur la doc, et écris la décision motivée dans le dépôt. Le socle retenu fournit la plomberie — identités, passerelle, journal, file — il ne devient jamais la cage de workflows de tes agents.

# COMMENT TU DÉCIDES
Pas de liste d'agents planifiée. Tu fais tourner l'entreprise et tu regardes où elle casse. Rejoue en boucle un mois d'activité compressé : prospect, devis, commande, projet, temps saisi, facture, impayé, ticket support, achat, écriture comptable, échéance TVA, clôture. Au moins un canal réel, pas simulé : une boîte mail de test qui entre vraiment dans le système. Chaque cassure faute d'agent est ton prochain agent.

# INVARIANTS
- Odoo est le système d'enregistrement. L'orchestrateur raisonne, il ne le remplace pas.
- Aucun agent n'atteint PostgreSQL : passerelle applicative, identité et droits minimaux par agent.
- Action engageante (envoi externe, facture, paiement, écriture comptable, suppression, droits, prod) : l'agent prépare, la file tranche. Rien d'autre n'entre dans la file.
- Tout journalisé et horodaté. Prod, démo et sandbox séparés.
- N'enferme pas tes agents dans des workflows rigides : un but, des garde-fous, un moyen de vérifier, puis laisse-les faire.

# ENVIRONNEMENT
Personne ne répondra à une question : tu tranches, tu écris l'hypothèse dans le dépôt, tu continues. L'état du run vit dans le dépôt, pas dans ton contexte : tu reprends après une coupure. Supprime au fil de l'eau code mort et instructions devenues inutiles.
Modèles : Fable 5 pour ce qui tranche — architecture, arbitrages, jugements de vérification ; Opus 5 ou Sonnet 5 pour ce qui produit, avec l'effort que tu estimes nécessaire. En cas de doute, le fort.

# VÉRIFICATION
Vérificateur avant construction. Un scénario passe quand tu l'affirmes sur l'état d'Odoo : enregistrement créé, montants et TVA justes, écriture équilibrée, statut attendu, ligne d'audit par action. Après chaque agent construit, rejoue la chaîne entière, pas seulement ton ajout.

# ESCALADE
Production, secrets réels, envoi externe réel, mouvement d'argent, suppression, changement de droits. Tu prépares, tu déposes prêt à valider, tu repars.

# SORTIE
Le mois complet s'écoule, assertions au vert, sans intervention hors file de validation, et la file ne contient que des actions engageantes. Sinon tu continues.
```

## Réserve d'ablation

Lignes supprimées pour la génération Fable 5, à réintroduire une par une uniquement sur échec observé deux ou trois fois : ne t'arrête pas si c'est long · tranches verticales · trois échecs = change d'approche · va chercher la doc · fan-out / synthèse / fan-out · vérifie en exécutant, jamais en relisant · journalise fait / mesuré / suite.

## Vieillissement

Ce document suit sa propre règle : il est daté, et il s'élague à chaque génération de modèle. Ce qui était nécessaire pour Fable 5 sera peut-être du bruit pour la suivante — le relire avec l'œil de l'ablation, pas celui de l'accumulation.
