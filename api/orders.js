import { json, nowMs, sendTelegramMessage, sendTelegramPhoto, verifyToken } from "./_lib/auth.js";

function formatMoneyUzs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return n.toLocaleString("ru-RU");
}

function compactText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function hasValidLocation(location) {
  if (!location || typeof location !== "object") return false;
  const mode = String(location.mode || "manual");
  if (mode === "geo") {
    const lat = Number(location.latitude);
    const lon = Number(location.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon);
  }
  return Boolean(compactText(location.address || ""));
}

function locationText(location) {
  if (!location || typeof location !== "object") return "Не указано";
  if (String(location.mode || "") === "geo") {
    const lat = Number(location.latitude);
    const lon = Number(location.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return `GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    }
  }
  return compactText(location.address || "") || "Не указано";
}

function locationMapUrl(location) {
  if (!location || typeof location !== "object") return "";
  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

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

  const order = body || {};
  if (!order?.items || !Array.isArray(order.items) || order.items.length === 0) {
    return json(res, 400, { message: "empty_order" });
  }
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const payload = verifyToken(token);
  if (!payload?.phone || !payload?.role || !payload?.exp || payload.exp < nowMs()) {
    return json(res, 401, { message: "login_required" });
  }
  const qrImage = typeof order?.qrImage === "string" ? order.qrImage : "";
  if (!qrImage.startsWith("data:image/")) {
    return json(res, 400, { message: "qr_required" });
  }
  if (!hasValidLocation(order?.location)) {
    return json(res, 400, { message: "location_required" });
  }

  const customerName = compactText(order?.name) || "Без имени";
  const customerPhone = compactText(order?.phone) || payload.phone;
  const id = String(order?.order_id || nowMs());

  const lines = [];
  lines.push("🛒 *Новый заказ!*");
  lines.push(`🆔 *Order ID:* ${id}`);
  lines.push(`👤 *Имя клиента:* ${customerName}`);
  lines.push(`📞 *Номер телефона:* ${customerPhone}`);
  lines.push(`📍 *Доставка:* ${locationText(order.location)}`);
  lines.push("🧾 *QR приложен:* Да");
  lines.push("");
  lines.push("📋 *Корзина:*");

  let computedTotal = 0;
  for (const item of order.items) {
    const itemName = compactText(item?.name) || "Товар";
    const qty = Number(item?.quantity || 0);
    const price = Number(item?.price || 0);
    const weight = compactText(item?.weight);
    const sub = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0);
    computedTotal += sub;

    const qtyText = `${qty}шт`;
    const weightText = weight ? `, ${weight}` : "";
    lines.push(`• ${itemName}: ${qtyText}${weightText}, ${formatMoneyUzs(sub)} сум`);
  }

  const finalTotal = Number.isFinite(Number(order?.total)) ? Number(order.total) : computedTotal;
  lines.push("");
  lines.push(`💰 *В общем: ${formatMoneyUzs(finalTotal)} сум*`);
  lines.push("⚠️ Проверка оплаты: подтвердить или отклонить в админке.");
  const mapUrl = locationMapUrl(order.location);
  if (mapUrl) lines.push(`🗺️ *Карта:* ${mapUrl}`);

  await sendTelegramMessage(lines.join("\n"));
  await sendTelegramPhoto(qrImage, `🧾 QR оплаты\nOrder ID: ${id}\nКлиент: ${customerName}`);

  return json(res, 200, {
    ok: true,
    message: "order_received",
    order_id: id,
  });
}

