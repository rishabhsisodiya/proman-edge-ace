import type { MetadataRoute } from "next";

// PWA installability (2026-07-30) — Next.js auto-serves this at
// /manifest.webmanifest and injects the <link rel="manifest"> tag itself, no
// layout.tsx change needed.
//
// Icon set (2026-08-02): generated from the existing favicon.ico mark (the
// same black-circle/white-triangle brand mark already in use) rather than
// real client-supplied artwork, which still doesn't exist — this replaces
// the earlier favicon-only placeholder with proper 192x192/512x512 +
// maskable sizes so mobile home-screen installs render a real icon instead
// of a blurry fallback. Swap these files under public/icons/ for real
// artwork the moment the client/design side provides it — no other code
// needs to change.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Proman Edge",
    short_name: "Proman Edge",
    description: "Proman Edge — Service Ticketing & Business Dashboards",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f7f9",
    theme_color: "#2a2f69",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
