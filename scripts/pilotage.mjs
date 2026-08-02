/* ================================================================
   PILOTAGE RÉEL — le seul instrument qui exerce les paliers responsive.

   `npm run verify` force `documentElement.style.width` ; les media
   queries, elles, s'évaluent sur le VRAI viewport (DECISIONS.md § 18).
   Aucun palier n'y est donc exercé, et une disposition à trois colonnes
   ne s'y prouve pas. Ici, Chrome est réellement redimensionné.

       npm run dev                       # dans un autre terminal
       npm run pilotage                  # http://localhost:5173
       npm run pilotage -- <url>         # ou une preview

   Playwright n'est PAS une dépendance du dépôt — il pèse plus que
   l'application. On l'installe à côté, une fois :

       mkdir -p /tmp/drive && cd /tmp/drive && npm init -y && npm i playwright

   `channel: "chrome"` utilise le Chrome déjà installé : rien à
   télécharger. `PLAYWRIGHT_HOME` déplace l'installation si besoin.
   ================================================================ */

const RACINE = process.env.PLAYWRIGHT_HOME || "/tmp/drive";
let chromium;
try {
  ({ chromium } = await import(`${RACINE}/node_modules/playwright/index.mjs`));
} catch {
  console.error(
    `Playwright introuvable dans ${RACINE}.\n` +
      `  mkdir -p ${RACINE} && cd ${RACINE} && npm init -y && npm i playwright`
  );
  process.exit(2);
}

const BASE = process.argv[2] || "http://localhost:5173";
let ko = 0;
const ok = (nom, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!cond) ko += 1;
};

const PROMPT = `# QUI TU ES
JETONPROMPT — tu es le patron d'une conciergerie.

# SORTIE
Sinon tu continues.`;

const CARTE = {
  id: "sonde-1",
  title: "Conciergerie",
  idea: "une conciergerie de quartier qui prend les colis",
  prompt: PROMPT,
  count: 58,
  limit: 3900,
  version: 2,
  chat: [
    { role: "atelier", at: "2026-08-01T09:00:00.000Z", text: "ANCIENNEVERSION", version: 1, count: 40, pass: true },
    { role: "moi", at: "2026-08-01T09:05:00.000Z", text: "durcis l'escalade" },
    { role: "atelier", at: "2026-08-01T09:06:00.000Z", text: PROMPT, version: 2, count: 58, pass: true },
  ],
  note: {
    note: 7.5,
    verdict: "Tient la méthode, l'oracle est faible.",
    juge: "claude-opus-5",
    pourVersion: 2,
    criteres: [
      { cle: "structure", nom: "Structure", note: 9, mot: "huit sections" },
      { cle: "boucle", nom: "Boucle empirique", note: 8, mot: "événements concrets" },
      { cle: "invariants", nom: "Invariants", note: 8, mot: "file posée" },
      { cle: "verificateur", nom: "Vérificateur", note: 5.5, mot: "assertions vagues" },
      { cle: "sortie", nom: "Escalade et sortie", note: 8, mot: "verrouillée" },
      { cle: "economie", nom: "Économie", note: 7, mot: "une redite" },
    ],
    at: "2026-08-01T09:07:00.000Z",
  },
  savedAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:06:00.000Z",
};

const browser = await chromium.launch({ channel: "chrome" });

async function surface(width, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route("**/api/session", (r) =>
    r.fulfill({ json: { ok: true, authenticated: true, user: { id: "sonde", name: "Sonde", email: "" }, users: [] } })
  );
  await ctx.route("**/api/prompts", (r) => r.fulfill({ json: { ok: true, items: [CARTE] } }));
  await ctx.route("**/api/usage", (r) => r.fulfill({ json: { ok: true, total: 0.42 } }));
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  return { ctx, page };
}

/* ---------- 1. la manchette d'accueil, au lancement ---------- */
{
  const { ctx, page } = await surface(1600);
  const h1 = (await page.locator("h1").first().textContent()) || "";
  ok("accueil — le titre demande ce qu'on confie", h1.includes("confies"), h1.replace(/\s+/g, " ").trim());
  /* `.lede` tout court attrapait le message vide du PUPITRE : il est plus
     haut dans le document que la manchette. On vise le marbre. */
  const lede = (await page.locator(".atelier-main .lede").first().textContent()) || "";
  ok("accueil — la description est en langage courant", lede.includes("mandat") && lede.includes("comme tu l'expliquerais"));
  for (const jargon of ["oracle", "invariant", "escalade limitée", "matériellement"]) {
    ok(`accueil — sans jargon « ${jargon} »`, !lede.toLowerCase().includes(jargon.toLowerCase()));
  }
  ok("accueil — l'épreuve est déjà là, vide", await page.locator(".epreuve-vide").isVisible());
  await ctx.close();
}

/* ---------- 2. les trois panneaux, à chaque palier ---------- */
for (const w of [1920, 1600, 1400, 1280, 1100, 900, 430, 390, 360, 320]) {
  const { ctx, page } = await surface(w, 900);

  // Rappeler un prompt sauvegardé : c'est le cas nommé par la demande.
  await page.locator(".casse-toggle").click();
  await page.locator(".casse-open").first().click();
  await page.waitForSelector(".atelier-main .prompt-sheet", { timeout: 5000 });
  // Le tiroir de la casse se referme, sinon il couvre les panneaux.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(450);

  const m = await page.evaluate(() => {
    const box = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
    };
    const carte = document.querySelector(".atelier-main .prompt-sheet");
    return {
      pupitre: box(".pupitre"),
      marbre: box(".atelier-main"),
      epreuve: box(".epreuve"),
      debord: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      yPrompt: carte ? Math.round(carte.getBoundingClientRect().top + window.scrollY) : -1,
      jaugeEpreuve: Boolean(document.querySelector(".epreuve .jauge-note")),
      jaugeMarbre: Boolean(document.querySelector(".atelier-main .jauge-note")),
      filPupitre: Boolean(document.querySelector(".pupitre .turn")),
      manchette: document.querySelector(".atelier-main")?.textContent.includes("Bonjour") || false,
      repliee: Boolean(document.querySelector(".idee-repliee")),
    };
  });

  ok(`${w}px — aucun débordement horizontal`, m.debord === 0, `${m.debord} px`);
  ok(`${w}px — la note est à l'épreuve, pas au marbre`, m.jaugeEpreuve && !m.jaugeMarbre);
  ok(`${w}px — le fil est au pupitre`, m.filPupitre);
  ok(`${w}px — la manchette s'efface, l'idée est repliée`, !m.manchette && m.repliee);
  ok(`${w}px — le prompt commence en haut`, m.yPrompt >= 0 && m.yPrompt < 460, `${m.yPrompt} px`);

  if (w >= 1400) {
    /* Trois colonnes CÔTE À CÔTE : même ordonnée, abscisses croissantes.
       Sans le contrôle de l'ordonnée, trois blocs empilés passeraient. */
    const surLaMemeLigne =
      m.pupitre && m.marbre && m.epreuve &&
      Math.abs(m.pupitre.y - m.epreuve.y) < 60 && Math.abs(m.pupitre.y - m.marbre.y) < 120;
    ok(`${w}px — trois panneaux sur la même ligne`, surLaMemeLigne,
      `y ${m.pupitre?.y}/${m.marbre?.y}/${m.epreuve?.y}`);
    ok(`${w}px — gauche → centre → droite`,
      m.pupitre.x < m.marbre.x && m.marbre.x < m.epreuve.x,
      `x ${m.pupitre?.x}/${m.marbre?.x}/${m.epreuve?.x}`);
    ok(`${w}px — le milieu garde de la place au prompt`, m.marbre.w >= 560, `${m.marbre?.w} px`);
  } else {
    ok(`${w}px — l'épreuve est repassée dans le flux, sous le marbre`,
      m.epreuve && m.marbre && m.epreuve.y > m.marbre.y, `y ${m.marbre?.y} → ${m.epreuve?.y}`);
  }

  await ctx.close();
}

/* ---------- 3. rouvrir l'idée, puis la replier ---------- */
{
  const { ctx, page } = await surface(1600);
  await page.locator(".casse-toggle").click();
  await page.locator(".casse-open").first().click();
  await page.waitForSelector(".idee-repliee");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  const extrait = (await page.locator(".idee-extrait").textContent()) || "";
  ok("l'idée repliée reste lisible", extrait.includes("conciergerie"), extrait.trim().slice(0, 40));

  await page.getByRole("button", { name: "Modifier" }).click();
  await page.waitForTimeout(250);
  const val = await page.locator(".atelier-main textarea").first().inputValue();
  ok("« Modifier » rouvre le composeur avec l'idée", val.includes("conciergerie"));

  /* Le libellé est unique dans la page — la casse porte déjà un
     « Replier ». Deux boutons homonymes ne se distinguent pas à l'oreille
     d'un lecteur d'écran ; c'est ce contrôle qui l'a fait voir. */
  const repli = page.getByRole("button", { name: "Replier l'idée" });
  ok("« Replier l'idée » est un libellé unique", (await repli.count()) === 1, `${await repli.count()} bouton(s)`);
  await repli.click();
  await page.waitForTimeout(250);
  ok("il referme l'idée", await page.locator(".idee-repliee").isVisible());
  await ctx.close();
}

/* ---------- 4. l'aide, le pied de page, « Nouveau prompt » ---------- */
{
  const { ctx, page } = await surface(1600);

  /* --- le pied de page, présent dès l'accueil --- */
  const pied = page.locator(".pied");
  ok("le pied de page est là", await pied.count() === 1);
  const legal = (await page.locator(".pied-legal").textContent()) || "";
  ok("il nomme son propriétaire", legal.includes("Gabriel Bertoli"), legal.trim());
  ok("il porte le ®", legal.includes("®"));
  ok("il réserve les droits", /tous droits réservés/i.test(legal));
  /* Le pied MENTIONNE la sécurité en une ligne ; la note complète est dans
     l'infobulle et dans l'aide. Un pied qui explique est un pied qui pousse
     le reste hors de l'écran — mesuré : 110 px à lui seul. */
  const secu = (await page.locator(".pied-secu").textContent()) || "";
  const secuLong = (await page.locator(".pied-secu").getAttribute("title")) || "";
  ok("le pied mentionne la sécurité en une ligne", /navigateur/i.test(secu) && secu.length < 90, `${secu.length} car.`);
  ok("et porte la note complète en infobulle", secuLong.length > 100 && /empreinte/i.test(secuLong));
  const hauteurPied = await page.locator(".pied").evaluate((e) => Math.round(e.getBoundingClientRect().height));
  ok("le pied tient sur un bandeau", hauteurPied <= 48, `${hauteurPied} px`);

  /* --- l'aide --- */
  await page.getByRole("button", { name: "Aide — comment ça marche" }).click();
  await page.waitForSelector(".sheet-aide");
  const chapitres = await page.locator(".aide-chapitre").count();
  ok("l'aide ouvre ses douze chapitres", chapitres === 12, `${chapitres}`);
  const liens = await page.locator(".aide-lien").count();
  ok("le sommaire les liste tous", liens === 12, `${liens}`);
  const sections = await page.locator(".aide-section").count();
  ok("elle détaille les huit sections du prompt", sections === 8, `${sections}`);
  /* Le sommaire doit MENER quelque part : une ancre sans cible est un lien
     mort qu'aucun compte d'éléments ne révèle. */
  const cibles = await page.evaluate(() =>
    [...document.querySelectorAll(".aide-lien")].every((a) =>
      document.querySelector(a.getAttribute("href").replace("#", "#"))
    )
  );
  ok("chaque entrée du sommaire mène à son chapitre", cibles);

  /* Échap referme — c'est le premier geste qu'on essaie. */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok("Échap referme l'aide", (await page.locator(".sheet-aide").count()) === 0);

  /* --- « Nouveau prompt » --- */
  await page.locator(".casse-toggle").click();
  await page.locator(".casse-open").first().click();
  await page.waitForSelector(".atelier-main .prompt-sheet");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  ok("un prompt est bien en place avant l'essai", await page.locator(".idee-repliee").isVisible());

  await page.getByRole("button", { name: "Créer un nouveau prompt" }).click();
  await page.waitForTimeout(600);
  const apres = await page.evaluate(() => ({
    prompt: Boolean(document.querySelector(".atelier-main .prompt-sheet")),
    repliee: Boolean(document.querySelector(".idee-repliee")),
    idee: document.querySelector(".atelier-main textarea")?.value ?? null,
    manchette: document.querySelector(".atelier-main")?.textContent.includes("Bonjour") || false,
    fil: Boolean(document.querySelector(".pupitre .turn")),
    focus: document.activeElement?.tagName.toLowerCase() || "",
  }));
  ok("« Nouveau prompt » retire le prompt du marbre", !apres.prompt);
  ok("il rouvre le composeur", !apres.repliee && apres.idee === "");
  ok("il vide l'idée précédente", apres.idee === "", JSON.stringify(apres.idee));
  ok("il ramène l'accueil", apres.manchette);
  ok("il vide le fil", !apres.fil);
  ok("et pose le curseur dans la saisie", apres.focus === "textarea", apres.focus);

  /* Le prompt n'est pas perdu pour autant : il est resté dans la casse. */
  await page.locator(".casse-toggle").click();
  await page.waitForTimeout(350);
  const restant = await page.locator(".cassetin").count();
  ok("le prompt d'avant est toujours dans la casse", restant === 1, `${restant}`);

  await ctx.close();
}

/* ---------- 5. la barre reste tenable une fois chargée de boutons ------- */
for (const w of [320, 360, 430, 640, 900]) {
  const { ctx, page } = await surface(w, 800);
  const m = await page.evaluate(() => {
    const barre = document.querySelector(".topbar-inner");
    return {
      debord: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      barreLarge: Math.round(barre.scrollWidth) - Math.round(barre.clientWidth),
      neuf: Boolean(document.querySelector(".btn-neuf")),
      aide: Boolean(document.querySelector(".btn-aide")),
      compte: Boolean(document.querySelector("button.avatar")),
    };
  });
  ok(`barre ${w}px — aucun débordement de page`, m.debord === 0, `${m.debord} px`);
  ok(`barre ${w}px — la rangée elle-même ne déborde pas`, m.barreLarge <= 0, `${m.barreLarge} px`);
  /* Les deux gestes restent atteignables à toute largeur : ils perdent
     leur mot, jamais leur bouton. */
  ok(`barre ${w}px — « Nouveau prompt » reste atteignable`, m.neuf);
  ok(`barre ${w}px — l'aide reste atteignable`, m.aide);
  ok(`barre ${w}px — le compte ouvre les réglages`, m.compte);
  await ctx.close();
}

/* ---------- 6. tout tient dans l'écran ----------

   Mesuré le 2026-08-02 : la page faisait 1 148 px pour 935 visibles sur un
   16 pouces. Au-delà de 1400 px, plus rien ne défile hors de l'écran — la
   fenêtre est divisée une fois (barre + colonnes + pied) et chaque colonne
   défile chez elle. La sonde tient un VRAI prompt : mesurer avec soixante
   caractères prouverait qu'une page vide tient dans l'écran. */
{
  const LONG =
    Array.from({ length: 8 }, (_, i) =>
      `# SECTION ${i}\n` +
      Array.from({ length: 6 }, (_, j) =>
        `Ligne ${j} — phrase dense de la méthode Boris qui occupe la largeur utile du marbre.`
      ).join("\n")
    ).join("\n\n") + "\n\n# SORTIE\nSinon tu continues.";

  for (const [w, h] of [[1728, 935], [1680, 950], [1512, 820], [1440, 780], [1400, 700]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.route("**/api/session", (r) =>
      r.fulfill({ json: { ok: true, authenticated: true, user: { id: "s", name: "Sonde", email: "" }, users: [] } })
    );
    await ctx.route("**/api/prompts", (r) =>
      r.fulfill({ json: { ok: true, items: [{ ...CARTE, prompt: LONG, count: LONG.length }] } })
    );
    await ctx.route("**/api/usage", (r) => r.fulfill({ json: { ok: true, total: 1.17 } }));
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator(".casse-toggle").click();
    await page.locator(".casse-open").first().click();
    await page.waitForSelector(".atelier-main .prompt-sheet");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const bas = (s) => {
        const e = document.querySelector(s);
        return e ? Math.round(e.getBoundingClientRect().bottom) : -1;
      };
      const marbre = document.querySelector(".atelier-main");
      return {
        deborde: de.scrollHeight - de.clientHeight,
        vue: de.clientHeight,
        basPied: bas(".pied"),
        basCopier: bas(".atelier-main .btn-primary"),
        /* Rien ne tient dans l'écran en étant COUPÉ : le marbre doit pouvoir
           défiler chez lui, sinon « ça tient » veut dire « c'est tronqué ». */
        marbreDefile: marbre ? marbre.scrollHeight > marbre.clientHeight ||
          getComputedStyle(marbre).overflowY === "auto" : false,
      };
    });

    ok(`${w}×${h} — la page ne dépasse pas l'écran`, m.deborde === 0, `${m.deborde} px de trop`);
    ok(`${w}×${h} — le pied est visible sans défiler`, m.basPied > 0 && m.basPied <= m.vue + 1, `bas à ${m.basPied} pour ${m.vue}`);
    ok(`${w}×${h} — « Copier le prompt » est atteignable d'emblée`, m.basCopier > 0 && m.basCopier <= m.vue + 1, `bas à ${m.basCopier} pour ${m.vue}`);
    ok(`${w}×${h} — le marbre défile chez lui`, m.marbreDefile);
    await ctx.close();
  }
}

await browser.close();
console.log(ko === 0 ? "\nPilotage au vert." : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
