# KLUB

Event check-in on KUB Chain, wired to Junoswap. Show up, check in, earn from the
reward pool.

- `contracts/` — Solidity (Foundry). Six contracts, 34 tests.
- `web/` — static Next.js app. No backend: it reads the chain over RPC.

## Quick start

```
cd contracts && forge test
cd ../web && npm install && npm run dev
```

## Mainnet checklist

1. Fill in the real launchpad and router signatures in
   `contracts/contracts/mainnet/KlubJunoswapAdapter.sol`, then `forge test`.
2. Deploy the adapter, note its address.
3. `ADAPTER=0x… PRIVATE_KEY=0x… forge script script/Deploy.s.sol --rpc-url kub_mainnet --broadcast`
4. Put the six addresses in the Vercel environment variables (see
   `web/.env.mainnet.example`).
5. Verify the contracts on bkcscan.

The system holds user deposits, so an audit before public launch is strongly
advised.
