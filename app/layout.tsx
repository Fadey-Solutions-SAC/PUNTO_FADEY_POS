import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { PwaRegister } from "@/components/pwa";
import { SplashGate } from "@/components/splash-gate";
import { brandLogoUrl } from "@/lib/cover";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Punto Fadey",
  description: "Punto de venta para bodegas y comercios",
  applicationName: "Punto Fadey",
  appleWebApp: { capable: true, title: "Punto Fadey", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/brand-icon/32", sizes: "32x32", type: "image/png" },
      { url: "/brand-icon/192", sizes: "192x192", type: "image/png" },
      { url: "/brand-icon/512", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand-icon/180", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0c2340",
  width: "device-width",
  initialScale: 1,
};

export const instant = false;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const logo = await brandLogoUrl().catch(() => null);
  return (
    <html lang="es" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">
        <SplashGate logoSrc={logo}>
          <Suspense fallback={<div className="p-8 text-sm text-slate-500">Cargando…</div>}>{children}</Suspense>
        </SplashGate>
        <PwaRegister />
      </body>
    </html>
  );
}
