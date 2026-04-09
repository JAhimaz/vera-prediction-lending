import { NextResponse } from "next/server";
import marketsConfig from "../../markets.json";

export async function GET() {
  const markets = (marketsConfig as any[]).map((m, i) => ({
    id: m.metadaoQuestion || String(i),
    question: m.name,
    symbol: m.symbol,
    vault: m.pool,
    underlying: m.usdcMint,
    yesToken: m.yesMint || m.predictionMint,
    noToken: m.noMint || null,
    yes: m.probabilityBps,
    totalSupply: m.seedLiquidity || 1000,
    resolved: false,
    slug: (m.metadaoQuestion || "").slice(0, 12),
  }));

  return NextResponse.json(markets, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
