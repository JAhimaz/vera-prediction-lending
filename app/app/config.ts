import { PublicKey } from "@solana/web3.js";

export const VERO_CONFIG = {
  programId: new PublicKey("3KX1asvGaP1h2UHaxbHoT4WA5Gf6Ex524zYwgwB2Cn3V"),
  usdcMint: new PublicKey("F8iSt2X8as6f9eYZiTYnAE9LErwMh8a8aA1LimAQ9Atb"),
  predictionMint: new PublicKey("AxgocUjNmHZhz6G1vgmzRAZuPiwb5TGaykvMPFfzuGbx"),
  cluster: "devnet" as const,
  endpoint: "https://api.devnet.solana.com",
};
