import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, query, where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { CONFIG } from "/firebase-config.js";

const app = initializeApp(CONFIG.firebase);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");
const userLabel = document.querySelector("#user-label");
const productGrid = document.querySelector("#product-grid");
const emptyState = document.querySelector("#empty-state");
const homeView = document.querySelector("#home-view");
const productView = document.querySelector("#product-view");
const productDetail = document.querySelector("#product-detail");
const statusView = document.querySelector("#status-view");

let paypalSdkPromise;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}

function formatMoney(value, currency = CONFIG.defaultCurrency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

function currentSlug() {
  return decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ""));
}

function showStatus(message, isError = false) {
  statusView.textContent = message;
  statusView.classList.remove("hidden");
  statusView.classList.toggle("error", isError);
}

function clearStatus() {
  statusView.textContent = "";
  statusView.classList.add("hidden");
  statusView.classList.remove("error");
}

async function loadProducts() {
  clearStatus();
  const productsQuery = query(collection(db, "products"), where("active", "==", true));
  const snapshot = await getDocs(productsQuery);
  productGrid.innerHTML = "";

  if (snapshot.empty) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  snapshot.forEach(item => {
    const product = item.data();
    const slug = product.slug || item.id;
    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <a href="/${encodeURIComponent(slug)}">
        <img src="${escapeHtml(product.imageUrl || "")}" alt="${escapeHtml(product.name)}" loading="lazy">
        <div class="product-card-body">
          <h2>${escapeHtml(product.name)}</h2>
          <div class="price">${formatMoney(product.price, product.currency)}</div>
        </div>
      </a>
    `;
    productGrid.appendChild(card);
  });
}

async function loadProduct(slug) {
  clearStatus();
  homeView.classList.add("hidden");
  productView.classList.remove("hidden");

  const ref = doc(db, "products", slug);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists() || snapshot.data().active === false) {
    productDetail.innerHTML = "<div class='notice'>This product is not available.</div>";
    document.title = "Product not found · Buy Korea";
    return;
  }

  const product = snapshot.data();
  document.title = `${product.name} · Buy Korea`;
  productDetail.innerHTML = `
    <img src="${escapeHtml(product.imageUrl || "")}" alt="${escapeHtml(product.name)}">
    <div class="product-copy">
      <p class="eyebrow">Product</p>
      <h1>${escapeHtml(product.name)}</h1>
      <div class="price">${formatMoney(product.price, product.currency)}</div>
      <p>${escapeHtml(product.description || "")}</p>
      <div id="paypal-button-container"></div>
      <p id="checkout-note" class="muted">Google sign-in is required before checkout.</p>
    </div>
  `;

  await renderPayPal(product, slug);
}

function loadPayPalSdk() {
  if (paypalSdkPromise) return paypalSdkPromise;
  paypalSdkPromise = new Promise((resolve, reject) => {
    if (window.paypal) return resolve(window.paypal);

    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CONFIG.paypalClientId)}&currency=${encodeURIComponent(CONFIG.defaultCurrency)}&intent=capture`;
    script.onload = () => resolve(window.paypal);
    script.onerror = () => reject(new Error("PayPal SDK failed to load."));
    document.head.appendChild(script);
  });
  return paypalSdkPromise;
}

async function authorizedFetch(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in with Google first.");
  const token = await user.getIdToken();

  return fetch(`${CONFIG.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
}

async function renderPayPal(product, productId) {
  const container = document.querySelector("#paypal-button-container");
  const checkoutNote = document.querySelector("#checkout-note");

  try {
    const paypal = await loadPayPalSdk();
    paypal.Buttons({
      style: { layout: "vertical", shape: "pill", label: "paypal" },

      async createOrder() {
        if (!auth.currentUser) {
          await signInWithPopup(auth, googleProvider);
        }
        checkoutNote.textContent = "Creating secure PayPal order…";
        const response = await authorizedFetch("/api/paypal/create-order", {
          method: "POST",
          body: JSON.stringify({ productId })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to create order.");
        return payload.id;
      },

      async onApprove(data) {
        checkoutNote.textContent = "Confirming payment…";
        const response = await authorizedFetch("/api/paypal/capture-order", {
          method: "POST",
          body: JSON.stringify({ orderId: data.orderID, productId })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to capture payment.");

        checkoutNote.textContent = `Payment complete. Order ${payload.orderId} has been received.`;
        showStatus("Thank you. Your order has been received.");
      },

      onCancel() {
        checkoutNote.textContent = "Checkout was cancelled.";
      },

      onError(error) {
        console.error(error);
        checkoutNote.textContent = error?.message || "Checkout failed. Please try again.";
      }
    }).render(container);
  } catch (error) {
    console.error(error);
    container.innerHTML = "<div class='notice'>PayPal is not configured yet.</div>";
  }
}

loginButton.addEventListener("click", () => signInWithPopup(auth, googleProvider));
logoutButton.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, user => {
  userLabel.textContent = user ? (user.displayName || user.email || "Signed in") : "";
  loginButton.classList.toggle("hidden", Boolean(user));
  logoutButton.classList.toggle("hidden", !user);
});

const slug = currentSlug();
if (slug && slug !== "index.html") {
  loadProduct(slug).catch(error => showStatus(error.message, true));
} else {
  loadProducts().catch(error => showStatus(error.message, true));
}