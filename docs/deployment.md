# BlockLock — Deployment Guide

## Overview

```
Sepolia Testnet → Verify everything works → Mainnet
```

---

## Step 1: Accounts & Keys to Create First

| Account | Where | Notes |
|---|---|---|
| Alchemy account | alchemy.com | Free tier, create two apps: Sepolia + Mainnet |
| Throwaway deployer wallet | MetaMask | New wallet for Sepolia deployment only. Never use your main wallet. |
| Sepolia ETH | sepoliafaucet.com | Free — needed for gas to deploy contracts |
| WalletConnect project | cloud.walletconnect.com | Free, needed for mobile wallet support |
| DigitalOcean account | digitalocean.com | $6/mo basic droplet (Ubuntu 22.04) |
| Domain name | Any registrar | Point DNS A record to DigitalOcean server IP |
| Discord webhook (optional) | Your Discord server → Settings → Integrations → Webhooks | |

---

## Step 2: Deploy Test Contracts (Sepolia)

```bash
cd blocklock/contracts
cp .env.example .env
# Fill in ALCHEMY_RPC_SEPOLIA and DEPLOYER_PRIVATE_KEY
npm install
npm run deploy:sepolia
```

Copy the output addresses into `backend/.env` and `frontend/.env`.

---

## Step 3: Server Setup

```bash
# On your DigitalOcean Droplet (Ubuntu 22.04, run as root)
git clone <your-repo> /opt/blocklock
cd /opt/blocklock/infra
bash setup.sh your-domain.com

# Fill in backend environment
cp /opt/blocklock-backend/.env.example /opt/blocklock-backend/.env
nano /opt/blocklock-backend/.env
# Required fields:
#   ALCHEMY_RPC (Sepolia URL)
#   NFT_CONTRACT_ADDRESS (from Step 2)
#   GOOF_TOKEN_ADDRESS (from Step 2)
#   TREASURY_WALLET (your wallet address)
#   JWT_SECRET (generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
#   MQTT_HMAC_SECRET (generate same way)
#   MQTT_PASSWORD (same as what you set during setup.sh)
#   FRONTEND_URL (https://your-domain.com)

pm2 restart blocklock-api
```

---

## Step 4: Deploy Frontend

```bash
cd blocklock/frontend
cp .env.example .env
# Fill in:
#   VITE_NFT_CONTRACT_ADDRESS
#   VITE_GOOF_TOKEN_ADDRESS
#   VITE_TREASURY_WALLET
#   VITE_WALLETCONNECT_PROJECT_ID

npm install
npm run build

# Copy built files to web root on server
scp -r dist/. root@YOUR_SERVER_IP:/var/www/blocklock/
```

---

## Step 5: Program NFC Tags

1. Wire ESP32 + PN532 per the wiring diagram (PN532 section).
2. Edit `firmware/nfc_writer/nfc_writer.ino`:
   - Set `DOOR_URL` to `https://your-domain.com/?door=door_001`
3. Upload `nfc_writer` sketch to ESP32.
4. Open Serial Monitor at 115200 baud.
5. Place blank NTAG215 NFC sticker on PN532 when prompted.
6. Tag is written. Test by scanning with your phone — it should open the dApp.

---

## Step 6: Flash ESP32 (Door Unit)

1. Edit `firmware/blocklock_main/config.h`:
   - `WIFI_SSID`, `WIFI_PASSWORD`
   - `MQTT_BROKER` = your server IP or domain
   - `MQTT_PASSWORD` = password set during setup.sh
   - `MQTT_HMAC_SECRET` = same value as `MQTT_HMAC_SECRET` in backend `.env`
   - `DOOR_ID` = `door_001`
2. Upload `blocklock_main` sketch to ESP32.
3. Open Serial Monitor — you should see:
   ```
   [WiFi] Connected. IP: ...
   [MQTT] Connected.
   [READY] Door door_001 listening for unlock commands.
   ```

---

## Step 7: End-to-End Test

1. Scan NFC tag with your phone.
2. Connect MetaMask to Sepolia network.
3. Import your deployer wallet (has test NFT and GOOF tokens from deploy script).
4. Tap "Unlock Door":
   - Sign the message when prompted.
   - Approve the 1 GOOF token transfer.
5. Relay should click and door should open for 5 seconds.
6. Check Discord for notification.
7. Check audit log: `sqlite3 /opt/blocklock-backend/data/audit.db "SELECT * FROM unlock_attempts;"`

---

## Step 8: Go Mainnet

When testing is complete:

**contracts/hardhat.config.js** — already supports mainnet, just run:
```bash
npm run deploy:mainnet  # NOTE: No mock contracts to deploy — real contracts are already on mainnet
```
The deploy script prints the mainnet addresses and exits without deploying anything.

**backend/.env** — swap:
```
ALCHEMY_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
NFT_CONTRACT_ADDRESS=0xf1987f66553460a4f0730ce17484f5a9a2e883a6
GOOF_TOKEN_ADDRESS=0x84802079Fde7658F9D0969810693a2FA1870EEdF
```

**frontend/.env** — swap same addresses, rebuild and redeploy frontend.

**frontend/src/config.js** — change `NETWORK.id` to `1` (mainnet).

---

## Production TLS for ESP32 MQTT

The firmware uses `wifiClient.setInsecure()` for development (skips cert verification).
For production, replace with proper CA cert verification:

1. Extract your server's CA cert:
   ```bash
   openssl s_client -connect YOUR_DOMAIN:8883 -showcerts 2>/dev/null | openssl x509 -outform PEM > ca_cert.pem
   ```
2. Add the cert content as a string in `config.h`:
   ```cpp
   const char* ca_cert = R"EOF(
   -----BEGIN CERTIFICATE-----
   ...your cert...
   -----END CERTIFICATE-----
   )EOF";
   ```
3. In `setup()`, replace `wifiClient.setInsecure()` with:
   ```cpp
   wifiClient.setCACert(ca_cert);
   ```

---

## Adding More Doors (Scaling)

1. Flash a new ESP32 with `config.h` — change only `DOOR_ID` (e.g., `door_002`) and `MQTT_CLIENT_ID`.
2. Program a new NFC tag with URL `?door=door_002`.
3. The backend and dApp already support multiple doors via the `doorId` parameter.
4. No server changes needed.

---

## Checking Failed Transactions

Failed unlock transactions are logged in the SQLite audit database:

```bash
sqlite3 /opt/blocklock-backend/data/audit.db \
  "SELECT wallet, tx_hash, failure_reason, timestamp FROM unlock_attempts WHERE confirmed=0 AND tx_hash IS NOT NULL;"
```

Use the tx hash to look up the wallet on Etherscan and follow up manually.
