# Méthode Opus 5.5 alignée sur la documentation officielle (2026-09-25)

Chantier : aligner la méthode (pas la réécrire) sur la page officielle « Prompting Claude Opus 5.5 »
(platform.claude.com), relue en entier à la source le 2026-09-25. À reporter dans `DECISIONS.md`
par qui tient le dépôt ; aucun commit ici.

Fichiers : `src/opus55.js` (sauf `baseConvoFor`, modifié par l'exécutant du harnais),
`src/aide.js` (partie Opus 5.5), `scripts/banc-opus55.mjs`, `scripts/verify.mjs` (section
« 1 bis 2 sexies », à la suite de celle de la méthode).

## Décisions

1. **Deux modes, jamais mêlés.** La documentation dit de laisser la consigne anti-arrêt de côté
   « in human-in-the-loop applications, where someone is there to answer », et, pour ce cas, de
   demander « a one-line statement of intent before the first tool call and a short recap at the
   end ». D'où :
   - mode SEUL (défaut) : `CONTINUE` + `ARRET`, inchangés ;
   - mode SUIVI : `INTENTION` = « Avant ta première action, dis-moi en une ligne ce que tu vas
     faire. » + `DEMANDE` = « Demande-moi mon accord avant tout geste destructeur : » suivie des gestes.
   L'oracle accepte l'un OU l'autre et refuse le mélange (« les deux modes mêlés »). `verifyPrompt`
   renvoie `mode` (`seul`, `suivi`, `mêlé`, `null`), et la réparation redicte les phrases du mode
   de la tentative.
2. **Le récapitulatif de fin est `DERNIERE_LIGNE`**, commune aux deux modes : les trois titres
   sont déjà un court récapitulatif. Pas de seconde phrase de récapitulatif (elle doublerait).
3. **`DEMANDE` et pas `ARRET` en mode suivi** : le « seulement si » de `ARRET` est de
   l'anti-arrêt ; la confirmation avant un geste risqué, elle, ne se lâche jamais (« keep your own
   confirmation step »).
4. **`ARRET` n'est pas allongé** de « ou si ce qui te bloque t'est volontairement interdit »
   (proposition de l'audit) : la consigne système verbatim (`harnais.js`) porte déjà les arrêts
   voulus et non voulus, et « si tu ne peux pas continuer sans moi » couvre ce cas sans le
   contredire. Changer la phrase aurait remis en jeu tous les bancs passés sans gain mesuré.
5. **Étape 1** : troisième manque, le MODE, demandé seulement si l'idée hésite (signaux mêlés),
   par une question fermée fixe (`QUESTION_MODE`), en dernier, dans la limite inchangée de deux.
   Sans indice : agent seul. Hypothèse : si l'arrivée et l'objet manquent déjà, le mode n'est pas
   demandé et tombe sur « seul » — le cas pour lequel la méthode est faite.
6. **Clause « plusieurs applications »** (`EXPLORE`), fidèle à l'extrait C12. « Before taking any
   action » est rendu par « Avant de modifier quoi que ce soit » : c'est ce que la documentation dit
   qu'elle fait (« look around before it changes anything »), et « avant toute action » se lirait
   contre la ligne d'intention. Sans trou : l'oracle la veut entière dès qu'elle est entamée ; sa
   pertinence (plusieurs sources, jamais une seule) est au juge. La réserve de la documentation
   (« keep untrusted content out of the records it searches ») est dans l'aide.
7. **Troisième exemple**, montré avec son idée : un point d'avancement tiré de mails, d'un
   tableur et du Drive, utilisateur qui « reste là » — mode suivi + plusieurs applications +
   document long. Le méta-prompt dit d'où viennent son mode et sa clause, et que les deux autres
   n'en héritent pas. 179 mots, 1 001 caractères.
8. **Grille du juge mise à jour par clé**, sans clé nouvelle : `arrets` (renommé « Le mode et ses
   arrêts ») juge les deux modes et leur exclusivité ; `clauses` connaît l'exploration large et sa
   condition. Toujours six critères, aucune clé commune avec les trois autres grilles.
9. **Source** : `SOURCE` (documentation) et `ORIGINE` (billet) exportés. Requalifié : l'en-tête du
   fichier, le méta-prompt (« alignée sur la documentation officielle »), « nommer les arrêts est la
   consigne qui compte le plus » (formule du billet : le levier premier est dans les réglages), les
   clauses venues du billet seul (revue, recherche, long document, sous-agents, trois titres).
   **Corrigé** : « la réponse peut basculer sur un modèle plus ancien » (méta-prompt et aide) —
   la documentation dit l'inverse : un refus `reasoning_extraction` n'est jamais rejoué sur un
   modèle de secours. **Corrigé** : l'aide disait de mettre la règle d'arrêt dans le CLAUDE.md ;
   elle dit désormais consigne système dès le lancement, jamais en cours de route, et à omettre
   quand on suit le travail.
10. **Longueurs** : aucune fenêtre ne bouge (visée 120–230, fourchette 90–300, plafond 2 600). La
    plus longue combinaison plausible (seul + plusieurs applications + recherche + document long)
    reste vers 210 mots. Les trois exemples tiennent sous le plancher du curseur.
11. **Banc** : le juge lit la page officielle en Markdown (`SOURCE.url + ".md"`, vérifié servi en
    `text/markdown`, 28 ko), plus le billet. Consigne du juge réécrite : recommandations de la
    documentation d'abord, clauses du billet jugées contre le méta-prompt, pas de reproche pour ne
    pas recopier la consigne système. `--effort-redaction low|medium|high|xhigh` (défaut : l'effort
    de l'écran), refus d'une valeur inconnue avant tout appel ; l'effort joué est écrit dans le
    rapport. Deux cas nouveaux (`suivi`, `multiapps`). Le module s'importe sans rien lancer
    (options, cas et arguments testés par `verify`). Toujours `claude -p`, jamais `--bare`, aucune
    variable `ANTHROPIC_*`.

## Hypothèses et limites

- **Rien n'a été mesuré au banc** (consigne : aucun appel de modèle). Le mode suivi, la question
  de mode et la clause d'exploration sont vérifiés par l'oracle et par assertions, pas par le juge.
  Passage suggéré, sur accord de Gabriel : `npm run banc -- --cas suivi,multiapps,migration,simple
  --effort-juge high`, puis la comparaison `--effort-redaction medium` contre `high`.
- Le méta-prompt passe d'environ 12 800 à 16 800 caractères (troisième exemple, deux modes). Le
  point de cache posé par le harnais en absorbe le coût sur les tours suivants.
- Le banc construit encore le premier message en texte nu (`IDÉE :` sans balises de texte collé) :
  il ne reproduit pas l'enveloppe du harnais. À aligner quand `harnais.js` sera figé.

## Relecture du 2026-09-25 — deux corrections

- **Faux rouge de la clause EXPLORE** (`opus55.js` ~344) : « explore largement » seul se lisait
  aussi dans une tâche de code (« explore largement le dépôt ») ; le contrôle ne se déclenche plus
  que sur l'amorce propre à la clause (`AMORCE_EXPLORE`, « explore largement avec tes outils »), qui
  exige toujours la clause entière une fois présente.
- **Faux vert du mode suivi** (`opus55.js` ~312) : un fragment abîmé de la règle de conduite « seul »
  (« … n'a pas besoin de moi, continue … ») glissé dans un prompt suivi passait inaperçu ; `signeSeul`
  reconnaît désormais ce marqueur, et le mélange est refusé (mode « mêlé »).

## Banc du 2026-09-25 — effort de rédaction et trois cas rouges

**Effort.** Même banc de dix cas, juge Opus 5.5 `high` contre la documentation : rédaction
`medium` 7/10 conformes, `high` 5/10. `ROLES.redaction.effort` (et donc les questions, même
conversation) passe à `medium` (`EFFORT_CONVERSATION`, `meta.js`) ; commentaire de `ROLES`, aide
et en-tête du banc mis à jour. Aucune assertion ne figeait « high » pour la rédaction (celle de
`api.js` passe un effort explicite).

**Causes trouvées** (prompts produits relus dans `banc-opus55.json`, pas seulement les verdicts) :

1. `suivi` et `multiapps` — **un exemple recopié.** L'exemple suivi est le seul hors code ; ses
   gestes (« partager ou envoyer le point…, répondre à un mail, modifier ou supprimer un mail, le
   tableur ou un compte rendu ») revenaient presque mot pour mot dans la relance. Deux défauts s'y
   propageaient : l'envoi était lié AU LIVRABLE (« le point ») et ne suivait pas quand le livrable
   devenait des brouillons ; et il ne montrait aucun périmètre hors code, donc le rédacteur
   transposait « hors de ce dépôt » (exemple migration) en un LIEU — « ailleurs dans mon Drive » —
   qui contient la présentation et en bloque la création.
2. `multiapps` — **deux règles qui se contredisent.** « N'envoie rien » passait dans l'arrivée
   (« aucun message n'a été envoyé ») et la `RELECTURE` (« aucune information n'est dite deux
   fois… ni ailleurs ») le retirait des gestes.
3. `vague` — **deux règles qui se contredisent, et une illustration qui ne couvrait pas le cas.**
   « N'ajoute que ce qui en découle strictement / n'invente aucune exigence » l'emportait sur « les
   deux bords » ; les deux bords n'étaient illustrés que par dédoublonner et renommer (et
   l'illustration du renommage, « pas une sous-chaîne », ne disait pas le bord « changé » — c'est la
   faute de `simple` en high). Et rien ne reliait l'arrivée aux arrêts : un score mesuré « sur le
   site » alors que déployer est un geste nommé.

La longueur du méta-prompt n'est pas la cause retenue : chaque faute a une source lisible dans
le texte (exemple ou contradiction).

**Correctif, au plus petit** (`opus55.js`, aucune fenêtre de longueur touchée) :
- exemple suivi : « envoyer ou partager quoi que ce soit à qui que ce soit, modifier ou supprimer
  un mail, le tableur ou un compte rendu, ou changer quoi que ce soit d'autre que le point
  lui-même » — puisqu'il se recopie, il montre la base sous la forme qui se transpose juste
  (188 mots, 1 048 car., oracle vert, sous le plancher de caractères) ;
- règle des gestes : périmètre hors code écrit « d'autre que » le livrable, jamais un lieu qui le
  contient ; « pour un document, un tableur ou des messages, envoyer ou partager quoi que ce
  soit » ; « mesurer l'arrivée » ajouté aux gestes à ne pas bloquer (en local ou sur un aperçu si
  la mise en ligne est un geste nommé) ;
- fidélité : « ce qui en découle strictement » comprend le bord qui ne doit pas se perdre ;
  illustrations des deux bords : renommer = « chaque occurrence… est devenue le nouveau nom »,
  atteindre un score = « chaque page et chaque contenu présents au départ sont toujours là » ;
- `RELECTURE` : « sauf un interdit de l'idée (« n'envoie rien »), qui reste aussi un geste nommé ».

**Après le passage 1**, deux retouches :
- exemple suivi : « un mail EXISTANT » (dans la relance, « modifier un mail » bloquait les
  brouillons que l'agent crée : le livrable est fait de mails) ; règle : « ses sources existantes » ;
- verbe de la tâche : « le geste réel que disent l'idée ou les réponses », « répare » retiré de la
  liste d'exemples (il était recopié : « accélère… et répare la précommande », diagnostic inventé) ;
- mesure de l'arrivée : le geste dit « en production » pour ne pas interdire l'aperçu.
**Après le passage 2** : l'arrêt demandé devient une AMORCE FIXE vérifiée à l'oracle
(« Arrête-toi aussi si … » ; « Arrête-toi aussi dès que le plan est prêt » est refusé, assertion
dans `verify`) ; l'arrivée dit UNE fois, pour tous ses critères, qu'ils se mesurent en local ou sur
un aperçu.
Méta-prompt final : 16 847 → 17 561 caractères. Aucune fenêtre de longueur touchée ; exemple suivi
189 mots, 1 057 car. `npm run verify` : 549 ✓ / 0 ✗ (une assertion nouvelle).

**Bancs** (rédaction medium, juge high, `claude -p`, sans clé) :
| passage | vague | suivi | multiapps |
|---|---|---|---|
| 1 | ✗ 7 (« répare » inventé, adresse de test, déploiement) | ✓ 9 | ✗ 8,5 (envoi présent ; « partager un brouillon », « modifier un mail » heurte les brouillons) |
| 2 | ✗ 8,5 (lieu de mesure dit pour un critère sur deux) | ✗ 7,5 (« aucune diapo ne sort du plan » inventé ; « Arrête-toi aussi dès que ») | ✓ 9,5 |
| 3 | ✓ 9,3 | ✓ 9,5 | ✗ 8,5 |
Les trois fautes d'origine sont fermées (gestes du suivi, envoi nommé, deux bords et mesure hors
production) ; chaque cas a été vert au moins une fois, jamais les trois dans le même passage.
Passage complet de non-régression NON joué (consigne : seulement si les trois passent).

**Cause du rouge restant (multiapps, passage 3)** : les gestes sont jugés conformes, mais « N'envoie
rien. » reste en phrase isolée dans la tâche et l'arrivée n'a plus qu'un critère. Probablement
ma propre exception de `RELECTURE`, qui cite l'interdit en toutes lettres (« sauf un interdit de
l'idée (« n'envoie rien »)… ») : un exemple nu, recopié tel quel. Correctif proposé, NON joué :
« sauf un interdit de l'idée, qui se constate dans l'arrivée (« aucun message n'a été envoyé ») et
se nomme aussi parmi les gestes ». Prochain passage sur accord.

**Passage 4 (suite, sur consigne)** : `RELECTURE` réécrite sans citer l'interdit de l'idée —
« sauf un interdit de l'idée, qui se constate dans l'arrivée (« aucun message n'a été envoyé ») et
se nomme aussi parmi les gestes ». verify 549 ✓ / 0 ✗. Trois cas : vague ✓ 9,5, suivi ✓ 9,5,
multiapps ✓ 9,5.
**Passage complet (10 cas, medium/high)** : **4/10 conformes**, contre 7/10 avant les changements
(`banc-medium.log`). Verts : revue 9,6, simple 9,5, tableur 9,5, multiapps 9,5.
Rouges déjà rouges avant : vague 7,5 (verbe « accélère la version mobile » : portée rétrécie,
« partout » non repris), suivi 7,5 (arrivée à un seul bord « chaque diapo correspond au plan »,
traçabilité « non confirmé » inventée).
Rouges NOUVEAUX (verts à 9,5 avant) : migration 8,5 (geste « créer ou modifier quoi que ce soit
dans un compte Stripe » bloque les tests en mode test — le juge invoque la règle « mesurer
l'arrivée / en production » ajoutée ici), design 7,5 (« tient dans un seul fichier HTML » inventé,
contredit le geste sur la feuille de style), recherche 8,5 (« créer un compte chez un
fournisseur », geste restreint), piege 9 (tâche en trois phrases au lieu de deux).
Lecture : les trois cas visés sont corrigés, mais le passage complet régresse. Un seul passage
ne sépare pas la variance du juge de l'effet des changements ; migration est le seul rouge
nouveau qu'un changement d'ici explique directement. Itérations arrêtées sur consigne.
Rien n'a été commité ; l'état d'avant est dans le scratchpad (`opus55.avant.js`).

## Retrait (2026-09-25, orchestrateur)

Le banc complet après la série de correctifs : 4/10 (contre 7/10 avant).
`src/opus55.js` est revenu à la version mesurée à 7/10 ; la tentative est
gardée hors dépôt (scratchpad, `opus55.tentative-4sur10.js`). L'assertion
« Arrête-toi aussi si » (propre à la tentative) est retirée de verify.
Reste valable de cette série : l'effort `medium` (meta.js), l'aide et le banc.
Pistes pour la suite : les causes trouvées plus haut (exemple « suivi »
recopié, RELECTURE qui efface un interdit, deux bords illustrés trop peu)
sont justes ; c'est le remède (plus de règles dans le méta-prompt) qui a
déréglé les autres cas. Essayer UN changement à la fois, banc complet
à chaque fois, deux passages pour lisser la variance du juge.
