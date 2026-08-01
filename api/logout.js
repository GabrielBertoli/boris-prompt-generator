import { clearSessionCookie, methodIs, ok } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!methodIs(req, res, "POST")) return;
  clearSessionCookie(res);
  return ok(res);
}
