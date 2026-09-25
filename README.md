# Buy Korea

Static GitHub Pages storefront with Firebase authentication/data/storage, a Firebase Functions PayPal backend, and installable admin PWA notifications.

## URLs

- Customer storefront: https://buy-korea.github.io/
- Product detail: https://buy-korea.github.io/<product-slug>
- Admin PWA: https://buy-korea.github.io/admin/

GitHub Pages does not provide dynamic rewrites. Product detail URLs therefore use the repository `404.html` as an SPA fallback while preserving the requested clean pathname in the browser.

## Architecture

- GitHub Pages: storefront + admin frontend
- Firebase Authentication: Google sign-in for customers
- Custom admin ID/password login: verified only by Firebase Functions
- Cloud Firestore: products, admin authorization, orders, admin push tokens
- Firebase Storage: product images
- Firebase Cloud Messaging: new-order notifications to installed admin devices
- Firebase Functions: admin login, PayPal create/capture endpoints and trusted order creation
- PayPal: checkout UI and payment processing

Never place admin passwords, PayPal client secrets, or other server secrets in this repository.

## 1. Create Firebase project

Enable:

1. Authentication
2. Firestore
3. Storage
4. Cloud Messaging
5. Functions

Enable Google as an Authentication provider for customer accounts.

Register a Web App in Firebase and copy its public web configuration into:

- `firebase-config.js`
- `firebase-messaging-sw.js`

Also create a Web Push certificate in Firebase Cloud Messaging and copy its public VAPID key into `firebase-config.js`.

## 2. Configure admin credentials

The admin page uses a dedicated ID/password form. Credentials are checked by Firebase Functions and are not stored in frontend code.

Create a SHA-256 hash of the chosen admin password locally, then store the admin ID and password hash as Firebase Functions secrets:

```bash
firebase functions:secrets:set ADMIN_USERNAME
firebase functions:secrets:set ADMIN_PASSWORD_SHA256
```

The backend creates a Firebase custom-token session with UID:

```
buy-korea-admin
```

and automatically maintains the corresponding Firestore admin record.

## 3. Deploy Firebase rules

Use the supplied:

- `firestore.rules`
- `storage.rules`

## 4. Configure PayPal

Start with PayPal Sandbox.

Set Firebase Functions secrets:

```bash
firebase functions:secrets:set PAYPAL_CLIENT_ID
firebase functions:secrets:set PAYPAL_CLIENT_SECRET
firebase functions:secrets:set PAYPAL_ENV
```

For sandbox, set `PAYPAL_ENV` to `sandbox`. For production, set it to `live`.

Deploy functions:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

Copy the deployed function URL into `firebase-config.js` as `apiBaseUrl`.

Copy the public PayPal Sandbox client ID into `firebase-config.js` as `paypalClientId`.

## 5. Product workflow

In `/admin/`:

1. Sign in with the Buy Korea admin ID/password.
2. Enter product name, slug, price, currency and description.
3. Upload a product image.
4. Save.
5. The customer home page reads active products from Firestore.
6. A product saved as `product-name` appears at `/product-name`.

## 6. Admin notifications

Open `/admin/` on the administrator's phone or desktop.

1. Install the page as a web app.
2. Sign in with the Buy Korea administrator account.
3. Press **Enable order notifications**.
4. Grant browser notification permission.

After a successful PayPal capture, the Firebase Function stores the order and sends a notification such as:

> Alex ordered Product Name.

## Security notes

- The raw admin password is never committed to GitHub.
- Admin login returns a Firebase custom token only after server-side credential validation.
- Product price used for payment is fetched on the server from Firestore.
- PayPal payment capture happens only in the Firebase Function.
- PayPal client secret stays in Firebase secret storage.
- Orders cannot be created directly by browser clients.
- Product uploads are limited to image MIME types below 10 MB.

## Before real sales

Add shipping-address collection/validation, tax/VAT handling, refund workflow, privacy policy, terms of service, return policy, inventory tracking, email receipts, and a production PayPal account. Replace the SVG PWA icon with production 192×192 and 512×512 PNG icons for best mobile installation support.

Brand names, logos and product photography should only be used when you have permission to use them.
