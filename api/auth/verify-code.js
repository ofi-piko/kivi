import {
  delPending,
  getPending,
  json,
  normalizePhone,
  nowMs,
  roleForPhone,
  sha256,
  signToken,
} from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "method_not_allowed" });

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const bodyText = Buffer.concat(chunks).toString("utf8") || "{}";
  let body = {};
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = {};
  }

  const phone = normalizePhone(body?.phone);
  const code = String(body?.code || "").trim();
  if (!phone || !code) return json(res, 400, { message: "bad_request" });

  const record = await getPending(phone);
  if (!record) return json(res, 400, { message: "code_not_requested" });

  if (record.expiresAt < nowMs()) {
    await delPending(phone);
    return json(res, 400, { message: "code_expired" });
  }

  if (record.attemptsLeft <= 0) {
    await delPending(phone);
    return json(res, 429, { message: "too_many_attempts" });
  }

  record.attemptsLeft -= 1;
  if (sha256(code) !== record.codeHash) {
    // Update attemptsLeft (KV doesn't support partial update; store again with remaining TTL)
    const ttlSec = Math.max(1, Math.floor((record.expiresAt - nowMs()) / 1000));
    const { setPending } = await import("../_lib/auth.js");
    await setPending(phone, record, ttlSec);
    return json(res, 400, { message: "invalid_code" });
  }

  await delPending(phone);
  const role = roleForPhone(phone);
  const exp = nowMs() + 7 * 24 * 60 * 60 * 1000;
  const token = signToken({ phone, role, exp });

  return json(res, 200, { ok: true, token, user: { phone, role } });
}

