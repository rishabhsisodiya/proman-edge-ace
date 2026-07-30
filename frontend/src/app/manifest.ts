import type { MetadataRoute } from "next";

// PWA installability (2026-07-30) — Next.js auto-serves this at
// /manifest.webmanifest and injects the <link rel="manifest"> tag itself, no
// layout.tsx change needed. Icons currently point at the existing
// favicon.ico (16x16/32x32) — that's enough for the manifest to be valid and
// the app installable, but a real 192x192 + 512x512 icon set (ideally a
// maskable variant) should replace this for a proper home-screen icon/splash
// screen and a clean Lighthouse PWA score. Needs actual icon artwork from
// the client/design side — not something to fake here.
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
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
