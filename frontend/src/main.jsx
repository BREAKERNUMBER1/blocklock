import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia, mainnet } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import { WALLETCONNECT_PROJECT_ID, NETWORK } from "./config.js";

const activeChain = NETWORK.id === 1 ? mainnet : sepolia;

const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [
    injected(), // MetaMask and other injected wallets
    walletConnect({ projectId: WALLETCONNECT_PROJECT_ID }), // Mobile wallets
  ],
  transports: {
    [activeChain.id]: http(),
  },
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
