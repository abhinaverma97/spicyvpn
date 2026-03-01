import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SpicyVPN — Invisible. Unstoppable.",
  description: "The VPN that looks like normal internet traffic. Bypass any restriction.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.className} bg-background text-foreground antialiased`}>
        {children}
      </body>
    </html>
  );
}
