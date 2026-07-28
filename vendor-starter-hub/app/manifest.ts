import type { MetadataRoute } from "next";

/**
 * Installed-app metadata.
 *
 * start_url is Show mode, not the dashboard home. Someone tapping this icon on
 * a phone is standing at a table, and the offline page is the only one that
 * works there without signal.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vendly TCG — Show mode",
    short_name: "Vendly",
    description:
      "Inventory, buy ceilings and sale logging that keep working when the venue wifi does not.",
    start_url: "/dashboard/show",
    scope: "/",
    display: "standalone",
    background_color: "#faf9f5",
    theme_color: "#b8532c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
