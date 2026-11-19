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
      { src: "/brand-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
