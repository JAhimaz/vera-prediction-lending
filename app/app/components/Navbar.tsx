"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export default function Navbar() {
  return (
    <header data-slot="navbar" className="sticky top-0 z-50 bg-card/90 backdrop-blur-md border-b border-border">
      <div className="mx-auto max-w-[1100px] px-6 h-11 flex items-center justify-between">
        <Link href="/" className="text-[14px] font-bold text-text-primary tracking-tight">
          vero
        </Link>
        <WalletMultiButton />
      </div>
    </header>
  );
}
