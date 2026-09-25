// Firebase web configuration is public configuration, not a server secret.
// Replace these placeholders after creating the Firebase project.
export const CONFIG = {
  firebase: {
    apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
    authDomain: "REPLACE_WITH_PROJECT.firebaseapp.com",
    projectId: "REPLACE_WITH_PROJECT_ID",
    storageBucket: "REPLACE_WITH_PROJECT.firebasestorage.app",
    messagingSenderId: "REPLACE_WITH_MESSAGING_SENDER_ID",
    appId: "REPLACE_WITH_FIREBASE_APP_ID"
  },

  // Firebase Cloud Messaging Web Push certificate public key.
  firebaseVapidKey: "REPLACE_WITH_FIREBASE_WEB_PUSH_PUBLIC_KEY",

  // Example:
  // https://us-central1-YOUR_PROJECT.cloudfunctions.net/api
  apiBaseUrl: "REPLACE_WITH_FIREBASE_FUNCTION_API_URL",

  // PayPal sandbox client ID first. Switch to a live client ID only after testing.
  // This client ID is public; never place the PayPal client secret here.
  paypalClientId: "REPLACE_WITH_PAYPAL_CLIENT_ID",

  defaultCurrency: "USD"
};