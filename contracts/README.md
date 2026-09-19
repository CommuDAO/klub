# KLUB contracts

Event check-in on KUB Chain, wired to the KUB Chain launchpad and DEX. Everything the app needs lives
on chain; the web app is a static site that reads these contracts over RPC.

Solidity 0.8.24, optimizer on (200 runs). No external dependencies.

## Contracts

| File | Role |
| --- | --- |
| `KlubTypes.sol` | Shared enums and structs (reward mode, refund destinations, event config) |
| `KlubEventFactory.sol` | Creates an event, deploys or links the token, takes the organizer initial buy |
| `KlubCheckInRegistry.sol` | RSVP with deposit, approval, waitlist, three check-in methods, burn, check-out, settlement |
| `KlubRewardVault.sol` | Holds KUB and event-token rewards, finalize, claim, quest claim, leftover |
| `KlubQuestRegistry.sol` | Five quest kinds, referral tracking, booth and social approval |
| `KlubProfileRegistry.sol` | Display name, avatar, Telegram handle, following organizers |
| `interfaces/IKlubBuyAdapter.sol` | Boundary to the launchpad and router |
| `testnet/KlubTestnetAdapter.sol` | Testnet stand-in for that adapter, with a faucet |

## Testnet first

Bitkub Chain Testnet: chain id **25925**, RPC `https://rpc-testnet.bitkubchain.io`,
WSS `wss://wss-testnet.bitkubchain.io`, explorer `https://testnet.bkcscan.com`,
native token tKUB.

On testnet, deploy `KlubTestnetAdapter` in place of the real adapter. It mints
1000 test tokens per tKUB instead of running a bonding curve, so RSVP, deposit,
burn, check-out, rewards and quests can all be exercised end to end. Nothing
else changes when moving to mainnet: only the adapter address is swapped for the
one that talks to the launchpad and the router.

## Deploy order

1. `KlubEventFactory(admin, minInitialBuy)` — `minInitialBuy` = 10 KUB (`10e18`)
2. `KlubCheckInRegistry(factory, admin)`
3. `KlubRewardVault(factory, registry, admin)`
4. `KlubQuestRegistry(factory, registry, vault)`
5. `KlubProfileRegistry()`
6. Adapter: `KlubTestnetAdapter()` on testnet, the real adapter on mainnet

Then wire them:

- `factory.setWiring(adapter, registry)`
- `registry.setVault(vault)`
- `vault.setQuests(questRegistry)`

## Notes for the audit

- Deposits are pulled and paid out with balance-difference checks, so
  fee-on-transfer tokens revert instead of leaving an event short.
- `settle()` closes attendance in constant gas: no-show deposits are handled as
  one aggregate transfer, and guests who never checked out get `minCredit`
  added in a single arithmetic step.
- `minCredit` and the reward mode lock at the first check-in; the refund policy
  locks at creation.
- Kiosk signatures accept the current 30-second window and the previous one.
  Secret-code signatures are bound to the guest address, so a pending
  transaction cannot be replayed by another wallet.
- KLUB passes its own `minTokensOut` on every buy and does not rely on
  router-level slippage checks.
- Known gap: the organizer can set the refund policy so that rejected RSVPs and
  no-shows are burned or moved to the reward pool. This is intentional and shown
  on the event page before a guest deposits.

## Tests

34 Foundry tests, all passing:

```
forge test
```

Covered: event creation and the minimum initial buy, reusing an existing token,
`minCredit` locking at the first check-in, RSVP deposits, approval, invites,
capacity and waitlist promotion, cancel before/after the cutoff, rejection
refunds, staff / kiosk / secret-code check-in, kiosk window expiry and revoke,
code signatures bound to one wallet, check-out weights and minimum credit,
settlement of no-show deposits, reward splits by time and equally, forfeited
deposits feeding the reward pool, double-claim protection, leftover withdrawal,
and all five quest kinds.

## Deploy to Bitkub testnet

```
export PRIVATE_KEY=0x...
forge script script/Deploy.s.sol --rpc-url kub_testnet --broadcast
FACTORY=0x... VAULT=0x... forge script script/SeedTestnet.s.sol --rpc-url kub_testnet --broadcast
```

`Deploy.s.sol` deploys `KlubTestnetAdapter` automatically on testnet. On
mainnet it refuses to run without `ADAPTER`, the address of the adapter that
talks to the launchpad and the router.
