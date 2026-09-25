import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, signInWithCustomToken, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";
import {
  getMessaging, getToken, isSupported
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging.js";
import { CONFIG } from "/firebase-config.js";

const firebaseApp = initializeApp(CONFIG.firebase);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

const accessPanel = document.querySelector("#access-panel");
const accessMessage = document.querySelector("#access-message");
const loginForm = document.querySelector("#admin-login-form");
const adminConsole = document.querySelector("#admin-console");
const adminUser = document.querySelector("#admin-user");
const logoutButton = document.querySelector("#admin-logout");
const form = document.querySelector("#product-form");
const productMessage = document.querySelector("#product-message");
const list = document.querySelector("#admin-product-list");
const orderList = document.querySelector("#order-list");
const notificationButton = document.querySelector("#enable-notifications");
const notificationMessage = document.querySelector("#notification-message");

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function formatMoney(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

async function isAdmin(uid) {
  const snapshot = await getDoc(doc(db, "admins", uid));
  return snapshot.exists();
}

async function loadProducts() {
  const snapshot = await getDocs(collection(db, "products"));
  list.innerHTML = "";
  if (snapshot.empty) {
    list.innerHTML = "<p class='muted'>No products yet.</p>";
    return;
  }

  snapshot.forEach(item => {
    const product = item.data();
    const row = document.createElement("div");
    row.className = "product-admin-row";
    row.innerHTML = `
      <img src="${escapeHtml(product.imageUrl || "")}" alt="">
      <div>
        <strong>${escapeHtml(product.name || item.id)}</strong><br>
        <span class="muted">/${escapeHtml(product.slug || item.id)} · ${formatMoney(product.price, product.currency)} · ${product.active === false ? "Hidden" : "Active"}</span>
      </div>
      <button class="button secondary" data-edit="${escapeHtml(item.id)}">Edit</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-edit]").forEach(button => {
    button.addEventListener("click", async () => {
      const productId = button.dataset.edit;
      const snapshot = await getDoc(doc(db, "products", productId));
      const product = snapshot.data();
      document.querySelector("#product-name").value = product.name || "";
      document.querySelector("#product-slug").value = product.slug || productId;
      document.querySelector("#product-price").value = product.price ?? "";
      document.querySelector("#product-currency").value = product.currency || "USD";
      document.querySelector("#product-description").value = product.description || "";
      document.querySelector("#product-active").value = String(product.active !== false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

async function loadOrders() {
  const snapshot = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(25)));
  orderList.innerHTML = "";
  if (snapshot.empty) {
    orderList.innerHTML = "<p class='muted'>No orders yet.</p>";
    return;
  }

  snapshot.forEach(item => {
    const order = item.data();
    const div = document.createElement("div");
    div.className = "notice";
    div.style.marginBottom = ".75rem";
    div.innerHTML = `
      <strong>${escapeHtml(order.buyerName || order.buyerEmail || "Customer")}</strong>
      ordered <strong>${escapeHtml(order.productName || order.productId)}</strong>
      · ${formatMoney(order.amount, order.currency)}
      <div class="muted">PayPal order: ${escapeHtml(order.paypalOrderId || item.id)}</div>
    `;
    orderList.appendChild(div);
  });
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  accessMessage.textContent = "Signing in…";

  try {
    if (!CONFIG.apiBaseUrl || CONFIG.apiBaseUrl.startsWith("REPLACE_WITH_")) {
      throw new Error("Admin backend is not configured yet. Firebase Functions must be deployed first.");
    }

    const username = document.querySelector("#admin-id").value.trim();
    const password = document.querySelector("#admin-password").value;

    const response = await fetch(`${CONFIG.apiBaseUrl.replace(/\/$/, "")}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const contentType = response.headers.get("content-type") || "";
    let payload = null;

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const body = await response.text();
      console.error("Unexpected admin API response", {
        status: response.status,
        contentType,
        body: body.slice(0, 300)
      });
      throw new Error("Admin API returned a web page instead of JSON. Check the Firebase Functions URL.");
    }

    if (!response.ok || !payload?.token) {
      throw new Error(payload?.error || "Invalid administrator credentials.");
    }

    document.querySelector("#admin-password").value = "";
    await signInWithCustomToken(auth, payload.token);
    accessMessage.textContent = "";
  } catch (error) {
    console.error(error);
    accessMessage.textContent = error.message || "Sign-in failed.";
  }
});

document.querySelector("#product-name").addEventListener("input", event => {
  const slugInput = document.querySelector("#product-slug");
  if (!slugInput.dataset.touched) slugInput.value = slugify(event.target.value);
});
document.querySelector("#product-slug").addEventListener("input", event => {
  event.target.dataset.touched = "true";
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  productMessage.textContent = "Saving…";

  try {
    const name = document.querySelector("#product-name").value.trim();
    const slug = slugify(document.querySelector("#product-slug").value);
    const price = Number(document.querySelector("#product-price").value);
    const currency = document.querySelector("#product-currency").value;
    const description = document.querySelector("#product-description").value.trim();
    const active = document.querySelector("#product-active").value === "true";
    const file = document.querySelector("#product-image").files[0];

    if (!slug || !Number.isFinite(price) || price <= 0) throw new Error("Check the product slug and price.");

    const existing = await getDoc(doc(db, "products", slug));
    let imageUrl = existing.exists() ? existing.data().imageUrl || "" : "";

    if (file) {
      const path = `products/${slug}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const upload = await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
      imageUrl = await getDownloadURL(upload.ref);
    }

    await setDoc(doc(db, "products", slug), {
      name, slug, price, currency, description, active, imageUrl,
      updatedAt: serverTimestamp(),
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() })
    }, { merge: true });

    productMessage.textContent = "Product saved.";
    await loadProducts();
  } catch (error) {
    console.error(error);
    productMessage.textContent = error.message;
  }
});

notificationButton.addEventListener("click", async () => {
  try {
    notificationMessage.textContent = "Preparing notifications…";

    if (!(await isSupported())) throw new Error("Push notifications are not supported in this browser.");
    if (!auth.currentUser) throw new Error("Sign in first.");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted.");

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: CONFIG.firebaseVapidKey,
      serviceWorkerRegistration: registration
    });
    if (!token) throw new Error("No push token was returned.");

    const hashBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenId = Array.from(new Uint8Array(hashBytes)).map(b => b.toString(16).padStart(2, "0")).join("");

    await setDoc(doc(db, "adminPushTokens", tokenId), {
      ownerUid: auth.currentUser.uid,
      token,
      updatedAt: serverTimestamp()
    }, { merge: true });

    notificationMessage.textContent = "Order notifications are enabled on this device.";
  } catch (error) {
    console.error(error);
    notificationMessage.textContent = error.message;
  }
});

logoutButton.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async user => {
  adminUser.textContent = user ? "Administrator" : "";
  logoutButton.classList.toggle("hidden", !user);

  if (!user) {
    adminConsole.classList.add("hidden");
    accessPanel.classList.remove("hidden");
    return;
  }

  try {
    if (!(await isAdmin(user.uid))) {
      await signOut(auth);
      throw new Error("This account is not authorized as an administrator.");
    }

    accessPanel.classList.add("hidden");
    adminConsole.classList.remove("hidden");
    await Promise.all([loadProducts(), loadOrders()]);
  } catch (error) {
    console.error(error);
    adminConsole.classList.add("hidden");
    accessPanel.classList.remove("hidden");
    accessMessage.textContent = error.message;
  }
});