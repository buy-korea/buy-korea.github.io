import express from "express";
import cors from "cors";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

initializeApp();

const db = getFirestore();
const app = express();

const PAYPAL_CLIENT_ID = defineSecret("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = defineSecret("PAYPAL_CLIENT_SECRET");
const PAYPAL_ENV = defineSecret("PAYPAL_ENV");

app.use(cors({
  origin: [
    "https://buy-korea.github.io",
    "http://localhost:5000",
    "http://127.0.0.1:5000"
  ]
}));
app.use(express.json());

function paypalBaseUrl() {
  return PAYPAL_ENV.value() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function verifyUser(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) throw new Error("Missing Firebase ID token.");
  return getAuth().verifyIdToken(header.slice(7));
}

async function paypalAccessToken() {
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID.value()}:${PAYPAL_CLIENT_SECRET.value()}`).toString("base64");
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) throw new Error("Unable to authenticate with PayPal.");
  const payload = await response.json();
  return payload.access_token;
}

async function getProduct(productId) {
  const snapshot = await db.doc(`products/${productId}`).get();
  if (!snapshot.exists) throw new Error("Product not found.");
  const product = snapshot.data();
  if (product.active === false) throw new Error("Product is not available.");
  return product;
}

app.post("/api/paypal/create-order", async (req, res) => {
  try {
    await verifyUser(req);
    const { productId } = req.body || {};
    const product = await getProduct(productId);

    const token = await paypalAccessToken();
    const amount = Number(product.price).toFixed(2);
    const currency = product.currency || "USD";

    const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `create-${productId}-${Date.now()}`
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: productId,
          description: product.name,
          amount: { currency_code: currency, value: amount }
        }]
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      console.error("PayPal create order failed", payload);
      return res.status(502).json({ error: "PayPal could not create the order." });
    }

    res.json({ id: payload.id });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || "Unable to create order." });
  }
});

app.post("/api/paypal/capture-order", async (req, res) => {
  try {
    const user = await verifyUser(req);
    const { orderId, productId } = req.body || {};
    if (!orderId || !productId) throw new Error("Missing order information.");

    const product = await getProduct(productId);
    const token = await paypalAccessToken();

    const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    const capture = await response.json();
    if (!response.ok || capture.status !== "COMPLETED") {
      console.error("PayPal capture failed", capture);
      return res.status(502).json({ error: "Payment was not completed." });
    }

    const capturedAmount = capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
    const expectedAmount = Number(product.price).toFixed(2);
    const expectedCurrency = product.currency || "USD";

    if (!capturedAmount ||
        capturedAmount.value !== expectedAmount ||
        capturedAmount.currency_code !== expectedCurrency) {
      console.error("Captured amount mismatch", { capturedAmount, expectedAmount, expectedCurrency });
      return res.status(409).json({ error: "Captured amount did not match the current product price." });
    }

    const orderRef = db.doc(`orders/${orderId}`);
    const existing = await orderRef.get();

    if (!existing.exists) {
      await orderRef.set({
        paypalOrderId: orderId,
        buyerUid: user.uid,
        buyerEmail: user.email || "",
        buyerName: user.name || user.email || "Customer",
        productId,
        productName: product.name,
        amount: Number(capturedAmount.value),
        currency: capturedAmount.currency_code,
        status: "paid",
        createdAt: FieldValue.serverTimestamp()
      });

      const tokensSnapshot = await db.collection("adminPushTokens").get();
      const tokens = tokensSnapshot.docs.map(doc => doc.data().token).filter(Boolean);

      if (tokens.length) {
        const result = await getMessaging().sendEachForMulticast({
          tokens,
          notification: {
            title: "New order received",
            body: `${user.name || user.email || "A customer"} ordered ${product.name}.`
          },
          webpush: {
            fcmOptions: { link: "https://buy-korea.github.io/admin/" }
          }
        });

        const invalidDocs = [];
        result.responses.forEach((item, index) => {
          if (!item.success) {
            const code = item.error?.code || "";
            if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
              invalidDocs.push(tokensSnapshot.docs[index]?.ref);
            }
          }
        });
        await Promise.all(invalidDocs.filter(Boolean).map(ref => ref.delete()));
      }
    }

    res.json({ orderId, status: "paid" });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || "Unable to capture order." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

export const api = onRequest({
  region: "us-central1",
  secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV]
}, app);