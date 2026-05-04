import {
  delPending,
  getPending,
  json,
  normalizePhone,
  nowMs,
  roleForPhone,
  sendTelegramMessage,
  setPending,
  sha256,
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
  if (!phone) return json(res, 400, { message: "phone_required" });

  const existing = await getPending(phone);
  if (existing?.lastSentAt && nowMs() - Number(existing.lastSentAt) < 20_000) {
    const retryAfterSec = Math.ceil((20_000 - (nowMs() - Number(existing.lastSentAt))) / 1000);
    return json(res, 429, { message: "wait_before_resend", retryAfterSec });
  }

  // Create a 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const ttlSec = 5 * 60;
  const expiresAt = nowMs() + ttlSec * 1000;

  const record = { codeHash: sha256(code), expiresAt, attemptsLeft: 5, lastSentAt: nowMs() };
  await setPending(phone, record, ttlSec);

  // Telegram delivery
  // NOTE: Telegram bot can only message a chat/user who started the bot.
  // This sends to TELEGRAM_CHAT_ID (admin chat), which is typically how you test.
  const role = roleForPhone(phone);
  await sendTelegramMessage(
    `🔐 Код входа\nТелефон: ${phone}\nРоль: ${role}\nКод: ${code}\nНовый код через 20 сек.`,
  );

  // If an old record exists in memory/KV, keep latest only (KV set already overwrote)
  const check = await getPending(phone);
  if (!check) {
    // extremely unlikely; ensure consistency
    await delPending(phone);
  }

  return json(res, 200, { ok: true, expiresInSec: ttlSec, resendInSec: 20 });
}

