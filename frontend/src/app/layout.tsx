import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proman Edge",
  description: "Proman Edge — Service Ticketing & Business Dashboards",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Tabler Icons — required by ported dashboard-module pages (client-approved design) */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
