import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/components/site";

export const metadata: Metadata = {
  title: {
    default: `${site.name} — learn to vend, tools to profit`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  // iOS does not read the web app manifest for the home-screen icon. Without
  // this link, "Add to Home Screen" on an iPhone gives you a blurry screenshot
  // of the page — on a tool whose whole point is being tapped at a table.
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    title: "Vendly",
    // The header is dark; a dark status bar over it looks like a rendering
    // fault rather than a design.
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  // Matches the manifest's theme_color, which iOS ignores in favour of this.
  themeColor: "#b8532c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
