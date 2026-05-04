export function renderAdminPage({ mountId = "pageAdmin", me } = {}) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const role = me?.user?.role || "";
  const phone = me?.user?.phone || "";
  const canSee = role === "owner" || role === "worker";

  mount.innerHTML = `
    <div class="cardWhite">
      <h2>Админ панель</h2>
      <div class="muted" style="margin-top: 8px;">
        ${phone ? `Текущий пользователь: <b>${role}</b> (${phone})` : "Сначала войдите по номеру телефона."}
      </div>
      <div style="margin-top: 12px;">
        ${canSee ? "Доступ открыт (worker/owner)." : "Доступ только для worker или owner."}
      </div>
      ${canSee ? '<div id="adminOrders" style="margin-top: 12px;"></div>' : ""}
    </div>
  `;

  if (!canSee) return;

  const token = localStorage.getItem("kivi_auth_token_v1") || "";
  const container = mount.querySelector("#adminOrders");
  if (!container) return;

  const api = async (path, method = "GET") => {
    const res = await fetch(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(data?.message || `HTTP_${res.status}`);
    return data;
  };

  const renderList = async () => {
    const data = await api("/api/orders/admin");
    const orders = Array.isArray(data?.orders) ? data.orders : [];
    if (!orders.length) {
      container.innerHTML = '<div class="muted">Заявок на проверку нет.</div>';
      return;
    }
    container.innerHTML = orders
      .map(
        (o) => `
        <div style="border:1px solid #ddd;border-radius:10px;padding:10px;margin-bottom:8px;">
          <div><b>ID:</b> ${o.id}</div>
          <div><b>Клиент:</b> ${o.name} (${o.phone})</div>
          <div><b>Сумма:</b> ${o.total}</div>
          <div><b>Статус:</b> ${o.status}</div>
          <div><b>Адрес:</b> ${
            o?.location?.mode === "geo"
              ? `${Number(o.location.latitude).toFixed(6)}, ${Number(o.location.longitude).toFixed(6)}`
              : o?.location?.address || "не указан"
          }</div>
          ${
            o?.qrImage
              ? `<div style="margin-top:6px;"><img src="${o.qrImage}" alt="qr" style="max-width:180px;border-radius:8px;border:1px solid #eee;" /></div>`
              : ""
          }
          ${
            o.status === "pending"
              ? `<div style="margin-top:8px;">
                  <button class="primaryBtn" data-approve="${o.id}">подтвердить</button>
                  <button class="dangerBtn" data-reject="${o.id}">отклонить</button>
                </div>`
              : ""
          }
        </div>
      `,
      )
      .join("");

    container.querySelectorAll("[data-approve]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-approve");
        await api(`/api/orders/${id}/approve`, "POST");
        await renderList();
      });
    });
    container.querySelectorAll("[data-reject]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-reject");
        await api(`/api/orders/${id}/reject`, "POST");
        await renderList();
      });
    });
  };

  renderList().catch((e) => {
    container.innerHTML = `<div class="muted">Ошибка загрузки: ${String(e?.message || e)}</div>`;
  });
}

