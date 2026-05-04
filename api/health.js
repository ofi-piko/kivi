import { json } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { message: "method_not_allowed" });
  return json(res, 200, { ok: true });
}

