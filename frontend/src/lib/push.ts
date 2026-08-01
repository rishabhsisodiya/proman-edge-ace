import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";
import { apiFetch } from "./api";

// Web Push registration (2026-07-30). All blank until the client's Firebase
// project exists — registerPushNotifications() below no-ops (logs once,
// returns) rather than throwing when config is missing, same fail-safe
// philosophy as the backend NotificationService.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

function isConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && VAPID_KEY);
}

// Guards against React StrictMode's intentional double-invoke of effects in
// Next.js dev mode — without this, two concurrent calls can each mint a
// separate valid FCM token (the service worker isn't always ready in time
// for getToken() to return the same one), registering two tokens for one
// browser and causing every push to arrive twice. Production builds don't
// double-invoke, but the guard is harmless there too — module state persists
// for the page's lifetime either way.
let registrationAttempted = false;
let swRegisterAttempted = false;

/**
 * Registers the service worker unconditionally — independent of whether the
 * user grants push permission (2026-08-02 fix). Previously this only
 * happened inside registerPushNotifications() *after* the Notification
 * permission prompt was accepted, so a user who dismissed/denied that
 * prompt ended up with no service worker registered at all, which silently
 * broke PWA installability (Chrome requires an active SW with a fetch
 * handler to show the install prompt) for a reason that had nothing to do
 * with installability itself. Safe to call every page load — registering
 * the same scope twice is a no-op in the browser.
 */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (swRegisterAttempted) return (await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js")) ?? null;
  swRegisterAttempted = true;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  } catch (err) {
    console.warn("Service worker registration failed (non-fatal):", err);
    return null;
  }
}

/**
 * Call once after login (e.g. dashboard layout mount). Requests browser
 * notification permission, obtains a device token via the (now separately
 * registered) FCM service worker, and POSTs it to the backend
 * (`/users/me/push-tokens`). Silently no-ops — never throws — if Firebase
 * isn't configured yet, the browser doesn't support push, or the user
 * denies/ignores the permission prompt. Safe to call on every page load;
 * the backend upserts on token, so re-registering the same browser is a
 * no-op there too.
 */
export async function registerPushNotifications(): Promise<void> {
  const registration = await registerServiceWorker();

  if (registrationAttempted) return;
  registrationAttempted = true;

  if (typeof window === "undefined" || !("Notification" in window) || !registration) return;
  if (!isConfigured()) return; // Firebase project not set up yet — expected until the client provides credentials.

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return;

    await apiFetch("/users/me/push-tokens", {
      method: "POST",
      body: JSON.stringify({ token, deviceInfo: navigator.userAgent }),
    });
  } catch (err) {
    // Never block the app on push registration failing — this mirrors the
    // backend gateway's own "log, don't throw" rule.
    console.warn("Push notification registration failed (non-fatal):", err);
  }
}

/**
 * Call on logout (2026-07-30 — closes a real gap: without this, a previous
 * user's push token stays linked to them after logout, so on a shared
 * computer they could keep getting notifications meant for whoever's
 * account it was, until someone else's next login silently reassigns the
 * same token). Re-derives the current token (same VAPID key + service
 * worker registration FCM already has for this browser, so it resolves to
 * the same value used at registration) and deletes it from the backend.
 * Silently no-ops on any failure — must never block logout from completing.
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!isConfigured()) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
    if (!registration) return;
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return;

    await apiFetch(`/users/me/push-tokens/${encodeURIComponent(token)}`, { method: "DELETE" });
  } catch (err) {
    console.warn("Push notification unregistration failed (non-fatal):", err);
  }
}
