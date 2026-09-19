# KLUB web app

Static Next.js app for the KLUB contracts on Bitkub Chain. No backend: every
page reads the contracts over RPC and writes through the user's wallet.
`next build` produces a fully static export that can be hosted on IPFS or
Vercel.

## Setup

```
cp .env.example .env.local   # fill in the addresses from the deploy script
npm install
npm run dev                  # http://localhost:3000
npm run build                # static export in ./out
```

Testnet defaults: chain id 25925, RPC https://rpc-testnet.bitkubchain.io.

## Pages

| Route | What it does |
| --- | --- |
| `/` | Your events and upcoming events, grouped by day |
| `/discover` | Upcoming, happening now, past |
| `/event?id=N` | Event detail: token, refund policy, reward pool, RSVP + deposit in one button |
| `/pass?id=N` | Wallet QR for the door, deposit and attendance status, claim reward |
| `/chats` | Telegram link per event (KLUB has no in-app chat) |
| `/organizer?address=0x…` | Organizer page with follow and their events |
| `/create` | Create an event: token choice, capacity, hold/burn, reward mode, refund policy, initial buy |
| `/manage?id=N` | Approve, reject, invite, batch check-in, staff, fund pool, finalize, withdraw |
| `/kiosk?id=N` | Venue screen: generates a kiosk key in the browser, registers it on chain, rotates a signed QR every 30 s |
| `/settings` | Wallet, on-chain profile (name, avatar CID, Telegram) |

## How the pieces fit

- **Wallet**: wagmi v2 with EIP-6963 discovery, so MetaMask and any wallet
  browser on KUB Chain work without extra config.
- **RSVP**: the page checks the ERC20 allowance and sends `approve` then `rsvp`
  when needed, so the deposit lands in one flow.
- **Kiosk**: the private key never leaves the screen's browser (localStorage).
  The QR carries `{eventId, inbound, windowId, signature}`; the guest's wallet
  submits it to `checkInWithKiosk`, which burns and checks in atomically.
- **Metadata**: cover, description, venue, coordinates and the Telegram link
  come from the IPFS CID stored on chain.
- **External services**: Google Maps embed for the venue map, Open-Meteo for
  weather, n8n for Telegram notifications. If any is down, the app still works.

## Metadata format

```json
{
  "title": "KLUB Testnet Night",
  "description": "…",
  "coverCID": "bafy…",
  "venue": "Foundry",
  "address": "1/8 Sukhumvit 49, Bangkok",
  "city": "Bangkok",
  "lat": 13.73,
  "lng": 100.57,
  "telegram": "https://t.me/…"
}
```
