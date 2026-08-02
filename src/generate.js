import { verifyPrompt } from "./meta.js";

/* Le cœur : générer, mesurer, réparer. Trois tentatives au plus.

   Une seule implémentation, utilisée par l'atelier et par le vérificateur —
   pour qu'une assertion porte sur le code qui tourne, pas sur une copie. */

/* Mesuré contre Sonnet 5 : le premier jet dépasse d'environ 12 %, et chaque
   réparation ne retire qu'une dizaine de pour cent. Trois tentatives, c'était
   exactement le nombre nécessaire — donc aucune marge. Cinq en laissent. */
export const MAX_ATTEMPTS = 5;

export async function runVerifiedGeneration({ ask, baseConvo, instruction, limit, onLog }) {
  const convo = [...baseConvo, { role: "user", content: instruction }];

  let text = (await ask(convo)).trim();
  let check = verifyPrompt(text, limit);
  let attempt = 1;
  const tries = [{ text, check }];
  report(onLog, attempt, check);

  while (!check.pass && attempt < MAX_ATTEMPTS) {
    attempt += 1;
    convo.push({ role: "assistant", content: text });
    convo.push({ role: "user", content: repairInstruction(check, limit, attempt) });
    text = (await ask(convo)).trim();
    check = verifyPrompt(text, limit);
    tries.push({ text, check });
    report(onLog, attempt, check);
  }

  /* Ce qu'on rend n'est pas la DERNIÈRE tentative : c'est la meilleure.
     Chaque serrage est un coup de dé — rien ne garantit que le cinquième a
     fait mieux que le troisième, et rendre le dernier revenait à jeter un
     texte plus court déjà obtenu et payé. */
  const best = bestOf(tries);
  convo.push({ role: "assistant", content: best.text });
  return { text: best.text, check: best.check, convo, attempts: attempt };
}

/* La meilleure des tentatives : une au vert s'il y en a une ; sinon la plus
   COURTE parmi celles dont la structure tient (huit sections, # SORTIE
   présente) — raccourcir se demande encore, reconstruire une sortie tronquée
   non ; sinon, faute de mieux, la plus courte. */
function bestOf(tries) {
  const green = tries.find((t) => t.check.pass);
  if (green) return green;
  const sound = tries.filter((t) => t.check.fails.every((f) => f.startsWith("longueur")));
  const pool = sound.length ? sound : tries;
  return pool.reduce((a, b) => (b.check.count < a.check.count ? b : a));
}

/* La réparation chiffre, et elle SERRE à chaque tour.

   Mesuré contre Sonnet 5 : une cible fixe fait converger le texte par
   asymptote — 3877, 3276, 3141, 3074, 3056 pour une limite de 3000. Le
   modèle rabote sans jamais franchir la barre, parce qu'il ne compte pas
   ses caractères : il estime. La cible descend donc de tour en tour
   (85 %, 75 %, 65 %, 55 % de la limite), et l'écart demandé devient assez
   grand pour être visible à l'œil du modèle. */
const TARGET_RATIO = [0.85, 0.75, 0.65, 0.55];

function repairInstruction(check, limit, attempt) {
  const ratio = TARGET_RATIO[Math.min(attempt - 2, TARGET_RATIO.length - 1)];
  const target = Math.max(1500, Math.round(limit * ratio));
  const excess = check.count - limit;
  const cut = Math.max(0, check.count - target);
  const percent = Math.round((cut / check.count) * 100);

  const lengthPart =
    excess > 0
      ? `Tu es à ${check.count} caractères pour une limite de ${limit} : ${excess} de trop. ` +
        `Cette version est trop longue de ${percent} %. ` +
        `Récris-la en RETIRANT environ ${cut} caractères, pour atterrir vers ${target}. ` +
        "Mieux vaut nettement en dessous que juste au-dessus — un prompt trop court passe, un prompt trop long est refusé. "
      : "";

  return (
    `ASSERTION ÉCHOUÉE : ${check.fails.join(" ; ")}. ` +
    lengthPart +
    "Régénère le prompt COMPLET (les huit sections jusqu'à # SORTIE incluse), texte brut uniquement. " +
    "Garde les huit sections et le sens ; coupe dans les mots : une phrase par idée, " +
    "énumérations réduites à leurs termes, aucune reformulation de ce qui est déjà posé, " +
    "aucun exemple qui ne change pas une décision."
  );
}

function report(onLog, attempt, check) {
  if (!onLog) return;
  onLog(
    `Tentative ${attempt} : ${check.count} caractères — ` +
      (check.pass ? "assertions au vert" : `échec (${check.fails.join(" ; ")})`)
  );
}
