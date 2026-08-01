/* Envoi transactionnel : Resend, appelé en REST.
   Pas de SDK — un POST et un en-tête suffisent. */

const ENDPOINT = "https://api.resend.com/emails";

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function mailFrom() {
  return process.env.MAIL_FROM || "Atelier Boris <onboarding@resend.dev>";
}

export async function sendMail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY manquant.");

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: mailFrom(), to: [to], subject, html, text }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Envoi refusé par le fournisseur : ${detail}`);
  }
  return payload.id || null;
}

export function resetEmail({ name, link }) {
  const subject = "Atelier Boris — réinitialiser ton code";
  const text = [
    `Bonjour ${name},`,
    "",
    "Tu as demandé un nouveau code d'accès à l'Atelier Boris.",
    "Ouvre ce lien pour en choisir un (valable 30 minutes, usage unique) :",
    "",
    link,
    "",
    "Si tu n'es pas à l'origine de cette demande, ignore ce message : ton code actuel reste valable.",
  ].join("\n");

  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:32px 16px;background:#12100f;font-family:Helvetica,Arial,sans-serif;color:#f0eae0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#1a1715;border:1px solid #332d28;border-radius:18px" cellpadding="0" cellspacing="0">
      <tr><td style="padding:32px 30px">
        <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#ff7a3d;font-family:monospace">Atelier Boris</div>
        <h1 style="margin:14px 0 12px;font-size:26px;font-weight:400;line-height:1.2;color:#f0eae0">Réinitialiser ton code</h1>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#948a7e">Bonjour ${escapeHtml(name)},</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#948a7e">Choisis un nouveau code d'accès. Le lien est valable 30 minutes et ne fonctionne qu'une fois.</p>
        <a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 26px;background:#ff7a3d;color:#1c0c03;border-radius:999px;font-size:15px;font-weight:700;text-decoration:none">Choisir un nouveau code</a>
        <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#6b6259">Si le bouton ne fonctionne pas, copie ce lien :<br><span style="color:#948a7e;word-break:break-all;font-family:monospace">${escapeHtml(link)}</span></p>
        <hr style="margin:26px 0 0;border:0;border-top:1px solid #26211d">
        <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#6b6259">Tu n'es pas à l'origine de cette demande ? Ignore ce message, ton code actuel reste valable.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}
