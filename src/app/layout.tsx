import type { Metadata } from "next";
import { IBM_Plex_Mono, Libre_Franklin } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const franklin = Libre_Franklin({
  subsets: ["latin"],
  variable: "--font-franklin",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "HiveSight — calibrated audience estimates",
  description:
    "Pre-field directional estimates of how US populations would answer survey questions, built on census-calibrated microdata and benchmarked in the open.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${franklin.variable} ${plexMono.variable}`}>
      <body className="min-h-screen font-sans flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
