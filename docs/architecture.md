# BlockLock — Architecture

This doc covers how the pieces fit together, why each trust boundary is checked the way it is, and where the current implementation falls short of the design intent. For "how do I run this," see [`deployment.md`](deployment.md). For wiring, see [`wiring.md`](wiring.md).

## Components

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌──────────┐     ┌────────┐
│  Wallet    │────▶│  Frontend  │────▶│  Backend   │────▶│  MQTT    │────▶│ ESP32  │
│ (MetaMask) │     │ React+wagmi│     │  Express   │     │Mosquitto │     │Firmware│
└────────────┘     └────────────┘     └─────┬──────┘     └──────────┘     └───┬────┘
                                             │                                  │
                                             ▼                                  ▼
                                       ┌────────────┐                    ┌───────────┐
                                       │  Ethereum  │                    │   Relay   │
                                       │ (Alchemy)  │                    │  → Lock   │
                                       └────────────┘                    └───────────┘
                                             │
                                             ▼
                                       ┌────────────┐
                                       │  SQLite    │
                                       │ audit log  │
                                       └────────────┘
```

- **Frontend** (`frontend/`) — React app served as a static SPA. Connects a wallet via wagmi/WalletConnect, drives the two-step unlock flow, has no privileged secrets of its own.
- **Backend** (`backend/`) — the only component that holds secrets (JWT secret, MQTT HMAC secret, RPC key) and the only component trusted to issue an unlock command.
- **Contracts** (`contracts/`) — on mainnet these are the real Goofball Gang NFT and $GOOF ERC-20; on Sepolia, `MockGoofballGang.sol` and `MockGoof.sol` stand in so the whole flow can be tested without touching real assets.
- **MQTT broker** (`infra/mosquitto.conf`) — Mosquitto over TLS (port 8883), a dumb authenticated pipe. It never validates unlock *authorization* — that's the backend's job before it ever publishes.
- **Firmware** (`firmware/blocklock_main/blocklock_main.ino`) — the only component with physical control of the relay. It trusts exactly one thing: a valid HMAC over the MQTT payload.

## Request flow

1. **`POST /api/nonce`** (`nonceRouter.js`) — client sends `{address, doorId}`; backend generates a UUID nonce, stores it keyed by `address:doorId` with a TTL (`nonceStore.js`, default 120s), and returns a human-readable challenge message to sign.
2. **Wallet signs** the challenge message client-side. No transaction, no gas — a pure signature.
3. **`POST /api/verify`** (`unlockRouter.js`) — backend recovers the signer with `ethers.verifyMessage`, checks it matches the claimed address, checks the address holds ≥1 NFT via `balanceOf` (`blockchain.js`), consumes the nonce (single-use), and — only if all of that holds — issues a short-lived JWT (`SESSION_TTL_SECONDS`, default 300s) scoped to that wallet + door.
4. **Client broadcasts** a `transfer(treasury, 1e18)` call on the $GOOF contract and gets back a `txHash` — this is the "pay the toll" step.
5. **`POST /api/submit-tx`** (`unlockRouter.js`) — backend verifies the session JWT, then calls `validateMempoolTx` (`blockchain.js`), which:
   - confirms the tx actually exists (`getTransaction`)
   - confirms `tx.to` is the $GOOF contract, not something else
   - confirms `tx.from` matches the verified wallet (can't pay with one wallet to unlock for another)
   - decodes the calldata and confirms the recipient is the treasury address and the amount is ≥ 1 GOOF
   This check runs against the **mempool**, before the tx is mined — the door doesn't wait a block time to open, but it does insist the payment is real and pointed at the right place before it commits to unlocking.
6. **Backend publishes** an HMAC-signed unlock command over MQTT (`mqttService.js`) and logs a `tx_pending` row (`auditLog.js`).
7. **ESP32** receives the message, recomputes the HMAC over the reconstructed body, and only pulses the relay if it matches (`blocklock_main.ino`).
8. **Backend monitors** the tx in the background (`monitorTx`, polling every ~12s) and updates the audit row to confirmed or failed once it lands on-chain — the door already opened on mempool evidence, so a later revert is a "chase this up" case, not a "we let someone in for free" case, since the relay only pulses once the mempool check passed.

## Trust boundaries

| Boundary | Enforced by | What it stops |
|---|---|---|
| Wallet ↔ Backend (identity) | ECDSA signature over a single-use, TTL'd nonce | Claiming an address you don't control |
| Wallet ↔ Backend (eligibility) | `balanceOf` read against the real NFT contract | Unlocking without owning the gating NFT |
| Backend ↔ Backend (session) | Short-lived JWT between verify and submit-tx | Replaying an old verify result indefinitely |
| Wallet ↔ Backend (payment) | Mempool tx decode: contract, sender, recipient, amount | Faking payment, paying the wrong address, or unlocking on someone else's payment |
| Backend ↔ MQTT broker ↔ Firmware | HMAC-SHA256 over the unlock payload, shared secret only backend + firmware hold | Anyone with just broker credentials forging an unlock command |
| Backend ↔ Firmware (freshness) | *Designed:* `timestamp` + `MAX_COMMAND_AGE_SECONDS`. **Actual: not implemented — see below.** | — |

## Known limitations / roadmap

Being explicit about the gap between design and implementation, in priority order:

1. **MQTT command replay is not actually prevented today.** `mqttService.js` includes a `timestamp` and a random `nonce` in every signed payload, and `config.h` defines `MAX_COMMAND_AGE_SECONDS`. But `blocklock_main.ino`'s `onMqttMessage` never compares the timestamp against that constant, and the `nonceSeen[256]` dedup array is declared but never read or written. **Net effect:** a valid HMAC-signed unlock message captured off the broker (or logged anywhere) can be republished to open the door at any point in the future, with no new token payment. This is the most important thing to fix before this is anything more than a testnet demo — the fix is small (store last-seen nonce/timestamp per door, reject anything outside the window or already seen) but it's not there yet.
2. **`wifiClient.setInsecure()` is the default** — the ESP32 skips TLS certificate verification unless you follow the CA-cert steps in `deployment.md`. The HMAC still authenticates the unlock command payload even without cert pinning, but broker traffic itself isn't verified against a trusted CA by default.
3. **Rate limits are dev-tuned**, not production-tuned (`rateLimiter.js` — 50 unlock attempts/min/wallet, explicitly commented as "relaxed for testing").
4. **No repo-level LICENSE.** Contracts carry an individual MIT SPDX header; nothing at the repo root states terms for the rest of the code.

## Why two-factor unlock (NFT + token payment) instead of just NFT ownership

An NFT-gate alone is a read of public state — anyone who can see the chain can see who qualifies, and a "prove you own it" signature check is all that's needed to open the door to any of them, indefinitely, for free. Requiring a live token payment on top:

- adds a cost per unlock (spam/bot-proofing a physical door is a real concern once it's wired to the internet)
- ties each unlock to a fresh, unpredictable on-chain action (a tx hash) rather than a static credential, which is what makes the mempool-validation step meaningful
- gives the system a natural audit trail denominated in the same asset as the access control, which was useful for the "who's actually using this and how often" question once it moved off a whiteboard and onto a real door
