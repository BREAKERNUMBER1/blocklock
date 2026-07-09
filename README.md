# BlockLock

A blockchain-gated physical door lock. Own the right NFT, sign a challenge with your wallet, send a token to unlock — an ESP32-controlled relay opens the door.

Built end-to-end: Solidity contracts, a Node.js verification/signaling backend, a React + wagmi frontend, and ESP32 firmware talking over MQTT — plus the infra to run it on a real server, guarding a real door.

## How it works

```
Wallet (MetaMask/WalletConnect)
   │  1. sign challenge nonce
   ▼
Frontend (React + wagmi)
   │  2. POST /api/verify  → signature + NFT ownership check
   ▼
Backend (Express)
   │  3. issue short-lived session JWT
   │  4. wallet sends 1 $GOOF token to treasury
   │  5. POST /api/submit-tx → validate tx in mempool
   │  6. publish HMAC-signed MQTT unlock command
   ▼
Mosquitto (TLS)
   │
   ▼
ESP32 firmware → relay → door
```

## Why this exists

Most "NFT-gated" demos stop at checking a wallet's holdings in a UI. This project pushes that verification the rest of the way to a physical actuator, which means every trust boundary along the path — wallet signature, on-chain ownership, token payment, command transport — has to hold up against someone standing at the door trying to get in for free.

## Stack

| Layer | Tech |
|---|---|
| Contracts | Solidity, Hardhat, OpenZeppelin (mock NFT + $GOOF token for testnet) |
| Backend | Node.js, Express, ethers.js, MQTT.js, better-sqlite3, JWT |
| Frontend | React, Vite, wagmi, WalletConnect |
| Firmware | ESP32 (Arduino), PubSubClient over MQTT/TLS |
| Infra | Mosquitto (MQTT broker), Nginx, DigitalOcean droplet |

## Security design

- **Wallet-signature auth** — the door never trusts a wallet address by itself; the client must sign a per-request nonce (`ethers.verifyMessage`), and the nonce is single-use and TTL-bound (`nonceStore.js`) to stop replay.
- **Two-factor unlock** — holding the gating NFT alone isn't enough. After signature + ownership check, the wallet must also broadcast a live $GOOF token transfer; the backend validates that transaction is genuinely in the mempool and paying the right treasury address before it will unlock anything (`unlockRouter.js`, `blockchain.js`).
- **Short-lived session tokens** — a JWT issued after step 1 scopes and time-bounds the window to complete step 2, rather than trusting a single long-lived credential.
- **HMAC-signed MQTT commands** — the unlock signal to the ESP32 is authenticated and timestamped; the firmware rejects commands older than `MAX_COMMAND_AGE_SECONDS` to close the door on delayed replay of a captured MQTT message.
- **TLS-only MQTT broker + rate limiting** — Mosquitto runs on port 8883 with TLS, and `unlockLimiter` throttles verify/submit-tx endpoints against brute force.
- **Full audit trail** — every attempt (granted, denied, tx pending, tx failed) is logged with wallet, door, and failure reason, plus optional Discord alerts on denials and failed on-chain confirmations.

## Repo layout

```
contracts/   Solidity contracts + Hardhat deploy scripts (mock NFT/token for Sepolia testing)
backend/     Express API — signature verification, NFT/tx validation, MQTT publishing, audit log
frontend/    React dApp — wallet connect, unlock flow UI
firmware/    ESP32 sketches — door controller + NFC tag writer
infra/       Mosquitto/Nginx config and server setup script
docs/        Full deployment walkthrough (testnet → mainnet)
```

## Status

Deployed and running against Sepolia testnet against a live physical relay/door setup. Mainnet cutover is a config change (contract + RPC addresses) documented in [`docs/deployment.md`](docs/deployment.md) — see that file for the full setup walkthrough, from account creation through server provisioning.

## Local setup

Each subproject has its own `.env.example` — copy to `.env` and fill in your own values (RPC keys, contract addresses, secrets). Firmware config is in `firmware/blocklock_main/config.h.example` — copy to `config.h` before flashing. See [`docs/deployment.md`](docs/deployment.md) for the full walkthrough.
