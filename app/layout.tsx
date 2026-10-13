import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perpl Analytics · Protocol & Wallet Intelligence",
  description:
    "Perpl protocol analytics, market snapshots and public wallet intelligence on Monad.",
  openGraph: { title: "Perpl Analytics", images: ["/og.png"] },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
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
