/**
 * Core BlockLock unlock hook.
 * Orchestrates: nonce → sign → verify → token transfer → submit tx → unlock
 */

import { useState, useCallback } from "react";
import { useAccount, useSignMessage, useWriteContract, useChainId, useSwitchChain } from "wagmi";
import { api } from "../api/blocklock.js";
import { CONTRACTS, GOOF_TOKEN_ABI, ONE_GOOF, NETWORK } from "../config.js";

export const STEPS = {
  IDLE: "idle",
  GETTING_NONCE: "getting_nonce",
  SIGNING: "signing",
  VERIFYING: "verifying",
  TRANSFERRING: "transferring",
  SUBMITTING: "submitting",
  UNLOCKED: "unlocked",
  ERROR: "error",
};

export function useBlockLock(doorId) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState(STEPS.IDLE);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  const unlock = useCallback(async () => {
    if (!address) return;
    setError(null);
    setTxHash(null);

    // Ensure user is on the correct network
    if (chainId !== NETWORK.id) {
      try {
        await switchChain({ chainId: NETWORK.id });
      } catch {
        setError(`Please switch your wallet to ${NETWORK.name}.`);
        setStep(STEPS.ERROR);
        return;
      }
    }

    try {
      // Step 1: Get nonce from server
      setStep(STEPS.GETTING_NONCE);
      const { message } = await api.getNonce(address, doorId);

      // Step 2: Sign the message
      setStep(STEPS.SIGNING);
      let signature;
      try {
        signature = await signMessageAsync({ message });
      } catch (err) {
        if (err.name === "UserRejectedRequestError") {
          setError("Signature rejected. Please approve the signature in your wallet.");
        } else {
          setError("Failed to sign message.");
        }
        setStep(STEPS.ERROR);
        return;
      }

      // Step 3: Verify signature + NFT ownership with server
      setStep(STEPS.VERIFYING);
      const { sessionToken } = await api.verify(address, signature, doorId);

      // Step 4: Send 1 $GOOF token to treasury
      setStep(STEPS.TRANSFERRING);
      let hash;
      try {
        hash = await writeContractAsync({
          address: CONTRACTS.GOOF_TOKEN,
          abi: GOOF_TOKEN_ABI,
          functionName: "transfer",
          args: [CONTRACTS.TREASURY, ONE_GOOF],
          gas: 100000n,
        });
      } catch (err) {
        if (err.name === "UserRejectedRequestError") {
          setError("Token transfer rejected. 1 $GOOF is required to unlock.");
        } else {
          setError(`Token transfer failed: ${err.shortMessage || err.message}`);
        }
        setStep(STEPS.ERROR);
        return;
      }

      setTxHash(hash);

      // Step 5: Submit tx hash → server validates + signals ESP32
      setStep(STEPS.SUBMITTING);
      await api.submitTx(sessionToken, hash, doorId);

      setStep(STEPS.UNLOCKED);
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
      setStep(STEPS.ERROR);
    }
  }, [address, chainId, doorId, signMessageAsync, writeContractAsync, switchChain]);

  const reset = useCallback(() => {
    setStep(STEPS.IDLE);
    setError(null);
    setTxHash(null);
  }, []);

  return { step, error, txHash, unlock, reset };
}
