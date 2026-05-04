import "./order.css";

const CART_KEY = "kivi_cart_v1";
const AUTH_TOKEN_KEY = "kivi_auth_token_v1";

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(next) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(next || []));
  } catch {
    // ignore
  }
}

function formatMoneyUzs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return n.toLocaleString("ru-RU");
}

function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

function renderCart(cart) {
  const emptyEl = document.getElementById("orderCartEmpty");
  const listEl = document.getElementById("orderCart");
  const totalEl = document.getElementById("orderTotal");
  if (!listEl || !totalEl || !emptyEl) return { total: 0 };

  if (!cart.length) {
    emptyEl.classList.remove("hidden");
    listEl.innerHTML = "";
    totalEl.textContent = "0";
    return { total: 0 };
  }

  emptyEl.classList.add("hidden");

  let total = 0;
  listEl.innerHTML = cart
    .map((item) => {
      const qty = Number(item?.quantity || 0);
      const price = Number(item?.price || 0);
      const sub = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0);
      total += sub;
      const name = String(item?.name || "товар");
      return `
        <div class="cartItem">
          <div>
            <div class="cartItemName">${name}</div>
            <div class="cartItemMeta">${formatMoneyUzs(price)} сум × ${qty}</div>
          </div>
          <div><strong>${formatMoneyUzs(sub)}</strong></div>
        </div>
      `;
    })
    .join("");

  totalEl.textContent = String(total);
  return { total };
}

async function readImageAsDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("qr_read_failed"));
    reader.readAsDataURL(file);
  });
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

async function getMe() {
  const token = getAuthToken();
  if (!token) return null;
  const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return await res.json();
}

async function sendOrder({ name, phone, cart, total, location, qrImage }) {
  const items = cart.map((i) => ({
    name: i?.name,
    quantity: i?.quantity,
    price: i?.price,
  }));

  const payload = {
    order_id: Date.now(),
    name,
    phone,
    items,
    total,
    location,
    qrImage,
    timestamp: new Date().toISOString(),
  };

  const token = getAuthToken();
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(data?.message || `HTTP_${res.status}`);
  return data;
}

document.addEventListener("DOMContentLoaded", () => {
  const cart = loadCart();
  const { total } = renderCart(cart);

  const nameEl = document.getElementById("customerName");
  const phoneEl = document.getElementById("customerPhone");
  const addressEl = document.getElementById("deliveryAddress");
  const qrEl = document.getElementById("paymentQr");
  const geoBtn = document.getElementById("useGeoBtn");
  const authRequiredEl = document.getElementById("authRequiredMessage");
  const statusEl = document.getElementById("orderStatus");
  const btn = document.getElementById("sendOrderBtn");
  let location = { mode: "manual", address: "" };

  getMe().then((me) => {
    if (!me?.user?.phone) {
      if (authRequiredEl) {
        authRequiredEl.textContent =
          "Чтобы сделать заказ, сначала войдите в профиль. После оплаты по карте прикрепите QR-код.";
      }
      if (btn) btn.disabled = true;
      if (statusEl) statusEl.textContent = "Войдите через Профиль (иконка пользователя).";
    } else {
      if (authRequiredEl) authRequiredEl.textContent = `Вход выполнен: ${me.user.phone}`;
      if (btn) btn.disabled = false;
    }
  });

  if (phoneEl) {
    phoneEl.addEventListener("input", () => {
      const d = digitsOnly(phoneEl.value).slice(0, 9);
      // pretty format: 90 123 45 67 (still digits-only internally)
      const p1 = d.slice(0, 2);
      const p2 = d.slice(2, 5);
      const p3 = d.slice(5, 7);
      const p4 = d.slice(7, 9);
      const formatted = [p1, p2, p3, p4].filter(Boolean).join(" ");
      phoneEl.value = formatted;
    });
  }

  geoBtn?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      if (statusEl) statusEl.textContent = "Геолокация недоступна в этом браузере.";
      return;
    }
    if (statusEl) statusEl.textContent = "Определяем геолокацию...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        location = {
          mode: "geo",
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          address: String(addressEl?.value || "").trim(),
        };
        if (statusEl) statusEl.textContent = "Геолокация сохранена.";
      },
      () => {
        if (statusEl) statusEl.textContent = "Не удалось получить геолокацию. Введите адрес вручную.";
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });

  async function onSubmit() {
    if (!btn) return;
    const name = String(nameEl?.value || "").trim();
    const phoneDigits = digitsOnly(phoneEl?.value).slice(0, 9);
    const phone = `+998${phoneDigits}`;

    if (!cart.length) {
      if (statusEl) statusEl.textContent = "Корзина пустая.";
      return;
    }
    if (!name) {
      if (statusEl) statusEl.textContent = "Введите имя.";
      return;
    }
    if (phoneDigits.length !== 9) {
      if (statusEl) statusEl.textContent = "Введите 9 цифр номера после +998.";
      return;
    }
    const me = await getMe();
    if (!me?.user?.phone) {
      if (statusEl) {
        statusEl.textContent =
          "Чтобы сделать заказ, войдите в профиль, оплатите по карте и прикрепите QR-код.";
      }
      return;
    }
    const qrFile = qrEl?.files?.[0];
    if (!qrFile) {
      if (statusEl) statusEl.textContent = "Прикрепите QR-код оплаты.";
      return;
    }
    const qrImage = await readImageAsDataUrl(qrFile);
    if (!String(addressEl?.value || "").trim() && location.mode !== "geo") {
      if (statusEl) statusEl.textContent = "Укажите адрес доставки или отправьте геолокацию.";
      return;
    }
    if (location.mode !== "geo") {
      location = { mode: "manual", address: String(addressEl?.value || "").trim() };
    }

    btn.disabled = true;
    if (statusEl) statusEl.textContent = "Отправка...";

    try {
      await sendOrder({ name, phone, cart, total, location, qrImage });
      saveCart([]);
      if (statusEl) statusEl.textContent = "Готово! Заказ отправлен на проверку оплаты.";
      setTimeout(() => {
        window.location.href = "/index.html#/cart";
      }, 700);
    } catch (e) {
      const msg = String(e?.message || e);
      if (statusEl) {
        statusEl.textContent =
          msg === "HTTP_413"
            ? "Ошибка: файл QR слишком большой. Сожмите изображение и отправьте снова."
            : msg === "qr_required"
              ? "Ошибка: прикрепите QR-код оплаты."
              : msg === "location_required"
                ? "Ошибка: укажите адрес доставки или геолокацию."
            : `Ошибка: ${msg}`;
      }
    } finally {
      btn.disabled = false;
    }
  }

  btn?.addEventListener("click", onSubmit);
});

