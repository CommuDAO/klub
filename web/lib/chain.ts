import { defineChain } from "viem";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 25925);
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc-testnet.kubchain.io";

export const isTestnet = chainId === 25925;

export const kubChain = defineChain({
  id: chainId,
  name: isTestnet ? "Bitkub Chain Testnet" : "Bitkub Chain",
  nativeCurrency: { name: "KUB", symbol: isTestnet ? "tKUB" : "KUB", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: {
    default: {
      name: "KUB Scan",
      url: isTestnet ? "https://testnet.kubscan.com" : "https://www.kubscan.com"
    }
  },
  testnet: isTestnet
});
