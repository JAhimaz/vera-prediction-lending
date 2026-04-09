import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const CONDITIONAL_VAULT_PROGRAM = "VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg";
const VAULT_DISCRIMINATOR = "3f8457622433aff7";
const QUESTION_DISCRIMINATOR = "6f1696dcb57a767f";

const RPC_URL =
  process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : "https://api.mainnet-beta.solana.com";

// Known token symbols
const TOKEN_SYMBOLS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta: "META",
  "3osmZWY5i8cfpX5JChwBFy4ZXCLhcVDbuX1kzzzhjups": "JUP",
  oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhFK9SyrE4iQ: "ORE",
  GZEbj7NxznJeMkX3SFeikfbxfB8HVjXY7JhyFdiaphKH: "GZE",
  "9BEzsxayF8rx4AEsN9duFBn3NQDUf1hX3eTWPJQmeta": "KOL",
  ey9DmQUxPKnABU6LrWsQCvFVhZcYk2j4BmBSXLKmeta: "RSTFUL",
  C5yXcUj9stvaDbWWEFJ31yAKDEGHobhikGzmJxTfZYS7: "C5Y",
  Fsce3kKc7QLdQ1Lr9ahVPDRVYdRW4WA5Gf6Ex524zYwg: "FSCE",
};

function decodeVault(data: Buffer) {
  let off = 8; // skip discriminator
  const question = new PublicKey(data.subarray(off, off + 32)).toBase58();
  off += 32;
  const underlying = new PublicKey(data.subarray(off, off + 32)).toBase58();
  off += 32;
  const vecLen = data.readUInt32LE(off);
  off += 4;
  const conditionalTokens: string[] = [];
  for (let i = 0; i < vecLen; i++) {
    conditionalTokens.push(new PublicKey(data.subarray(off, off + 32)).toBase58());
    off += 32;
  }
  return { question, underlying, conditionalTokens };
}

function decodeQuestion(data: Buffer) {
  let off = 8;
  const questionId = Buffer.from(data.subarray(off, off + 32)).toString("hex");
  off += 32;
  const oracle = new PublicKey(data.subarray(off, off + 32)).toBase58();
  off += 32;
  const payoutLen = data.readUInt32LE(off);
  off += 4;
  const payouts: number[] = [];
  for (let i = 0; i < payoutLen; i++) {
    payouts.push(data.readUInt32LE(off));
    off += 4;
  }
  const resolved = payouts.some((p) => p > 0);
  return { questionId, oracle, payouts, resolved };
}

export async function GET() {
  try {
    const connection = new Connection(RPC_URL);

    // Fetch all conditional vault program accounts
    const accounts = await connection.getProgramAccounts(
      new PublicKey(CONDITIONAL_VAULT_PROGRAM),
      { encoding: "base64" }
    );

    const vaults: any[] = [];
    const questions = new Map<string, any>();

    for (const { pubkey, account } of accounts) {
      const data = Buffer.from(account.data as any);
      const disc = data.subarray(0, 8).toString("hex");

      if (disc === VAULT_DISCRIMINATOR) {
        const vault = decodeVault(data);
        vaults.push({ pubkey: pubkey.toBase58(), ...vault });
      } else if (disc === QUESTION_DISCRIMINATOR) {
        const q = decodeQuestion(data);
        questions.set(pubkey.toBase58(), q);
      }
    }

    // Check which conditional tokens have supply (active markets)
    const allMints: string[] = [];
    const mintToVault = new Map<string, { vault: any; index: number }>();
    for (const v of vaults) {
      for (let i = 0; i < v.conditionalTokens.length; i++) {
        allMints.push(v.conditionalTokens[i]);
        mintToVault.set(v.conditionalTokens[i], { vault: v, index: i });
      }
    }

    // Batch check supplies
    const supplyMap = new Map<string, number>();
    for (let i = 0; i < allMints.length; i += 100) {
      const batch = allMints.slice(i, i + 100);
      const accs = await connection.getMultipleAccountsInfo(
        batch.map((m) => new PublicKey(m))
      );
      for (let j = 0; j < accs.length; j++) {
        const acc = accs[j];
        if (acc && acc.data.length >= 36) {
          const supply = Number(Buffer.from(acc.data).readBigUInt64LE(36));
          if (supply > 0) supplyMap.set(batch[j], supply);
        }
      }
    }

    // Group by question and build markets
    const byQuestion = new Map<
      string,
      { vaults: any[]; totalSupply: number; underlying: string }
    >() as Map<string, { vaults: any[]; totalSupply: number; underlying: string }>;

    for (const [mint, supply] of supplyMap) {
      const entry = mintToVault.get(mint);
      if (!entry) continue;
      const q = entry.vault.question;
      const existing: { vaults: any[]; totalSupply: number; underlying: string } = byQuestion.get(q) || {
        vaults: [] as any[],
        totalSupply: 0,
        underlying: entry.vault.underlying,
      };
      existing.totalSupply += supply;
      if (!existing.vaults.find((v: any) => v.pubkey === entry.vault.pubkey)) {
        (existing.vaults as any[]).push(entry.vault);
      }
      byQuestion.set(q, existing);
    }

    // Sort by total supply and build response
    const sorted = [...byQuestion.entries()].sort(
      (a, b) => b[1].totalSupply - a[1].totalSupply
    );

    const markets = sorted.slice(0, 50).map(([questionPubkey, data], i) => {
      const bestVault = data.vaults.reduce(
        (best: any, v: any) =>
          v.conditionalTokens.length > (best?.conditionalTokens?.length || 0)
            ? v
            : best,
        data.vaults[0]
      );
      const symbol = TOKEN_SYMBOLS[data.underlying] || "TOKEN";
      const q = questions.get(questionPubkey);
      const resolved = q?.resolved || false;

      // Estimate YES price from relative supply of tokens
      const totalSupplyUsd = data.totalSupply / 1e6;
      // For binary markets, approximate 50% if we can't calculate
      const yesBps = 5000;

      return {
        id: questionPubkey,
        question: questionPubkey,
        vault: bestVault.pubkey,
        underlying: data.underlying,
        symbol,
        yesToken: bestVault.conditionalTokens[0] || null,
        noToken: bestVault.conditionalTokens[1] || null,
        outcomes: bestVault.conditionalTokens.length,
        totalSupply: Math.round(totalSupplyUsd),
        yes: yesBps,
        resolved,
        slug: questionPubkey.slice(0, 12),
      };
    });

    return NextResponse.json(markets, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (e: any) {
    console.error("MetaDAO fetch error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
