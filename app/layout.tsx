import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { PwaRegister } from "@/components/pwa";
import { SplashGate } from "@/components/splash-gate";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const BRAND_LOGO = "/brand/punto-fadey.jpg";

export const metadata: Metadata = {
  title: "Punto Fadey",
  description: "Punto de venta para bodegas y comercios",
  applicationName: "Punto Fadey",
  appleWebApp: { capable: true, title: "Punto Fadey", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0c2340",
  width: "device-width",
  initialScale: 1,
};

export const instant = false;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">
        <SplashGate logoSrc={BRAND_LOGO}>
          <Suspense fallback={<div className="p-8 text-sm text-slate-500">Cargando…</div>}>{children}</Suspense>
        </SplashGate>
        <PwaRegister />
      </body>
    </html>
  );
}
