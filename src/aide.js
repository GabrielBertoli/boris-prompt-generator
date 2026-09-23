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

import { VISEE } from "./gauntlet.js";
import { SECTIONS as SECTIONS_HOOKS, PLACEMENTS, CROCHETS_MIN, CROCHETS_MAX, DERNIERE_LIGNE } from "./crochets.js";
import * as opus55 from "./opus55.js";

/* La longueur annoncée du prompt de gantelet vient de la fenêtre visée,
   jamais d'un chiffre écrit à la main : « environ 170 mots » est resté
   vrai jusqu'au 2026-08-26 et faux le lendemain, alors que le seul
   endroit qui décide de la longueur avait changé (`gauntlet.js`). */
const MOTS_TYPE = Math.round((VISEE.lo + VISEE.hi) / 2);
const MOTS_OPUS55 = Math.round((opus55.VISEE.lo + opus55.VISEE.hi) / 2);

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

/* Les sept mouvements du prompt produit par la boucle du gantelet.
   Même rôle que `SECTIONS_BORIS` pour l'autre technique, et même
   contrôle : les quatre qui sont des phrases LITTÉRALES du prompt sont
   comparées à l'exemple de référence, pour qu'aucune ne puisse être
   annoncée ici après avoir disparu de la méthode. */
export const MOUVEMENTS_GANTELET = [
  ["Ce qu'on construit", "Le but, en une ou deux phrases, avec ce qui compte pour toi. Ni découpage, ni technologie, ni plan : l'agent décide mieux que tu ne peux le décider avant qu'il ait commencé."],
  ["La barre, c'est…", "La référence réelle qu'il doit battre, nommée et allable-chercher, avec l'ordre de se comparer à la vraie chose et jamais à une description d'elle."],
  ["Constructeur et critique", "Le travail est coupé en petits morceaux jugeables séparément. Sur chacun, celui qui construit et celui qui juge sont DEUX agents, et le juge démarre de zéro : il ne sait pas combien l'autre a peiné."],
  ["Le critique est dur.", "Le compliment ne sert à rien. Le juge met les deux côte à côte, étiquettes retirées, dit lequel est le meilleur et nomme le seul plus gros manque. Un choix, jamais une note sur 10 — une note remonte toute seule à chaque tour."],
  ["/loop … à l'aveugle", "La boucle recommence tant que le tien ne gagne pas. C'est la seule sortie possible, avec le moment où tu arrêtes toi-même : jamais « au bout de trois fois »."],
  ["Une page d'avancement", "Une page qui se met à jour pendant que ça travaille, pour que tu puisses regarder sans interrompre."],
  ["Déploie des sous-agents et ultracode.", "La dernière ligne, toujours. Elle demande à l'agent de lancer ses constructeurs et ses juges en parallèle plutôt qu'un par un."],
];

/* Les cinq sections du prompt produit par la pile de crochets. Les
   titres viennent de la technique elle-même (`crochets.js`), jamais
   recopiés : une assertion vérifie que ce sont ceux que le méta-prompt
   impose, comme pour les huit de Boris. */
export const SECTIONS_CROCHETS = [
  [SECTIONS_HOOKS[0], "Ce que l'agent voit et peut faire, en liste finie : le dépôt, les outils, les comptes, les boîtes et clés de test. Rien n'existe en dehors de cette liste — ce qu'il a fait, c'est exactement les appels qu'il a passés."],
  [SECTIONS_HOOKS[1], "Ce qui est ABSENT de son monde : la mise en ligne, l'argent, un envoi à une vraie personne, une suppression, un secret. Pas une interdiction — une absence. Une règle écrite en prose tient presque toujours et lâche le jour où elle compte ; une chose absente ne peut pas être appelée."],
  [SECTIONS_HOOKS[2], `${CROCHETS_MIN} à ${CROCHETS_MAX} règles numérotées, chacune accrochée à UN geste précis (écrire un fichier, envoyer un mail, rendre la main), avec un placement — ${PLACEMENTS.map(([p]) => p).join(", ")} — et une décision. Le premier enveloppe tous les autres : rien en dessous ne peut le contourner. Le premier voit tout et journalise, refus compris ; un autre rejoue la vérification avant de rendre la main.`],
  [SECTIONS_HOOKS[3], "Le travail lui-même, ce qui se passe quand aucune règle n'intercepte : le but, les événements réels du métier qui déclenchent le travail, et « chaque cassure est ton chantier suivant ». Jamais une liste de tâches."],
  [SECTIONS_HOOKS[4], `Quand il a fini, vérifiable, verrouillé des deux côtés. Se termine toujours par « ${DERNIERE_LIGNE} »`],
];

/* Les cinq mouvements du prompt produit par la méthode Opus 5.5. Les
   phrases littérales viennent de `opus55.js`, jamais recopiées : une
   assertion vérifie qu'elles sont dans l'exemple de référence. */
export const MOUVEMENTS_OPUS55 = [
  ["La tâche entière", "Tout le travail en un seul message : ce qu'on fait, sur quoi, et le livrable FINI — le fichier, la branche, la page — jamais un plan ou un brouillon à reprendre."],
  [opus55.FINI, "La ligne d'arrivée : deux à cinq critères qu'on peut constater — les tests passent, chaque élément est traité, le fichier existe. Jamais « quand c'est bien » : un modèle qui ne sait pas quand il a fini s'arrête trop tôt ou s'arrête pour te demander."],
  [opus55.ARRETE + "…", `Les arrêts nommés, en deux phrases fixes. « ${opus55.CONTINUE} » Puis « ${opus55.ARRET} » suivi des gestes qui engagent dans ce travail-là — supprimer des données, forcer un push, mettre en ligne, envoyer à quelqu'un. Un autre arrêt n'entre que si tu l'as demandé.`],
  ["Les clauses du type", "Seulement celles qui s'appliquent à ce travail-là : une liste de tâches dans un fichier pour un long run, des sous-agents dont on vérifie les preuves pour un audit, les styles exclus nommément pour du design, ce qui n'a pas pu être confirmé pour une recherche, ce qui bloquerait la fusion pour une revue."],
  [opus55.DERNIERE_LIGNE, "La dernière ligne, toujours. Quand le travail se termine, ce qui t'attend — une décision laissée ouverte, un changement à valider — se lit en premier."],
];

const RAW_CHAPITRES = [
  {
    cle: "porte",
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
    cle: "techniques",
    titre: "Les quatre techniques",
    sert: "Choisir, avant d'écrire, laquelle des quatre méthodes correspond à ce que tu confies.",
    points: [
      "La méthode Boris écrit un mandat long — huit sections — pour un agent qui fait tourner quelque chose et découvre son travail là où ça casse. C'est ce qu'il te faut pour une application, un service, un algorithme : un périmètre à couvrir.",
      `La boucle du gantelet écrit un mandat d'un seul tenant — environ ${MOTS_TYPE} mots, sans la moindre section — pour un agent qui vise une chose qui existe déjà et recommence jusqu'à faire mieux qu'elle. C'est ce qu'il te faut quand tu vises une qualité et non un périmètre : une page, un texte, un outil, une analyse.`,
      `La pile de crochets écrit un mandat de garde — cinq sections, ${CROCHETS_MIN} à ${CROCHETS_MAX} règles numérotées — pour un agent dont ce qui compte le plus est ce qu'il ne doit PAS faire : données réelles, argent, envois, mise en ligne. Chaque règle est accrochée au geste qu'elle gouverne, et ce qui lui est interdit n'est pas une consigne : c'est absent de son monde.`,
      `La méthode Opus 5.5 écrit un message court — environ ${MOTS_OPUS55} mots, d'un seul tenant — qui confie une tâche bornée à Claude Opus 5.5 : une migration, un audit, une page, un document. Elle dit ce que « fini » veut dire, quand continuer sans toi et quand s'arrêter, et rien d'autre que les consignes utiles à ce type de travail.`,
      "La différence tient à un mot : où est la preuve. Chez Boris elle est DANS le mandat — des contrôles que l'agent se donne. Au gantelet elle est DEHORS — une chose réelle, déjà bonne, que l'agent doit aller chercher et battre. Aux crochets elle est dans l'ORDRE — la première règle enveloppe toutes les autres, et rien en dessous ne peut la contourner. Avec Opus 5.5 elle est dans la LIGNE D'ARRIVÉE — ce qu'on pourra constater quand ce sera fini.",
      "Le choix se fait au-dessus de ton idée, avant de lancer. Il se verrouille dès qu'un prompt est à l'écran : changer de technique sous un prompt déjà écrit reviendrait à le juger avec les règles de l'autre. « Nouveau prompt » rouvre le choix.",
      "La boucle du gantelet est une technique de Matt Shumer, empaquetée en skill par RoboNuggets et reprise ici en français, sous licence CC BY 4.0. Elle n'est pas de nous, et elle est citée partout où elle est utilisée. Une seule chose a été changée par rapport au skill d'origine, et la licence demande de le dire : le mandat produit est plus long que les 120 à 180 mots qu'il prescrit.",
      "La pile de crochets est transposée des « Function Hooks » de Claude Code, une proposition d'architecture d'Anthropic mise en discussion publique le 3 septembre 2026 (Alice Poteat, issue GitHub anthropics/claude-code n° 91870) et non livrée à ce jour. Ce n'était pas une technique de prompt : c'est une façon de brancher des règles sur un outil. Ce qui en est repris, c'est l'idée — un monde fini, des capacités retirées plutôt qu'interdites, des règles accrochées à des gestes, un ordre qui est une autorité.",
      "La méthode Opus 5.5 est tirée du guide d'Anthropic « Getting the most out of Opus 5.5 in Claude and Claude Code » (Addy Osmani, claude.dev, 22 septembre 2026). Elle contredit sur un point les méthodes Boris et crochets, et c'est voulu : elles interdisent « ne t'arrête pas » comme consigne devenue inutile, alors que le guide dit qu'Opus 5.5 s'arrête parfois pour rendre compte et qu'il faut lui nommer les arrêts voulus.",
    ],
  },
  {
    cle: "questions",
    titre: "Ce qu'on te demande avant d'écrire",
    sert: "Une seule étape, deux formes : des questions (Boris, crochets, Opus 5.5) ou le choix d'une barre (gantelet).",
    points: [
      "Avec la méthode Boris : trois questions au maximum, et seulement si la réponse change matériellement ce qui va être écrit. Souvent il n'y en a aucune — c'est bon signe, ton idée se suffisait. Une réponse laissée vide sera tranchée par l'hypothèse la plus raisonnable, écrite noir sur blanc dans le résultat.",
      "Avec la boucle du gantelet : deux ou trois références te sont proposées, tu en choisis une, ou tu écris la tienne. Si ton idée en nommait déjà une, rien ne t'est demandé.",
      "Avec la pile de crochets : mêmes questions que chez Boris, trois au plus, mais elles portent sur le monde de l'agent — ce qu'il a sous la main — et sur ce qui, dans ton domaine, engage pour de bon et doit lui être retiré.",
      "Avec la méthode Opus 5.5 : deux questions au plus, et seulement si l'on ne peut pas deviner à quoi on verra que c'est fini, ou sur quoi l'agent travaille. Le type de travail, les consignes utiles, les styles à exclure : l'atelier les tranche sans te les demander.",
      "Une bonne référence tient à trois choses : elle est PRÉCISE (« la page tarifs de Stripe », pas « les beaux sites »), on peut vraiment aller la chercher (la capturer, la lire, l'exécuter), et on peut poser les deux côte à côte pour en désigner une.",
      "Prends la plus dure que l'agent puisse réellement atteindre. Une référence trop facile fait gagner au premier tour et la boucle s'arrête sans avoir servi ; une référence floue fait tout approuver, parce que le juge finit par l'inventer.",
      "Il n'y a pas de mauvaise réponse courte. Trois mots valent mieux qu'un paragraphe : ce sont des points de décision, pas un questionnaire.",
    ],
  },
  {
    cle: "marbre",
    titre: "Le prompt — au centre",
    sert: "La pièce elle-même : le texte que tu vas donner à ton agent, et les gestes qu'on fait dessus.",
    points: [
      "Le texte s'écrit sous tes yeux pendant qu'il arrive. Une attente d'une minute reste lisible au lieu de ressembler à un blocage.",
      "Copier le prompt — c'est le geste principal : ce texte se colle tel quel dans l'outil où vit ton agent.",
      "Sauvegarder le range dans la casse. En pratique il s'y range tout seul dès la première correction : rien ne se perd faute d'avoir cliqué.",
      "Télécharger .md pour un fichier chez toi, Imprimer pour une feuille propre en noir sur blanc.",
      "Rejuger redemande un avis au juge sur la version affichée, sans rien régénérer.",
      "Un prompt ne se juge pas sur le papier. La note du juge est un avis avant l'épreuve du feu : lance-le pour de bon, et laisse les deux premiers jours te dire ce qu'il fallait corriger.",
    ],
  },
  {
    cle: "epreuve",
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
    titre: "Méthode Boris — les huit sections",
    sert: "La structure du prompt produit par la méthode Boris, et à quoi sert chaque section.",
    points: [
      "Un prompt de la méthode Boris tient en huit sections, toujours les mêmes, toujours dans cet ordre. Elles décrivent un mandat, pas un cahier des charges : le but, les garde-fous, le moyen de vérifier, et le moment de s'arrêter.",
      "C'est court volontairement — moins de 3950 caractères. Un mandat long n'est pas un mandat plus clair : il devient une liste de tâches, et l'agent cesse de décider.",
      "Le prompt ne contient rien d'autre que ces huit sections. Pas de consignes de comportement (« ne t'arrête pas », « journalise en détail ») : les modèles d'aujourd'hui font ça d'eux-mêmes, et chaque phrase inutile dilue les sept qui comptent.",
    ],
    sections: SECTIONS_BORIS,
  },
  {
    cle: "gantelet",
    titre: "Boucle du gantelet — les sept mouvements",
    sert: "La structure du prompt produit par la boucle du gantelet, et à quoi sert chaque mouvement.",
    points: [
      "Un prompt du gantelet tient en sept mouvements, en phrases pleines, sans titre ni puce. S'il avait besoin d'un titre pour rester lisible, c'est qu'il serait trop long.",
      `Il vise autour de ${MOTS_TYPE} mots : assez pour poser les sept mouvements en entier, pas assez pour devenir une liste de tâches. Toute sa force tient dans la référence à battre — le reste n'est que l'échafaudage qui oblige à s'y comparer pour de vrai.`,
      "Rien d'autre n'y entre : ni architecture, ni découpage, ni technologie, ni nombre de tours. Chaque instruction en trop est une décision retirée à l'agent, et il décide mieux une fois le travail commencé.",
      "Les deux dernières lignes parlent à Claude Code : « /loop » relance tant que tu n'arrêtes pas, « ultracode » autorise le travail à plusieurs agents en parallèle. Avec un autre agent, elles se remplacent par la même consigne en français.",
    ],
    sections: MOUVEMENTS_GANTELET,
  },
  {
    cle: "crochets",
    titre: "Pile de crochets — les cinq sections",
    sert: "La structure du prompt produit par la pile de crochets, et à quoi sert chaque section.",
    points: [
      "Un prompt de la pile de crochets tient en cinq sections, toujours les mêmes, toujours dans cet ordre : le monde, ce qui en est retiré, les crochets, le fond, la sortie. Il décrit un garde autant qu'un mandat.",
      `Chaque crochet tient sur une ligne : « N. sur <geste> — <placement> : <décision> ». Le geste est nommé comme un événement (fs.write, mail.send, session.stop) ; le placement dit QUAND la règle agit — ${PLACEMENTS.map(([p, quoi]) => `${p} (${quoi})`).join(" ; ")}.`,
      "L'ordre est l'autorité : le crochet n° 1 enveloppe tous les autres, comme des pelures d'oignon. C'est pour ça que le journal (« sur * ») est toujours le premier — placé plus bas, il ne verrait pas les refus décidés au-dessus de lui.",
      "Rien d'autre n'y entre : ni architecture, ni pile technique, ni consigne de comportement. Le crochet qui voit tout journalise déjà ; chaque instruction en trop est une décision retirée à l'agent.",
    ],
    sections: SECTIONS_CROCHETS,
  },
  {
    cle: "opus55",
    titre: "Méthode Opus 5.5 — les cinq mouvements",
    sert: "La structure du message produit par la méthode Opus 5.5, et à quoi sert chaque mouvement.",
    points: [
      `Un prompt Opus 5.5 tient en cinq mouvements, en phrases pleines, sans titre ni puce, autour de ${MOTS_OPUS55} mots. Il se lit comme un message envoyé à quelqu'un de compétent : la tâche, ce que fini veut dire, quand s'arrêter, puis ce qu'on attend en retour.`,
      "Rien de ce que le modèle fait déjà n'y entre. Pas de « réfléchis bien » ni d'« étape par étape » : Opus 5.5 pense avant chaque réponse, et la ligne ne fait que ralentir. Pas de demande de montrer son raisonnement : c'est une demande que le modèle peut refuser, et la conversation peut basculer sur un modèle plus ancien.",
      "Pour du design, jamais « évite un look générique » : ça remplace un style par défaut par un autre. Le message nomme ce qu'il ne veut pas voir — fond crème, italiques dans les titres, « 01 / 02 / 03 », boutons en pilule. Si ce qu'il choisit à la place ne te plaît pas, ajoute-le à la liste dans le fil de correction.",
      "Le message se colle tel quel dans Claude Code ou dans l'app Claude, avec Opus 5.5 choisi dans le sélecteur de modèle. La règle des arrêts peut aussi vivre dans le CLAUDE.md du projet : elle vaut alors pour toutes les tâches.",
    ],
    sections: MOUVEMENTS_OPUS55,
  },
  {
    cle: "securite",
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

/* Le numéro n'est plus écrit à la main : il se DÉDUIT du rang. Il était
   sur chaque chapitre, en dur, et insérer un chapitre au milieu obligeait
   à renuméroter les suivants — un numéro oublié n'aurait rien cassé, il
   aurait juste menti, ce qui est pire dans une aide. */
export const CHAPITRES = RAW_CHAPITRES.map((c, i) => ({
  ...c,
  num: String(i + 1).padStart(2, "0"),
}));

/* Le pied de page. Écrit ici et non dans le balisage : la mention légale
   et la note de sécurité sont du contenu, elles se relisent et se
   vérifient comme le reste. */
export const PIED = {
  proprietaire: "Gabriel Bertoli",
  marque: "Atelier Boris",
  annee: 2026,
  droits: "Tous droits réservés.",
  /* Deux longueurs, et ce n'est pas un doublon. Le pied de page est un
     bandeau d'une ligne : la note complète y prenait trois lignes et
     110 px de haut — à elle seule la moitié de ce qui faisait dépasser
     l'écran. La version courte s'affiche, la longue reste dans
     l'infobulle et surtout dans l'aide, là où on la lit vraiment.
     Un pied de page MENTIONNE ; l'aide explique. */
  securiteCourte: "Clé API dans ton navigateur · codes en empreinte · prompts privés.",
  securite:
    "Ta clé API ne quitte jamais ce navigateur et les appels partent en direct. " +
    "Les codes d'accès sont conservés sous forme d'empreinte irréversible, jamais en clair. " +
    "Tes prompts ne sont visibles que par toi.",
};
