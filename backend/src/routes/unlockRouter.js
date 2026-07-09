/**
 * POST /api/verify    — verify signature + NFT ownership → return session token
 * POST /api/submit-tx — validate mempool tx → publish MQTT unlock → log attempt
 */

import { Router } from "express";
import { ethers } from "ethers";
import jwt from "jsonwebtoken";
import { getNonce, consumeNonce } from "../services/nonceStore.js";
import { checkNFTOwnership, validateMempoolTx, monitorTx } from "../services/blockchain.js";
import { publishUnlock } from "../services/mqttService.js";
import { logAttempt, updateConfirmation } from "../services/auditLog.js";
import { notifyUnlock } from "../services/discordNotifier.js";
import { unlockLimiter } from "../middleware/rateLimiter.js";

export const unlockRouter = Router();

// ─── Step 1: Verify signature + NFT ownership ────────────────────────────────

unlockRouter.post("/verify", unlockLimiter, async (req, res) => {
  const { address, signature, doorId } = req.body;

  if (!address || !ethers.isAddress(address)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }
  if (!signature || !doorId) {
    return res.status(400).json({ error: "Missing signature or doorId" });
  }

  // Fetch the stored nonce entry
  const entry = getNonce(address, doorId);
  if (!entry) {
    return res.status(401).json({ error: "Nonce not found or expired. Please request a new one." });
  }

  // Recover signer from signature
  let recovered;
  try {
    recovered = ethers.verifyMessage(entry.message, signature);
  } catch {
    return res.status(401).json({ error: "Signature verification failed" });
  }

  if (recovered.toLowerCase() !== address.toLowerCase()) {
    logAttempt({ doorId, wallet: address, status: "denied", failureReason: "Signature mismatch" });
    return res.status(401).json({ error: "Signature does not match wallet address" });
  }

  // Check NFT ownership on-chain
  let ownsNFT;
  try {
    ownsNFT = await checkNFTOwnership(address);
  } catch (err) {
    console.error("[Verify] NFT check failed:", err.message);
    return res.status(503).json({ error: "Unable to verify NFT ownership. Try again." });
  }

  if (!ownsNFT) {
    logAttempt({ doorId, wallet: address, status: "denied", failureReason: "Does not hold Goofball Gang NFT" });
    await notifyUnlock({ doorId, wallet: address, txHash: null, status: "denied" });
    return res.status(403).json({
      error: "Access denied. This wallet does not hold a Goofball Gang NFT.",
    });
  }

  // Consume nonce — prevents replay
  consumeNonce(address, doorId);

  // Issue short-lived session token
  const ttl = parseInt(process.env.SESSION_TTL_SECONDS) || 300;
  const sessionToken = jwt.sign(
    { address: address.toLowerCase(), doorId, verified: true },
    process.env.JWT_SECRET,
    { expiresIn: ttl }
  );

  res.json({
    verified: true,
    sessionToken,
    expiresIn: ttl,
    message: "Wallet verified. Please send 1 $GOOF token to complete the unlock.",
  });
});

// ─── Step 2: Submit tx hash → validate → unlock ───────────────────────────────

unlockRouter.post("/submit-tx", unlockLimiter, async (req, res) => {
  const { sessionToken, txHash, doorId } = req.body;

  if (!sessionToken || !txHash || !doorId) {
    return res.status(400).json({ error: "Missing sessionToken, txHash, or doorId" });
  }

  // Verify the session token
  let session;
  try {
    session = jwt.verify(sessionToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Session expired or invalid. Please start over." });
  }

  if (session.doorId !== doorId) {
    return res.status(401).json({ error: "Session doorId mismatch" });
  }

  const wallet = session.address;

  // Validate the tx is actually in the mempool and is a valid $GOOF transfer
  let validation;
  try {
    validation = await validateMempoolTx(txHash, wallet);
  } catch (err) {
    console.error("[SubmitTx] Mempool validation error:", err.message);
    return res.status(503).json({ error: "Unable to validate transaction. Try again." });
  }

  if (!validation.valid) {
    const rowId = logAttempt({
      doorId,
      wallet,
      txHash,
      status: "denied",
      failureReason: validation.reason,
    });
    await notifyUnlock({ doorId, wallet, txHash, status: "denied" });
    return res.status(400).json({ error: `Transaction invalid: ${validation.reason}` });
  }

  // Log as pending — unlock on submission
  const rowId = logAttempt({ doorId, wallet, txHash, status: "tx_pending" });

  // Publish unlock signal to ESP32 via MQTT
  try {
    await publishUnlock(doorId, 5000);
  } catch (err) {
    console.error("[SubmitTx] MQTT publish failed:", err.message);
    updateConfirmation(rowId, false, "MQTT publish failed");
    return res.status(503).json({ error: "Failed to send unlock signal. Contact support." });
  }

  await notifyUnlock({ doorId, wallet, txHash, status: "unlocked" });

  // Monitor tx in background — update audit log and alert on failure
  monitorTx(txHash, {
    onConfirmed: (receipt) => {
      console.log(`[TxMonitor] TX confirmed in block ${receipt.blockNumber}: ${txHash}`);
      updateConfirmation(rowId, true);
    },
    onFailed: (reason) => {
      console.warn(`[TxMonitor] TX FAILED (${txHash}): ${reason}`);
      updateConfirmation(rowId, false, reason);
      // Log and alert — admin must follow up with this wallet
      notifyUnlock({ doorId, wallet, txHash, status: "tx_failed" });
      console.warn(`[FOLLOW-UP REQUIRED] Wallet ${wallet} — TX ${txHash} — Door ${doorId}`);
    },
  });

  res.json({
    success: true,
    message: "Unlock signal sent. Door will open for 5 seconds.",
    txHash,
  });
});
