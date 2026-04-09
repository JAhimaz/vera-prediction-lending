import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(
      "https://gamma-api.polymarket.com/markets?limit=120&active=true&order=volume24hr&ascending=false",
      { next: { revalidate: 60 } }
    );
    const data = await res.json();

    const markets = data
      .map((m: any) => {
        const prices = typeof m.outcomePrices === "string"
          ? JSON.parse(m.outcomePrices)
          : m.outcomePrices || [];
        const yes = parseFloat(prices[0] || "0");
        // Skip near-certain or near-zero markets
        if (yes > 0.95 || yes < 0.05) return null;
        return {
          id: m.id,
          question: m.question,
          slug: m.slug,
          yes: Math.round(yes * 10000), // basis points
          volume24hr: Math.round(parseFloat(m.volume24hr || "0")),
          image: m.image || null,
          endDate: m.endDate || null,
        };
      })
      .filter(Boolean)
      .slice(0, 50);

    return NextResponse.json(markets);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
