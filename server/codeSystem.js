import crypto from "crypto";

function nowMs() {
  return Date.now();
}

function normalizePhone(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  return trimmed.replace(/\D/g, "");
}

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

export function createCodeSystem({ sendTelegramMessage } = {}) {
  const pending = new Map();
  const RESEND_TIMEOUT_MS = 20 * 1000;
  const CODE_TTL_MS = 5 * 60 * 1000;

  async function requestCode(rawPhone) {
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      const err = new Error("phone_required");
      err.status = 400;
      throw err;
    }

    const existing = pending.get(phone);
    const current = nowMs();
    if (existing?.lastSentAt && current - existing.lastSentAt < RESEND_TIMEOUT_MS) {
      const err = new Error("wait_before_resend");
      err.status = 429;
      err.retryAfterSec = Math.ceil((RESEND_TIMEOUT_MS - (current - existing.lastSentAt)) / 1000);
      throw err;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    pending.set(phone, {
      codeHash: sha256(code),
      expiresAt: current + CODE_TTL_MS,
      attemptsLeft: 5,
      lastSentAt: current,
    });

    await sendTelegramMessage?.(
      `🔐 Код входа\nТелефон: ${phone}\nКод: ${code}\nСледующий код можно запросить через 20 секунд.`,
    );

    return { ok: true, expiresInSec: 300, resendInSec: 20 };
  }

  function verifyCode(rawPhone, rawCode) {
    const phone = normalizePhone(rawPhone);
    const code = String(rawCode || "").trim();
    if (!phone || !code) {
      const err = new Error("bad_request");
      err.status = 400;
      throw err;
    }

    const record = pending.get(phone);
    if (!record) {
      const err = new Error("code_not_requested");
      err.status = 400;
      throw err;
    }
    if (record.expiresAt < nowMs()) {
      pending.delete(phone);
      const err = new Error("code_expired");
      err.status = 400;
      throw err;
    }
    if (record.attemptsLeft <= 0) {
      pending.delete(phone);
      const err = new Error("too_many_attempts");
      err.status = 429;
      throw err;
    }

    record.attemptsLeft -= 1;
    if (sha256(code) !== record.codeHash) {
      const err = new Error("invalid_code");
      err.status = 400;
      throw err;
    }

    pending.delete(phone);
    return { ok: true, phone };
  }

  return {
    normalizePhone,
    requestCode,
    verifyCode,
  };
}
