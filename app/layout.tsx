import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perpl Analytics · Protocol & Wallet Intelligence",
  description: "Live Perpl market analytics, risk monitoring and read-only wallet intelligence.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
