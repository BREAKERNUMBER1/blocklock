/**
 * POST /api/nonce
 * Generates a one-time, time-limited message for the user to sign with their wallet.
 * Prevents replay attacks — nonce expires after NONCE_TTL_SECONDS and is single-use.
 */

import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { ethers } from "ethers";
import { storeNonce } from "../services/nonceStore.js";
import { nonceLimiter } from "../middleware/rateLimiter.js";

export const nonceRouter = Router();

nonceRouter.post("/nonce", nonceLimiter, (req, res) => {
  const { address, doorId } = req.body;

  if (!address || !ethers.isAddress(address)) {
    return res.status(400).json({ error: "Invalid or missing wallet address" });
  }

  if (!doorId || typeof doorId !== "string" || !/^door_\w+$/.test(doorId)) {
    return res.status(400).json({ error: "Invalid or missing doorId (format: door_001)" });
  }

  const nonce = uuidv4();
  const timestamp = Math.floor(Date.now() / 1000);
  const ttl = parseInt(process.env.NONCE_TTL_SECONDS) || 120;

  const message = [
    "BlockLock Access Request",
    `Door: ${doorId}`,
    `Nonce: ${nonce}`,
    `Timestamp: ${timestamp}`,
    `Expires in: ${ttl} seconds`,
    "",
    "By signing you confirm ownership of this wallet.",
    "This signature cannot be used to transfer funds.",
  ].join("\n");

  storeNonce(address, doorId, nonce, message);

  res.json({
    message,
    nonce,
    expiresIn: ttl,
  });
});
