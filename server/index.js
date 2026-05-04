import express from "express";
import crypto from "crypto";
import { createCodeSystem } from "./codeSystem.js";
import { createOrderSystem } from "./orderSystem.js";

const app = express();
app.use(express.json({ limit: "12mb" }));

// ===== Config in JS (no .env) =====
const CONFIG = {
  PORT: 5176,
  TELEGRAM_BOT_TOKEN: process.env.BOT_TOKEN || "",
  // Add all recipients here (group ids and/or user ids).
  TELEGRAM_CHAT_IDS: ["-1003908465705"],
  AUTH_SECRET: "dev-secret-change-me",
  OWNER_PHONES: ["+998901234567"],
  WORKER_PHONES: ["+998901234567"],
};

const PORT = Number(CONFIG.PORT || 5176);
const TELEGRAM_BOT_TOKEN = CONFIG.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_IDS = (CONFIG.TELEGRAM_CHAT_IDS || []).map((x) => String(x).trim()).filter(Boolean);
const AUTH_SECRET = CONFIG.AUTH_SECRET || "dev-secret-change-me";

const OWNER_PHONES = new Set((CONFIG.OWNER_PHONES || []).map((s) => String(s).trim()).filter(Boolean));
const WORKER_PHONES = new Set((CONFIG.WORKER_PHONES || []).map((s) => String(s).trim()).filter(Boolean));

function roleForPhone(phone) {
  if (OWNER_PHONES.has(phone)) return "owner";
  if (WORKER_PHONES.has(phone)) return "worker";
  return "guest";
}

function nowMs() {
  return Date.now();
}

// ===== In-memory stores (dev) =====
const sessions = new Map();

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(body)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN) return;
  const allChatIds = new Set(TELEGRAM_CHAT_IDS);
  try {
    const updatesUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
    const updatesRes = await fetch(updatesUrl);
    const updatesData = await updatesRes.json();
    const updates = Array.isArray(updatesData?.result) ? updatesData.result : [];
    for (const u of updates) {
      const chatId =
        u?.message?.chat?.id ??
        u?.edited_message?.chat?.id ??
        u?.channel_post?.chat?.id ??
        u?.edited_channel_post?.chat?.id ??
        u?.callback_query?.message?.chat?.id;
      if (chatId !== undefined && chatId !== null) allChatIds.add(String(chatId));
    }
  } catch {
    // Fallback: still send to configured chat ids.
  }

  const chatIds = [...allChatIds];
  if (chatIds.length === 0) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
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

const codeSystem = createCodeSystem({ sendTelegramMessage });
const orderSystem = createOrderSystem({ sendTelegramMessage });

function getAuthPayload(req) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const payload = verifyToken(token);
  if (!payload?.phone || !payload?.role || !payload?.exp) return null;
  if (payload.exp < nowMs()) return null;
  return payload;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/request-code", async (req, res) => {
  try {
    const data = await codeSystem.requestCode(req.body?.phone);
    res.json(data);
  } catch (e) {
    res.status(e?.status || 500).json({
      message: String(e?.message || "request_code_failed"),
      retryAfterSec: e?.retryAfterSec || 0,
    });
  }
});

app.post("/api/auth/verify-code", (req, res) => {
  try {
    const verified = codeSystem.verifyCode(req.body?.phone, req.body?.code);
    const role = roleForPhone(verified.phone);
    const sessionPayload = { phone: verified.phone, role, exp: nowMs() + 7 * 24 * 60 * 60 * 1000 };
    const token = signToken(sessionPayload);
    sessions.set(token, { phone: verified.phone, role, expiresAt: sessionPayload.exp });
    res.json({ ok: true, token, user: { phone: verified.phone, role } });
  } catch (e) {
    res.status(e?.status || 500).json({ message: String(e?.message || "verify_code_failed") });
  }
});

app.get("/api/me", (req, res) => {
  const payload = getAuthPayload(req);
  if (!payload) return res.status(401).json({ message: "unauthorized" });
  res.json({ ok: true, user: { phone: payload.phone, role: payload.role } });
});

app.post("/api/orders", async (req, res) => {
  const user = getAuthPayload(req);
  try {
    const data = await orderSystem.createOrder(req.body || {}, user);
    res.json(data);
  } catch (e) {
    res.status(e?.status || 500).json({ message: String(e?.message || "order_create_failed") });
  }
});

app.get("/api/orders/mine", (req, res) => {
  const user = getAuthPayload(req);
  if (!user) return res.status(401).json({ message: "unauthorized" });
  res.json({ ok: true, orders: orderSystem.listMine(user.phone) });
});

app.get("/api/orders/admin", (req, res) => {
  const user = getAuthPayload(req);
  if (!user) return res.status(401).json({ message: "unauthorized" });
  if (user.role !== "owner" && user.role !== "worker") return res.status(403).json({ message: "forbidden" });
  res.json({ ok: true, orders: orderSystem.listOrders() });
});

app.post("/api/orders/:id/approve", async (req, res) => {
  const user = getAuthPayload(req);
  if (!user) return res.status(401).json({ message: "unauthorized" });
  if (user.role !== "owner" && user.role !== "worker") return res.status(403).json({ message: "forbidden" });
  try {
    const data = await orderSystem.decideOrder(req.params.id, "approve", user.phone);
    res.json(data);
  } catch (e) {
    res.status(e?.status || 500).json({ message: String(e?.message || "order_approve_failed") });
  }
});

app.post("/api/orders/:id/reject", async (req, res) => {
  const user = getAuthPayload(req);
  if (!user) return res.status(401).json({ message: "unauthorized" });
  if (user.role !== "owner" && user.role !== "worker") return res.status(403).json({ message: "forbidden" });
  try {
    const data = await orderSystem.decideOrder(req.params.id, "reject", user.phone);
    res.json(data);
  } catch (e) {
    res.status(e?.status || 500).json({ message: String(e?.message || "order_reject_failed") });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Auth server listening on http://localhost:${PORT}`);
});

