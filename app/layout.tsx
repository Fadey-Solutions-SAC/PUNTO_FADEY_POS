import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { PwaRegister } from "@/components/pwa";
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
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
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
        <Suspense fallback={<div className="p-8 text-sm text-slate-500">Cargando…</div>}>{children}</Suspense>
        <PwaRegister />
      </body>
    </html>
  );
}
