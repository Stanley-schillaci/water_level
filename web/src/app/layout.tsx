import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lac des Saints Peyres",
  description: "Niveau d'eau du barrage du lac des Saints Peyres",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Saints Peyres",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
};

// Script inliné dans <head> qui applique la préférence de thème AVANT le rendu,
// pour éviter le flash de mode clair sur un user qui a choisi "dark".
const THEME_BOOTSTRAP = `(function(){try{
  var p = localStorage.getItem('lac-theme') || 'system';
  var isDark = p === 'dark' || (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (isDark) document.documentElement.classList.add('dark');
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
