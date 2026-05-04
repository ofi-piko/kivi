function nowMs() {
  return Date.now();
}

function formatMoneyUzs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return n.toLocaleString("ru-RU");
}

function escapeText(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function buildLocationText(location) {
  if (!location || typeof location !== "object") return "Не указано";
  const mode = String(location.mode || "manual");
  if (mode === "geo") {
    const lat = Number(location.latitude);
    const lon = Number(location.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return `GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    }
  }
  const address = escapeText(location.address || "");
  return address || "Не указано";
}

function hasValidLocation(location) {
  if (!location || typeof location !== "object") return false;
  const mode = String(location.mode || "manual");
  if (mode === "geo") {
    const lat = Number(location.latitude);
    const lon = Number(location.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon);
  }
  return Boolean(escapeText(location.address || ""));
}

export function createOrderSystem({ sendTelegramMessage } = {}) {
  const orders = new Map();

  async function createOrder(order, user) {
    if (!user?.phone) {
      const err = new Error("login_required");
      err.status = 401;
      throw err;
    }
    if (!order?.items || !Array.isArray(order.items) || order.items.length === 0) {
      const err = new Error("empty_order");
      err.status = 400;
      throw err;
    }

    const id = String(order.order_id || nowMs());
    const name = escapeText(order?.name) || "Без имени";
    const phone = escapeText(order?.phone) || user.phone;
    const locationText = buildLocationText(order?.location);
    const qrImage = typeof order?.qrImage === "string" ? order.qrImage : "";
    const hasQr = qrImage.startsWith("data:image/");
    const hasLocation = hasValidLocation(order?.location);
    if (!hasQr) {
      const err = new Error("qr_required");
      err.status = 400;
      throw err;
    }
    if (!hasLocation) {
      const err = new Error("location_required");
      err.status = 400;
      throw err;
    }

    const lines = [];
    lines.push("🛒 *Новый заказ!*");
    lines.push(`🆔 *Order ID:* ${id}`);
    lines.push(`👤 *Имя клиента:* ${name}`);
    lines.push(`📞 *Номер телефона:* ${phone}`);
    lines.push(`📍 *Доставка:* ${locationText}`);
    lines.push(`🧾 *QR приложен:* ${hasQr ? "Да" : "Нет"}`);
    lines.push("");
    lines.push("📋 *Корзина:*");

    let computedTotal = 0;
    for (const item of order.items) {
      const itemName = escapeText(item?.name) || "товар";
      const qty = Number(item?.quantity || 0);
      const price = Number(item?.price || 0);
      const weight = escapeText(item?.weight);
      const sub = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0);
      computedTotal += sub;
      lines.push(`• ${itemName}: ${qty}шт${weight ? `, ${weight}` : ""}, ${formatMoneyUzs(sub)} сум`);
    }

    const finalTotal = order?.total ?? computedTotal;
    lines.push("");
    lines.push(`💰 *В общем: ${formatMoneyUzs(finalTotal)} сум*`);
    lines.push(`⚠️ Проверка оплаты: подтвердить или отклонить в админке.`);
    await sendTelegramMessage?.(lines.join("\n"));

    const record = {
      id,
      name,
      phone,
      userPhone: user.phone,
      role: user.role,
      items: order.items,
      total: finalTotal,
      location: order?.location || null,
      qrImage: hasQr ? qrImage : "",
      status: "pending",
      createdAt: new Date().toISOString(),
      decisionAt: null,
      decisionBy: null,
      reason: "",
    };
    orders.set(id, record);
    return { ok: true, order_id: id, status: record.status };
  }

  function listOrders() {
    return [...orders.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function listMine(phone) {
    return listOrders().filter((o) => o.userPhone === phone);
  }

  async function decideOrder(id, action, actorPhone) {
    const order = orders.get(String(id));
    if (!order) {
      const err = new Error("order_not_found");
      err.status = 404;
      throw err;
    }
    if (order.status !== "pending") {
      const err = new Error("order_already_decided");
      err.status = 409;
      throw err;
    }
    order.status = action === "approve" ? "approved" : "rejected";
    order.decisionAt = new Date().toISOString();
    order.decisionBy = actorPhone || "";

    await sendTelegramMessage?.(
      `${order.status === "approved" ? "✅" : "❌"} Заказ ${order.id} ${order.status === "approved" ? "подтвержден" : "отклонен"} админом ${order.decisionBy || "unknown"}.`,
    );

    return { ok: true, order_id: order.id, status: order.status };
  }

  return {
    createOrder,
    listOrders,
    listMine,
    decideOrder,
  };
}
