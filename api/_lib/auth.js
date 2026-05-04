import crypto from "node:crypto";

const CONFIG = {
  TELEGRAM_BOT_TOKEN: process.env.BOT_TOKEN || "",
  // Add all recipients here (group ids and/or user ids).
  TELEGRAM_CHAT_IDS: (process.env.TELEGRAM_CHAT_IDS || "-1003908465705")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
  AUTH_SECRET: "dev-secret-change-me",
  OWNER_PHONES: ["+998901234567"],
  WORKER_PHONES: ["+998901234567"],
};

// Optional Vercel KV (recommended for serverless)
let kv = null;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  const mod = await import("@vercel/kv");
  kv = mod.kv;
} catch {
  kv = null;
}

export function normalizePhone(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  return trimmed.replace(/\D/g, "");
}

export function roleForPhone(phone) {
  const ownerPhones = new Set((CONFIG.OWNER_PHONES || []).map((s) => String(s).trim()).filter(Boolean));
  const workerPhones = new Set((CONFIG.WORKER_PHONES || []).map((s) => String(s).trim()).filter(Boolean));

  if (ownerPhones.has(phone)) return "owner";
  if (workerPhones.has(phone)) return "worker";
  return "guest";
}

export function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

export function nowMs() {
  return Date.now();
}

export function signToken(payload) {
  const secret = CONFIG.AUTH_SECRET || "dev-secret-change-me";
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  const secret = CONFIG.AUTH_SECRET || "dev-secret-change-me";
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function collectTelegramChatIds(token) {
  const fromConfig = (CONFIG.TELEGRAM_CHAT_IDS || []).map((x) => String(x).trim()).filter(Boolean);
  const set = new Set(fromConfig);
  if (!token) return [...set];

  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates`;
    const res = await fetch(url);
    const data = await res.json();
    const updates = Array.isArray(data?.result) ? data.result : [];

    for (const u of updates) {
      const chatId =
        u?.message?.chat?.id ??
        u?.edited_message?.chat?.id ??
        u?.channel_post?.chat?.id ??
        u?.edited_channel_post?.chat?.id ??
        u?.callback_query?.message?.chat?.id;
      if (chatId !== undefined && chatId !== null) set.add(String(chatId));
    }
  } catch {
    // Keep sending to statically configured chats even if getUpdates fails.
  }

  return [...set];
}

export async function sendTelegramMessage(text) {
  const token = CONFIG.TELEGRAM_BOT_TOKEN || "";
  const chatIds = await collectTelegramChatIds(token);
  if (!token || chatIds.length === 0) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await Promise.allSettled(
    chatIds.map((chatId) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      }),
    ),
  );
}

function parseDataImage(dataUrl) {
  const text = String(dataUrl || "");
  const m = text.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!m) return null;
  return {
    mime: m[1],
    bytes: Buffer.from(m[2], "base64"),
  };
}

export async function sendTelegramPhoto(dataUrl, caption = "") {
  const token = CONFIG.TELEGRAM_BOT_TOKEN || "";
  const chatIds = await collectTelegramChatIds(token);
  if (!token || chatIds.length === 0) return;

  const parsed = parseDataImage(dataUrl);
  if (!parsed) return;

  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  await Promise.allSettled(
    chatIds.map(async (chatId) => {
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append("caption", String(caption || ""));
      form.append("parse_mode", "Markdown");
      form.append("photo", new Blob([parsed.bytes], { type: parsed.mime }), "qr.jpg");

      await fetch(url, { method: "POST", body: form });
    }),
  );
}

// pending code record { codeHash, expiresAt, attemptsLeft }
const pendingMemory = new Map();
const PENDING_PREFIX = "pending:";

export async function setPending(phone, record, ttlSec) {
  if (kv) {
    await kv.set(`${PENDING_PREFIX}${phone}`, record, { ex: ttlSec });
    return;
  }
  pendingMemory.set(phone, record);
}

export async function getPending(phone) {
  if (kv) {
    return await kv.get(`${PENDING_PREFIX}${phone}`);
  }
  return pendingMemory.get(phone) || null;
}

export async function delPending(phone) {
  if (kv) {
    await kv.del(`${PENDING_PREFIX}${phone}`);
    return;
  }
  pendingMemory.delete(phone);
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

