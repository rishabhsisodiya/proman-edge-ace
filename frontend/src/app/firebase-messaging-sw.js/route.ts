// Served at /firebase-messaging-sw.js (same URL a static file would use, so
// the service-worker registration in lib/push.ts needs no change) — but
// generated dynamically so it reads the same NEXT_PUBLIC_FIREBASE_* values
// already in .env.local, instead of needing them pasted in by hand a second
// time. Blank env values just mean firebase.initializeApp() gets empty
// strings and push silently never initializes, same fail-safe behavior as
// everywhere else in this module.
export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };

  const body = `
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(config)});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "ACE Notification";
  const body = payload.notification?.body || "";
  self.registration.showNotification(title, { body, icon: "/next.svg" });
});

// Passthrough fetch handler (2026-08-02) — Chrome's PWA installability
// criteria require an active service worker with a fetch listener, not just
// any registered SW; this one previously only had onBackgroundMessage, which
// doesn't count. No caching/offline behavior here — that's the separate,
// not-yet-built Offline FSV queueing work — this just satisfies the
// installability check so "Add to Home Screen" actually appears.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // Service worker scope defaults to its own directory — since this is
      // served from the root, no Service-Worker-Allowed header override needed.
      "Cache-Control": "no-cache",
    },
  });
}
