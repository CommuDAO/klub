"use client";

import { ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { kubChain } from "@/lib/chain";
import { I18nProvider } from "@/lib/i18n";

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

const config = createConfig({
  chains: [kubChain],
  transports: { [kubChain.id]: http() },
  connectors: [
    injected(),
    ...(wcProjectId
      ? [
          walletConnect({
            projectId: wcProjectId,
            showQrModal: true,
            metadata: {
              name: "KLUB",
              description: "Event check-in on KUB Chain",
              url: typeof window !== "undefined" ? window.location.origin : "https://klub-events.vercel.app",
              icons: []
            }
          })
        ]
      : [])
  ],
  ssr: false
});

/// Everything in KLUB depends on the wallet, the clock, the chain and the
/// reader's language, none of which exist at build time. Rendering only after
/// mount keeps the static HTML and the first client render identical.
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {mounted ? <I18nProvider>{children}</I18nProvider> : null}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
