import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HiveSight - AI-Powered Opinion Simulation",
  description:
    "Simulate public opinion by querying AI from diverse demographic perspectives",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
