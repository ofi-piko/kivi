import '../style/style.css'

import '../Components/style/swiper.css'
import '../Components/script/swiper.js'

import { initCartPage } from '../pages/cartPage.js'
import { renderUserPage as renderUserPageUI } from '../pages/userPage.js'
import { renderAdminPage as renderAdminPageUI } from '../pages/adminPage.js'

const AUTH_TOKEN_KEY = "kivi_auth_token_v1";
const CART_KEY = "kivi_cart_v1";

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function setAuthToken(token) {
  if (!token) localStorage.removeItem(AUTH_TOKEN_KEY);
  else localStorage.setItem(AUTH_TOKEN_KEY, token);
}

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
    // ignore storage errors
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.message || `HTTP_${res.status}`;
    throw new Error(message);
  }
  return data;
}

async function requestCode(phone) {
  return await api("/api/auth/request-code", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

async function verifyCode(phone, code) {
  const data = await api("/api/auth/verify-code", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
  if (data?.token) setAuthToken(data.token);
  return data;
}

async function getMe() {
  try {
    return await api("/api/me");
  } catch {
    return null;
  }
}


const productsMap = {
    1: { name: "Monster White Zero Sugar", unit: "шт", min: 1, step: 1 },
    2: { name: "Лосось свежий", unit: "кг", min: 0.5, step: 0.5 },
    3: { name: "Чай Greenfield", unit: "пачка", min: 1, step: 1 },
};

// корзина для хранения выбранных товаров
let cart = loadCart();

// функция добавления товара в корзину
function addToCart(productId, productName, price, quantity, unit) {
    // проверяем, есть ли уже такой товар в корзине
    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            id: productId,
            name: productName,
            price: price,
            quantity,
            unit,
        });
    }
    
    saveCart(cart);
    updateCartDisplay();
    showNotification(`добавлен: ${productName}`);
}

// функция удаления товара из корзины
function removeFromCart(productId) {
    const index = cart.findIndex(item => item.id === productId);
    if (index !== -1) {
        const removed = cart[index];
        cart.splice(index, 1);
        saveCart(cart);
        showNotification(`удалён: ${removed.name}`);
        updateCartDisplay();
    }
}

// used by inline onclick in cart markup
window.removeFromCart = removeFromCart;

// функция обновления отображения корзины
function updateCartDisplay() {
    const cartElement = document.getElementById('cart-items');
    const totalElement = document.getElementById('cart-total');
    const cartCountElement = document.getElementById('cart-count');
    
    if (!cartElement) return;
    
    if (cart.length === 0) {
        cartElement.innerHTML = '<p>корзина пуста</p>';
        if (totalElement) totalElement.textContent = '0';
        if (cartCountElement) cartCountElement.textContent = '0';
        return;
    }
    
    let total = 0;
    let itemCount = 0;
    let html = '<ul>';
    
    cart.forEach(item => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        itemCount += 1;
        const unit = item.unit || "шт";
        
        html += `
            <li>
                ${item.name}: ${item.quantity}${unit}, ${subtotal.toLocaleString("ru-RU")} сум
                <button onclick="removeFromCart(${item.id})" class="remove-btn">удалить</button>
            </li>
        `;
    });
    
    html += '</ul>';
    cartElement.innerHTML = html;
    
    if (totalElement) totalElement.textContent = total.toLocaleString("ru-RU");
    if (cartCountElement) cartCountElement.textContent = itemCount;
}

// функция показа уведомления
function showNotification(message) {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message.toLowerCase();
        notification.style.display = 'block';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 2000);
    }
}

// функция отправки заказа в python-бот
async function submitOrder() {
    if (cart.length === 0) {
        showNotification('корзина пуста, добавьте товары');
        return;
    }
    const me = await getMe();
    if (!me?.user?.phone) {
        showNotification("чтобы сделать заказ, войдите в профиль");
        setRoute("#/user");
        return;
    }
    saveCart(cart);
    window.location.href = '/order.html';
}

function renderAdminPage(me) {
    renderAdminPageUI({ me });
}

function renderUserPage(me) {
    renderUserPageUI({
        me,
        requestCode,
        verifyCode,
        getMe,
        setAuthToken,
        showNotification,
        onAuthChanged: (me2) => {
            renderUserPage(me2);
            renderAdminPage(me2);
        },
    });
}

function setRoute(hash) {
    window.location.hash = hash;
}

function applyRoute() {
    const route = window.location.hash || '#/';

    const pageRoot = document.getElementById('pageRoot');
    const pageCart = document.getElementById('pageCart');
    const pageUser = document.getElementById('pageUser');
    const pageAdmin = document.getElementById('pageAdmin');
    if (!pageRoot || !pageCart || !pageUser || !pageAdmin) return;

    const isShop = route === '#/' || route === '' || route === '#';
    pageRoot.classList.toggle('hidden', isShop);

    pageCart.classList.add('hidden');
    pageUser.classList.add('hidden');
    pageAdmin.classList.add('hidden');

    if (route === '#/cart') pageCart.classList.remove('hidden');
    if (route === '#/user') pageUser.classList.remove('hidden');
    if (route === '#/admin') pageAdmin.classList.remove('hidden');
}

// инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // находим все кнопки "купить" и добавляем обработчики
    const buyButtons = document.querySelectorAll('.btn');
    
    buyButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const card = event.target.closest('.card');
            if (card) {
                const productId = parseInt(card.getAttribute('data-id'));
                const productConfig = productsMap[productId];
                const productName = productConfig?.name || card.querySelector('h3')?.textContent || 'товар';
                const priceText = card.querySelector('.price')?.textContent || '0';
                const price = parseInt(priceText);
                const qtyInput = card.querySelector(".qtyInput");
                const min = Number(productConfig?.min ?? qtyInput?.getAttribute("min") ?? 1);
                const step = Number(productConfig?.step ?? qtyInput?.getAttribute("step") ?? 1);
                let quantity = Number(qtyInput?.value ?? min);
                if (!Number.isFinite(quantity) || quantity < min) quantity = min;
                const steps = Math.round((quantity - min) / step);
                quantity = Number((min + Math.max(0, steps) * step).toFixed(2));
                
                addToCart(productId, productName, price, quantity, productConfig?.unit || "шт");
            }
        });
    });

    document.querySelectorAll(".card").forEach((card) => {
        const productId = Number(card.getAttribute("data-id"));
        const productConfig = productsMap[productId] || { min: 1, step: 1 };
        const qtyInput = card.querySelector(".qtyInput");
        const minus = card.querySelector(".qtyMinus");
        const plus = card.querySelector(".qtyPlus");
        if (!qtyInput || !minus || !plus) return;

        const min = Number(productConfig.min || 1);
        const step = Number(productConfig.step || 1);
        const normalize = () => {
            let value = Number(qtyInput.value);
            if (!Number.isFinite(value) || value < min) value = min;
            const steps = Math.round((value - min) / step);
            value = Number((min + Math.max(0, steps) * step).toFixed(2));
            qtyInput.value = String(value);
        };

        minus.addEventListener("click", () => {
            const current = Number(qtyInput.value) || min;
            qtyInput.value = String(Math.max(min, Number((current - step).toFixed(2))));
            normalize();
        });
        plus.addEventListener("click", () => {
            const current = Number(qtyInput.value) || min;
            qtyInput.value = String(Number((current + step).toFixed(2)));
            normalize();
        });
        qtyInput.addEventListener("change", normalize);
        normalize();
    });
    
    // Navigation
    document.getElementById('navUser')?.addEventListener('click', () => setRoute('#/user'));
    document.getElementById("navCart")?.addEventListener("click", () => {
        window.location.href = "/index.html#/cart";
    });

    window.addEventListener('hashchange', applyRoute);
    applyRoute();

    // mount cart page UI
    initCartPage({
        getCart: () => cart,
        setCart: (next) => {
            cart = next;
            saveCart(cart);
        },
        updateCartDisplay,
        submitOrder,
        showNotification,
    });

    getMe().then((me) => {
        renderUserPage(me);
        renderAdminPage(me);
    });
});