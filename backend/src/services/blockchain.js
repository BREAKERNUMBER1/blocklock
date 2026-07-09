/**
 * Blockchain service — Alchemy RPC via ethers.js v6.
 * Handles: NFT ownership checks, mempool tx validation, tx confirmation monitoring.
 */

import { ethers } from "ethers";

// Minimal ABIs — only what we need
const ERC721_ABI = ["function balanceOf(address owner) view returns (uint256)"];
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

let provider;

export function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_RPC);
  }
  return provider;
}

/**
 * Returns true if the wallet holds at least 1 NFT from the Goofball Gang collection.
 */
export async function checkNFTOwnership(walletAddress) {
  const nft = new ethers.Contract(
    process.env.NFT_CONTRACT_ADDRESS,
    ERC721_ABI,
    getProvider()
  );
  const balance = await nft.balanceOf(walletAddress);
  return balance > 0n;
}

/**
 * Validates a transaction in the mempool before triggering unlock.
 * Checks:
 *   1. Tx exists in mempool (not fake)
 *   2. Tx is calling the $GOOF token contract
 *   3. Calldata decodes to transfer(treasury, amount >= 1 GOOF)
 *   4. From address matches the verified wallet
 */
export async function validateMempoolTx(txHash, fromAddress) {
  const p = getProvider();
  const tx = await p.getTransaction(txHash);

  if (!tx) {
    return { valid: false, reason: "Transaction not found in mempool" };
  }

  const tokenContract = process.env.GOOF_TOKEN_ADDRESS.toLowerCase();
  const treasury = process.env.TREASURY_WALLET.toLowerCase();

  if (!tx.to || tx.to.toLowerCase() !== tokenContract) {
    return { valid: false, reason: "Transaction is not to the $GOOF token contract" };
  }

  if (tx.from.toLowerCase() !== fromAddress.toLowerCase()) {
    return { valid: false, reason: "Transaction sender does not match verified wallet" };
  }

  // Decode calldata — ERC20 transfer(address,uint256) selector: 0xa9059cbb
  const TRANSFER_SELECTOR = "0xa9059cbb";
  if (!tx.data.startsWith(TRANSFER_SELECTOR)) {
    return { valid: false, reason: "Transaction is not an ERC-20 transfer call" };
  }

  try {
    const iface = new ethers.Interface(ERC20_ABI);
    const decoded = iface.decodeFunctionData("transfer", tx.data);
    const toAddress = decoded[0].toLowerCase();
    const amount = decoded[1]; // BigInt, in token base units

    if (toAddress !== treasury) {
      return {
        valid: false,
        reason: `Token recipient ${toAddress} does not match treasury ${treasury}`,
      };
    }

    // Require at least 1 GOOF (1e18 units — ERC20 decimals=18)
    const ONE_GOOF = ethers.parseEther("1");
    if (amount < ONE_GOOF) {
      return { valid: false, reason: `Transfer amount too low: ${ethers.formatEther(amount)} GOOF` };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Failed to decode transaction calldata" };
  }
}

/**
 * Monitors a submitted transaction until it is confirmed or fails.
 * Calls onConfirmed(receipt) or onFailed(reason) when settled.
 * Non-blocking — runs in the background.
 */
export function monitorTx(txHash, { onConfirmed, onFailed }) {
  const p = getProvider();
  const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const start = Date.now();

  const poll = async () => {
    if (Date.now() - start > TIMEOUT_MS) {
      onFailed("Transaction monitoring timed out after 10 minutes");
      return;
    }

    try {
      const receipt = await p.getTransactionReceipt(txHash);
      if (receipt === null) {
        // Still pending
        setTimeout(poll, 12_000); // poll every ~12s (one Ethereum block)
        return;
      }

      if (receipt.status === 1) {
        onConfirmed(receipt);
      } else {
        onFailed("Transaction reverted on-chain");
      }
    } catch (err) {
      console.error("[TxMonitor] Poll error:", err.message);
      setTimeout(poll, 15_000);
    }
  };

  setTimeout(poll, 5_000); // first check after 5s
}
