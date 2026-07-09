import { useAccount } from "wagmi";
import { WalletConnect } from "./components/WalletConnect.jsx";
import { UnlockFlow } from "./components/UnlockFlow.jsx";

// doorId comes from the URL query string — e.g. ?door=door_001
// This allows the same dApp to serve multiple doors.
function getDoorId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("door") || "door_001";
}

export default function App() {
  const { isConnected } = useAccount();
  const doorId = getDoorId();

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)" }}>
      {isConnected ? (
        <UnlockFlow doorId={doorId} />
      ) : (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "16px",
              padding: "40px 32px",
              width: "100%",
              maxWidth: "420px",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>🔒</div>
              <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#f1f5f9" }}>BlockLock</h1>
              <p style={{ color: "#6b7280", marginTop: "4px" }}>Door: {doorId}</p>
            </div>
            <WalletConnect />
          </div>
        </div>
      )}
    </div>
  );
}
