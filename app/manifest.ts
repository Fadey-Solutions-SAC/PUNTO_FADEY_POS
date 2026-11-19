import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Punto Fadey",
    short_name: "Punto Fadey",
    description: "Punto de venta para bodegas y comercios",
    start_url: "/",
    display: "standalone",
    background_color: "#0c1222",
    theme_color: "#0c2340",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
