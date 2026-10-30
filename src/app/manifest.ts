import type { MetadataRoute } from "next";

/** Permite instalar o FinFlow na tela inicial do celular (abre sem a barra do navegador). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FinFlow — Gestão financeira",
    short_name: "FinFlow",
    description: "Receitas, despesas, cartões e conexão com o banco.",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#0e0e10",
    theme_color: "#0e0e10",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
