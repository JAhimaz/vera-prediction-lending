import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import WalletProvider from "./components/WalletProvider";
import Navbar from "./components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vero - Prediction Market Lending",
  description: "Borrow USDC against your prediction market positions on Solana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-surface-page text-foreground antialiased">
        <WalletProvider>
          <Navbar />
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
