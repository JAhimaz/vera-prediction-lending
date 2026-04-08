"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, BorshCoder, Idl } from "@coral-xyz/anchor";
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
      const coder = new BorshCoder(idlJson as Idl);

      // Batch: collect all pool + oracle pubkeys
      const poolKeys = marketsConfig.map((c) => new PublicKey(c.pool));
      const oracleKeys = marketsConfig.map((c) => new PublicKey(c.oracle));
      const allKeys = [...poolKeys, ...oracleKeys];

      // Single RPC call for all accounts
      const allAccounts = await connection.getMultipleAccountsInfo(allKeys);

      const discovered: Market[] = [];

      for (let i = 0; i < marketsConfig.length; i++) {
        const cfg = marketsConfig[i];
        const poolAccount = allAccounts[i];
        const oracleAccount = allAccounts[marketsConfig.length + i];

        if (!poolAccount || !oracleAccount) continue;

        try {
          const poolData = coder.accounts.decode("lendingPool", poolAccount.data);
          const oracleData = coder.accounts.decode("probabilityOracle", oracleAccount.data);

          const livePrice = cfg.slug ? livePrices.current.get(cfg.slug) : undefined;
          const probBps = livePrice ?? (oracleData as any).probabilityBps;

          discovered.push({
            name: cfg.name,
            slug: cfg.slug,
            polymarketUrl: cfg.polymarketUrl,
            poolAddress: poolKeys[i],
            usdcMint: new PublicKey(cfg.usdcMint),
            predictionMint: new PublicKey(cfg.predictionMint),
            oracleAddress: oracleKeys[i],
            probabilityBps: probBps,
            totalDeposits: (poolData as any).totalDeposits.toNumber() / 1e6,
            totalBorrowed: (poolData as any).totalBorrowed.toNumber() / 1e6,
            availableLiquidity:
              ((poolData as any).totalDeposits.toNumber() - (poolData as any).totalBorrowed.toNumber()) / 1e6,
            interestRateBps: (poolData as any).interestRateBps,
            maxLtvBps: (poolData as any).maxLtvBps,
            liquidationThresholdBps: (poolData as any).liquidationThresholdBps,
            resolved: (oracleData as any).resolved,
            outcome: (oracleData as any).outcome,
          });
        } catch {
          // Skip markets that fail to decode (old format)
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
