export function renderUserPage({
  mountId = "pageUser",
  me,
  requestCode,
  verifyCode,
  getMe,
  setAuthToken,
  showNotification,
  onAuthChanged,
} = {}) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const phone = me?.user?.phone || "";
  const role = me?.user?.role || "";
  const isAuthed = Boolean(phone && role);

  mount.innerHTML = `
    <div class="cardWhite">
      <h2>Профиль</h2>
      <div class="muted" style="margin-top: 8px;">
        ${
          isAuthed
            ? `Вы вошли как <b>${role}</b> (${phone})`
            : "Вы не вошли. Войдите по номеру телефона."
        }
      </div>

      <div style="margin-top: 14px;">
        <div class="formRow">
          <input class="input" id="phoneInput" placeholder="+998 90 123 45 67" />
          <button class="primaryBtn" id="btnRequest">получить код</button>
        </div>
        <div class="formRow" style="margin-top: 10px;">
          <input class="input" id="codeInput" placeholder="код (6 цифр)" />
          <button class="primaryBtn" id="btnVerify">войти</button>
          <button class="dangerBtn" id="btnLogout">выйти</button>
        </div>
        <div class="muted" style="margin-top: 10px; font-size: 12px;">
          Код можно запрашивать повторно только раз в 20 секунд.
        </div>
      </div>
    </div>
  `;

  mount.querySelector("#btnLogout")?.addEventListener("click", () => {
    setAuthToken("");
    showNotification?.("вы вышли");
    onAuthChanged?.(null);
  });

  mount.querySelector("#btnRequest")?.addEventListener("click", async () => {
    const phoneValue = mount.querySelector("#phoneInput")?.value || "";
    try {
      const data = await requestCode(phoneValue);
      showNotification?.(`код отправлен, повторно через ${data?.resendInSec || 20} сек`);
    } catch (e) {
      const msg = String(e.message || e);
      if (msg === "wait_before_resend") {
        showNotification?.("новый код можно получить через 20 секунд");
      } else {
        showNotification?.(`ошибка: ${msg}`);
      }
    }
  });

  mount.querySelector("#btnVerify")?.addEventListener("click", async () => {
    const phoneValue = mount.querySelector("#phoneInput")?.value || "";
    const codeValue = mount.querySelector("#codeInput")?.value || "";
    try {
      await verifyCode(phoneValue, codeValue);
      const me2 = await getMe();
      showNotification?.("вход выполнен");
      onAuthChanged?.(me2);
    } catch (e) {
      showNotification?.(`ошибка: ${String(e.message || e)}`);
    }
  });
}

