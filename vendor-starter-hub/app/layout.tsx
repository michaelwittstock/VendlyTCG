import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { site } from "@/components/site";

export const metadata: Metadata = {
  title: {
    default: `${site.name} — learn to vend, tools to profit`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
};

export const viewport: Viewport = { colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-paper text-ink">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
