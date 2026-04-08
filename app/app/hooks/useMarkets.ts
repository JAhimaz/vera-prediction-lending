"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import idlJson from "../../vero.json";
import marketsConfig from "../markets.json";

const PROGRAM_ID = new PublicKey(idlJson.address);

export interface Market {
  name: string;
  slug: string;
  polymarketUrl: string;
  poolAddress: PublicKey;
  usdcMint: PublicKey;
  predictionMint: PublicKey;
  oracleAddress: PublicKey;
  probabilityBps: number;
  totalDeposits: number;
  totalBorrowed: number;
  availableLiquidity: number;
  interestRateBps: number;
  maxLtvBps: number;
  liquidationThresholdBps: number;
  resolved: boolean;
  outcome: boolean;
}

export function useMarkets() {
  const { connection } = useConnection();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const livePrices = useRef<Map<string, number>>(new Map());

  const fetchPolyPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/markets");
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const m of data) livePrices.current.set(m.slug, m.yes);
      }
    } catch {}
  }, []);

  const discoverMarkets = useCallback(async () => {
    try {
      const provider = new AnchorProvider(connection, {} as any, {});
      const program = new Program(idlJson as Idl, provider);

      // Only fetch the specific pools and oracles from our config
      const discovered: Market[] = [];

      for (const cfg of marketsConfig) {
        try {
          const poolKey = new PublicKey(cfg.pool);
          const oracleKey = new PublicKey(cfg.oracle);

          const [poolData, oracleData] = await Promise.all([
            (program.account as any).lendingPool.fetch(poolKey),
            (program.account as any).probabilityOracle.fetch(oracleKey),
          ]);

          const livePrice = cfg.slug ? livePrices.current.get(cfg.slug) : undefined;
          const probBps = livePrice ?? oracleData.probabilityBps;

          discovered.push({
            name: cfg.name,
            slug: cfg.slug,
            polymarketUrl: cfg.polymarketUrl,
            poolAddress: poolKey,
            usdcMint: new PublicKey(cfg.usdcMint),
            predictionMint: new PublicKey(cfg.predictionMint),
            oracleAddress: oracleKey,
            probabilityBps: probBps,
            totalDeposits: poolData.totalDeposits.toNumber() / 1e6,
            totalBorrowed: poolData.totalBorrowed.toNumber() / 1e6,
            availableLiquidity: (poolData.totalDeposits.toNumber() - poolData.totalBorrowed.toNumber()) / 1e6,
            interestRateBps: poolData.interestRateBps,
            maxLtvBps: poolData.maxLtvBps,
            liquidationThresholdBps: poolData.liquidationThresholdBps,
            resolved: oracleData.resolved,
            outcome: oracleData.outcome,
          });
        } catch {
          // Skip markets that can't be fetched
        }
      }

      setMarkets(discovered);
    } catch (e) {
      console.error("Failed to load markets:", e);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  const refresh = useCallback(async () => {
    await fetchPolyPrices();
    await discoverMarkets();
  }, [fetchPolyPrices, discoverMarkets]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { markets, loading, refresh };
}
