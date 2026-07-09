/**
 * BlockLock frontend configuration.
 * Swap NETWORK and contract addresses when moving from Sepolia to mainnet.
 */

export const NETWORK = {
  // Sepolia testnet
  id: 11155111,
  name: "Sepolia",
  // Swap for mainnet:
  // id: 1,
  // name: "Ethereum",
};

export const CONTRACTS = {
  // Sepolia: filled in after running contracts/scripts/deploy.js
  NFT: import.meta.env.VITE_NFT_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000",
  GOOF_TOKEN: import.meta.env.VITE_GOOF_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000",
  TREASURY: import.meta.env.VITE_TREASURY_WALLET || "0x0000000000000000000000000000000000000000",
  // Mainnet addresses (uncomment when going live):
  // NFT: "0xf1987f66553460a4f0730ce17484f5a9a2e883a6",
  // GOOF_TOKEN: "0x84802079Fde7658F9D0969810693a2FA1870EEdF",
};

export const API_BASE = import.meta.env.VITE_API_URL || "/api";

// WalletConnect project ID — get free at cloud.walletconnect.com
export const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "YOUR_WALLETCONNECT_PROJECT_ID";

export const GOOF_TOKEN_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

// 1 $GOOF in base units (18 decimals)
export const ONE_GOOF = BigInt("1000000000000000000");
