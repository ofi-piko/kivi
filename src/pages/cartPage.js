export function initCartPage({
  mountId = "pageCart",
  getCart,
  setCart,
  updateCartDisplay,
  submitOrder,
  showNotification,
} = {}) {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  if (mount.dataset.ready === "1") return;
  mount.dataset.ready = "1";

  mount.innerHTML = `
    <div class="cardWhite">
      <h2>Корзина</h2>
      <div id="cart-items">корзина пуста</div>
      <div style="margin-top: 8px;">итого: <span id="cart-total">0</span> сум</div>
      <div class="formRow" style="margin-top: 10px;">
        <button class="primaryBtn" id="submit-order">оформить заказ</button>
        <button class="dangerBtn" id="clear-cart">очистить</button>
      </div>
    </div>
  `;

  document.getElementById("submit-order")?.addEventListener("click", submitOrder);
  document.getElementById("clear-cart")?.addEventListener("click", () => {
    setCart([]);
    updateCartDisplay();
    showNotification?.("корзина очищена");
  });

  // badge on header cart icon
  const navCart = document.getElementById("navCart");
  if (navCart && !document.getElementById("cart-count")) {
    const counter = document.createElement("span");
    counter.id = "cart-count";
    counter.style.marginLeft = "6px";
    counter.style.backgroundColor = "red";
    counter.style.borderRadius = "50%";
    counter.style.padding = "2px 6px";
    counter.style.fontSize = "12px";
    counter.style.color = "white";
    navCart.appendChild(counter);
  }

  if (!document.getElementById("notification")) {
    const notification = document.createElement("div");
    notification.id = "notification";
    notification.style.position = "fixed";
    notification.style.top = "16px";
    notification.style.right = "20px";
    notification.style.backgroundColor = "#333";
    notification.style.color = "white";
    notification.style.padding = "10px";
    notification.style.borderRadius = "10px";
    notification.style.display = "none";
    notification.style.zIndex = "1002";
    document.body.appendChild(notification);
  }

  // initial render
  updateCartDisplay();
}

