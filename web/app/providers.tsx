"use client";

import { ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { kubChain } from "@/lib/chain";

const config = createConfig({
  chains: [kubChain],
  transports: { [kubChain.id]: http() },
  ssr: false
});

/// Everything in KLUB depends on the wallet, the clock and the chain, none of
/// which exist at build time. Rendering only after mount keeps the static HTML
/// and the first client render identical, so React never has to hydrate
/// mismatched text.
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{mounted ? children : null}</QueryClientProvider>
    </WagmiProvider>
  );
}
