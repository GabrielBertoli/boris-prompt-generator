/* ================================================================
   L'AIDE — l'atelier expliqué, chapitre par chapitre.

   Écrite en DONNÉES et non en JSX, pour trois raisons :

   1. Le vérificateur peut la relire sans navigateur : qu'aucun chapitre
      ne soit vide, que chacun dise à quoi sa partie SERT, et surtout que
      les huit sections annoncées soient exactement celles que le
      méta-prompt impose (`buildMeta`). Une aide qui décrit un produit
      qui n'existe plus est pire que pas d'aide.
   2. Elle se parcourt (sommaire, ancres) sans dupliquer le balisage.
   3. Le français y est celui de quelqu'un qui n'a jamais écrit un
      prompt. Les mots du métier — oracle, invariants, escalade — sont
      ce que l'atelier ÉCRIT ; ils sont expliqués ici, jamais supposés.
   ================================================================ */

/* Les huit sections du prompt produit. Les titres doivent correspondre
   EXACTEMENT à ceux qu'impose `buildMeta()` — une assertion le vérifie,
   sans quoi l'aide promettrait une structure que l'atelier ne produit
   plus. La colonne de droite est la traduction en français courant. */
export const SECTIONS_BORIS = [
  ["# QUI TU ES", "À qui tu parles et ce qu'il est. Un patron, pas un exécutant : on lui donne une mission, pas une liste de tâches."],
  ["# TON PRODUIT", "Le terrain. Ce qui est construit, et surtout où vivent les données de référence — le registre qui fait foi quand deux écrans se contredisent."],
  ["# COMMENT TU DÉCIDES", "Les événements réels du métier qui déclenchent le travail : « un colis arrive », « un client annule ». Jamais une liste de fonctionnalités — c'est ce qui arrive qui dicte quoi construire."],
  ["# INVARIANTS", "Ce qu'il n'a pas le droit de faire, quoi qu'il arrive. Un seul registre de référence, aucun accès direct aux données, tout ce qui engage passe par toi, tout est tracé."],
  ["# ENVIRONNEMENT", "Les faits de son monde : personne ne répondra à ses questions, il tranche et écrit son hypothèse ; son travail survit à une coupure ; quel modèle il utilise et quand il monte d'un cran."],
  ["# VÉRIFICATION", "Comment on saura que c'est réussi — écrit AVANT de construire. Pas « ça marche bien » mais des contrôles précis sur l'état du système, rejoués après chaque ajout."],
  ["# ESCALADE", "Les seuls moments où il a le droit de s'arrêter pour te demander : les actions qui engagent (un paiement, un envoi, une mise en ligne). Il prépare, il dépose, il repart."],
  ["# SORTIE", "Quand il a fini. Verrouillé des deux côtés : impossible de tricher en ne demandant jamais rien, impossible de tricher en demandant tout. Se termine toujours par « Sinon tu continues. »"],
];

export const CHAPITRES = [
  {
    cle: "porte",
    num: "01",
    titre: "La porte",
    sert: "Entrer, et rester le seul à pouvoir entrer sous ton nom.",
    points: [
      "Touche ton prénom, tape ton code. Un mauvais code est refusé sans rien dire de plus — c'est voulu : un message précis renseignerait quelqu'un qui essaie au hasard.",
      "Huit essais par personne et par connexion internet, sur dix minutes glissantes. Au-delà, il faut attendre. Deux personnes sur le même Wi-Fi ont chacune leur compteur : personne ne bloque personne.",
      "Change ton code depuis Réglages dès la première visite. Un code transmis de vive voix ou par message a été vu par au moins deux personnes.",
      "Ton code n'est jamais stocké tel quel : le serveur n'en garde qu'une empreinte dont on ne peut pas revenir en arrière. Personne, pas même l'administrateur, ne peut le relire.",
    ],
  },
  {
    cle: "idee",
    num: "02",
    titre: "Ce que tu confies",
    sert: "Le point de départ : décrire, en français, le travail que tu veux confier.",
    points: [
      "Écris comme tu l'expliquerais à quelqu'un à qui tu donnes le travail. Pas de vocabulaire technique obligatoire, pas de format à respecter.",
      "Plus tu dis ce qui compte pour toi — ce qui ne doit jamais arriver, qui décide quoi, à quoi tu verras que c'est réussi — moins l'atelier aura à deviner.",
      "« Contraintes imposées » sert quand quelque chose n'est pas négociable : une technologie déjà en place, un outil que tu utilises déjà, une règle du métier.",
      "Dès que le travail démarre, cette section se replie en une ligne pour laisser la place au résultat. « Modifier » la rouvre, rien n'est perdu.",
    ],
  },
  {
    cle: "questions",
    num: "03",
    titre: "Les questions",
    sert: "Trois questions au maximum, et seulement si la réponse change vraiment le résultat.",
    points: [
      "L'atelier ne pose une question que si elle change matériellement ce qu'il va écrire. Souvent il n'en pose aucune : c'est bon signe, ton idée se suffisait.",
      "Tu peux laisser une réponse vide. L'atelier tranchera par l'hypothèse la plus raisonnable et l'écrira noir sur blanc dans le résultat — tu sauras donc ce qu'il a supposé.",
      "Il n'y a pas de mauvaise réponse courte. Trois mots valent mieux qu'un paragraphe : ce sont des points de décision, pas un questionnaire.",
    ],
  },
  {
    cle: "marbre",
    num: "04",
    titre: "Le prompt — au centre",
    sert: "La pièce elle-même : le texte que tu vas donner à ton agent, et les gestes qu'on fait dessus.",
    points: [
      "Le texte s'écrit sous tes yeux pendant qu'il arrive. Une attente d'une minute reste lisible au lieu de ressembler à un blocage.",
      "Copier le prompt — c'est le geste principal : ce texte se colle tel quel dans l'outil où vit ton agent.",
      "Sauvegarder le range dans la casse. En pratique il s'y range tout seul dès la première correction : rien ne se perd faute d'avoir cliqué.",
      "Télécharger .md pour un fichier chez toi, Imprimer pour une feuille propre en noir sur blanc.",
      "Rejuger redemande un avis au juge sur la version affichée, sans rien régénérer.",
    ],
  },
  {
    cle: "epreuve",
    num: "05",
    titre: "Le travail en cours — à droite",
    sert: "Tout ce qui se surveille pendant que ça tourne, pour ne jamais quitter le prompt des yeux.",
    points: [
      "La note du juge et son verdict, en haut : ce que vaut le prompt affiché.",
      "Le journal de la course, ligne par ligne : analyse, génération, chaque tentative et sa longueur. Si un prompt est trop long, l'atelier le resserre tout seul et le journal le montre.",
      "Le temps écoulé, et le bouton ⏹ Arrêter à côté. Il coupe pour de vrai l'appel en cours — pas au bout de la tentative suivante. Ce qui était en place reste en place : rien n'est écrasé.",
      "Ce que ça a coûté : cette génération, le juge, et ton total depuis le début.",
      "Ce que le juge reproche, quand il a trouvé quelque chose — avec un bouton pour appliquer ses corrections en une version de plus.",
      "Au-dessus de 1400 pixels de large, ce panneau tient le bord droit. En dessous, il repasse simplement sous le prompt.",
    ],
  },
  {
    cle: "note",
    num: "06",
    titre: "La note du juge",
    sert: "Une note sur 10 qui dit ce que vaut le prompt — pas ce qu'il pèse.",
    points: [
      "Un second modèle, différent de celui qui a écrit, relit le prompt et le note. Différent volontairement : deux modèles identiques ont les mêmes angles morts.",
      "Six critères, chacun sur 10 : la structure, les événements réels, les garde-fous, les contrôles de réussite, la fin du travail, et l'économie du texte. « ⋯ » les déplie.",
      "La note globale n'est pas la moyenne : elle ne dépasse jamais de plus de 2 points le plus faible des six. Un prompt sans moyen de vérifier le résultat n'est pas un bon prompt, même si tout le reste est excellent.",
      "La jauge porte son barème peint à demeure : rouge sous 6, orange de 6 à 8, vert au-delà. On voit donc où tombe un 7,5 et de combien il s'en faut.",
      "La note est enregistrée avec le prompt : elle est là à la réouverture, sans repayer un appel.",
      "Sous 6, refais-le. Entre 6 et 8, il est utilisable mais troué — lis ce que le juge reproche. Au-dessus de 8, tu peux le lancer tel quel.",
    ],
  },
  {
    cle: "fil",
    num: "07",
    titre: "Le fil de correction — à gauche",
    sert: "Là où tu demandes des changements, et où l'histoire de chaque version est gardée.",
    points: [
      "Écris en français ce qu'il faut changer — « durcis les garde-fous », « cite mon outil de facturation », « allège la vérification ». L'atelier réécrit le prompt entier et le remesure.",
      "Chaque version est gardée : tu peux copier une ancienne, ou la remettre en place si la nouvelle te plaît moins.",
      "Le fil vit dans ton profil, pas dans ce navigateur : tu retrouves tes corrections sur un autre appareil.",
      "Au-delà de trois réponses, les plus anciennes sont réduites à une ligne d'état (« v3 — 3 240 caractères, noté 8,5/10 »). Tes demandes, elles, ne sont jamais coupées.",
      "Une correction repart toujours du prompt en vigueur, jamais de toute la conversation accumulée : le comportement est identique avant et après un rechargement de page.",
    ],
  },
  {
    cle: "casse",
    num: "08",
    titre: "La casse — ta bibliothèque",
    sert: "Tous tes prompts rangés, et ce qu'on peut en faire.",
    points: [
      "Le bouton ☰ en haut à gauche l'ouvre. Un clic sur un titre remet ce prompt au centre, avec tout son fil de corrections.",
      "« ⋯ » sur une fiche déplie ses gestes : renommer, dupliquer, modifier à la main, copier, télécharger, imprimer, reprendre l'idée, supprimer.",
      "Dupliquer sert à essayer une variante sans perdre l'originale.",
      "Exporter tout écrit un fichier de secours chez toi. Importer le relit, et fusionne au lieu d'écraser : réimporter deux fois le même fichier ne crée aucun doublon.",
      "Fais un export de temps en temps. Tes prompts vivent sur un service en ligne ; un fichier chez toi est la seule copie qui ne dépende de personne.",
    ],
  },
  {
    cle: "reglages",
    num: "09",
    titre: "Les réglages",
    sert: "Ton code, ton adresse, ta clé, et les deux modèles.",
    points: [
      "Changer ton code : à faire dès la première visite.",
      "Enregistrer ton adresse e-mail : elle servira le jour où la réinitialisation par mail sera branchée. Elle n'est utilisée pour rien d'autre.",
      "La clé API : l'atelier en fournit une, tu n'as rien à faire. Si tu colles la tienne, elle prend le dessus et la consommation part sur ton compte.",
      "Les deux modèles : celui qui écrit et celui qui juge. Le juge doit rester différent de celui qui écrit — c'est tout l'intérêt d'un second avis.",
      "La longueur maximale du prompt. Elle ne monte pas au-dessus de 3950 caractères, et ce n'est pas réglable : au-delà, la plupart des agents tronquent le texte sans prévenir.",
    ],
  },
  {
    cle: "cout",
    num: "10",
    titre: "Ce que ça coûte",
    sert: "Un ordre de grandeur honnête, en continu.",
    points: [
      "Chaque génération coûte quelques centimes : le modèle qui écrit, plus le juge qui relit.",
      "Trois chiffres sont affichés : cette génération, le juge, et ton total depuis le début — tous appareils confondus.",
      "C'est un ordre de grandeur au tarif public, pas une facture : les remises et les économies de cache ne sont pas modélisées. Le vrai montant est plus bas.",
    ],
  },
  {
    cle: "methode",
    num: "11",
    titre: "Ce que tu reçois — les huit sections",
    sert: "La structure du prompt produit, et à quoi sert chaque section.",
    points: [
      "Un prompt de la méthode Boris tient en huit sections, toujours les mêmes, toujours dans cet ordre. Elles décrivent un mandat, pas un cahier des charges : le but, les garde-fous, le moyen de vérifier, et le moment de s'arrêter.",
      "C'est court volontairement — moins de 3950 caractères. Un mandat long n'est pas un mandat plus clair : il devient une liste de tâches, et l'agent cesse de décider.",
      "Le prompt ne contient rien d'autre que ces huit sections. Pas de consignes de comportement (« ne t'arrête pas », « journalise en détail ») : les modèles d'aujourd'hui font ça d'eux-mêmes, et chaque phrase inutile dilue les sept qui comptent.",
    ],
    sections: SECTIONS_BORIS,
  },
  {
    cle: "securite",
    num: "12",
    titre: "Sécurité et vie privée",
    sert: "Où vont tes données, et ce que personne ne peut lire.",
    points: [
      "Ton code n'existe nulle part en clair : le serveur n'en garde qu'une empreinte irréversible.",
      "Ta clé API, si tu en poses une, reste dans ce navigateur. Les appels partent en direct vers Anthropic ; aucun serveur de l'atelier ne les relaie ni ne les voit.",
      "Tes prompts sont rangés dans ton profil et ne sont visibles que par toi. Les autres comptes ne voient rien des tiens.",
      "Le code du site ne contient aucun secret — ni clé, ni code, même sous forme d'empreinte. L'accès est vérifié côté serveur, à chaque fois.",
      "Sortir efface la clé de l'atelier de ce navigateur. Sur un ordinateur partagé, sors en partant.",
    ],
  },
];

/* Le pied de page. Écrit ici et non dans le balisage : la mention légale
   et la note de sécurité sont du contenu, elles se relisent et se
   vérifient comme le reste. */
export const PIED = {
  proprietaire: "Gabriel Bertoli",
  marque: "Atelier Boris",
  annee: 2026,
  droits: "Tous droits réservés.",
  securite:
    "Ta clé API ne quitte jamais ce navigateur et les appels partent en direct. " +
    "Les codes d'accès sont conservés sous forme d'empreinte irréversible, jamais en clair. " +
    "Tes prompts ne sont visibles que par toi.",
};
