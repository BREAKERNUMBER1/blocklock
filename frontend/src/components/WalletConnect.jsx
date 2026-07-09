import { useAccount, useConnect, useDisconnect } from "wagmi";

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div style={styles.connected}>
        <span style={styles.address}>
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <button style={styles.disconnectBtn} onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Connect your wallet to continue</h2>
      <div style={styles.connectorList}>
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            style={styles.connectorBtn}
            onClick={() => connect({ connector })}
            disabled={isPending}
          >
            {connector.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: { textAlign: "center", padding: "20px 0" },
  heading: { color: "#9ca3af", fontSize: "15px", marginBottom: "20px" },
  connectorList: { display: "flex", flexDirection: "column", gap: "10px" },
  connectorBtn: {
    padding: "12px 24px",
    background: "#1f2937",
    color: "#e2e8f0",
    border: "1px solid #374151",
    borderRadius: "8px",
    fontSize: "15px",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  connected: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" },
  address: {
    background: "#1f2937",
    color: "#22d3ee",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "13px",
    fontFamily: "monospace",
  },
  disconnectBtn: {
    padding: "6px 12px",
    background: "transparent",
    color: "#6b7280",
    border: "1px solid #374151",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
  },
};
