import { json, nowMs, verifyToken } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { message: "method_not_allowed" });

  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const payload = verifyToken(token);

  if (!payload?.phone || !payload?.role || !payload?.exp) {
    return json(res, 401, { message: "unauthorized" });
  }
  if (payload.exp < nowMs()) return json(res, 401, { message: "expired" });

  return json(res, 200, { ok: true, user: { phone: payload.phone, role: payload.role } });
}

