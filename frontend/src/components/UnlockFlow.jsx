import { useBlockLock, STEPS } from "../hooks/useBlockLock.js";

const STEP_LABELS = {
  [STEPS.IDLE]: null,
  [STEPS.GETTING_NONCE]: "Generating access request...",
  [STEPS.SIGNING]: "Sign the message in your wallet...",
  [STEPS.VERIFYING]: "Verifying NFT ownership...",
  [STEPS.TRANSFERRING]: "Approve 1 $GOOF token transfer in your wallet...",
  [STEPS.SUBMITTING]: "Sending unlock signal...",
  [STEPS.UNLOCKED]: "Door unlocked!",
  [STEPS.ERROR]: null,
};

const STEP_ORDER = [
  STEPS.GETTING_NONCE,
  STEPS.SIGNING,
  STEPS.VERIFYING,
  STEPS.TRANSFERRING,
  STEPS.SUBMITTING,
  STEPS.UNLOCKED,
];

export function UnlockFlow({ doorId }) {
  const { step, error, txHash, unlock, reset } = useBlockLock(doorId);
  const isLoading = step !== STEPS.IDLE && step !== STEPS.UNLOCKED && step !== STEPS.ERROR;
  const currentIndex = STEP_ORDER.indexOf(step);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.lockIcon}>{step === STEPS.UNLOCKED ? "🔓" : "🔒"}</div>
          <h1 style={styles.title}>BlockLock</h1>
          <p style={styles.subtitle}>Door: {doorId}</p>
        </div>

        {/* Progress steps */}
        {isLoading && (
          <div style={styles.progressContainer}>
            {STEP_ORDER.slice(0, -1).map((s, i) => (
              <div key={s} style={styles.progressRow}>
                <div
                  style={{
                    ...styles.progressDot,
                    background: i < currentIndex ? "#22c55e" : i === currentIndex ? "#f59e0b" : "#374151",
                  }}
                />
                <span
                  style={{
                    ...styles.progressLabel,
                    color: i === currentIndex ? "#f59e0b" : i < currentIndex ? "#22c55e" : "#6b7280",
                    fontWeight: i === currentIndex ? "600" : "400",
                  }}
                >
                  {STEP_LABELS[s]}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Success */}
        {step === STEPS.UNLOCKED && (
          <div style={styles.successBox}>
            <p style={styles.successText}>Access granted. The door will lock again in 5 seconds.</p>
            {txHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.txLink}
              >
                View transaction on Etherscan
              </a>
            )}
          </div>
        )}

        {/* Error */}
        {step === STEPS.ERROR && (
          <div style={styles.errorBox}>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {/* Action button */}
        {(step === STEPS.IDLE || step === STEPS.ERROR) && (
          <button
            style={{ ...styles.button, opacity: isLoading ? 0.6 : 1 }}
            onClick={step === STEPS.ERROR ? reset : unlock}
            disabled={isLoading}
          >
            {step === STEPS.ERROR ? "Try Again" : "Unlock Door"}
          </button>
        )}

        {step === STEPS.UNLOCKED && (
          <button style={{ ...styles.button, background: "#374151" }} onClick={reset}>
            Back
          </button>
        )}

        {/* Info */}
        {step === STEPS.IDLE && (
          <p style={styles.info}>
            Requires: 1 Goofball Gang NFT + 1 $GOOF token per unlock
          </p>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    background: "linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)",
  },
  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "16px",
    padding: "40px 32px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
  },
  header: { textAlign: "center", marginBottom: "32px" },
  lockIcon: { fontSize: "48px", marginBottom: "12px" },
  title: { fontSize: "28px", fontWeight: "700", color: "#f1f5f9", letterSpacing: "-0.5px" },
  subtitle: { color: "#6b7280", marginTop: "4px", fontSize: "14px" },
  progressContainer: { marginBottom: "24px" },
  progressRow: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" },
  progressDot: { width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0 },
  progressLabel: { fontSize: "14px" },
  successBox: {
    background: "#052e16",
    border: "1px solid #16a34a",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "24px",
    textAlign: "center",
  },
  successText: { color: "#4ade80", fontSize: "15px", marginBottom: "8px" },
  txLink: { color: "#22d3ee", fontSize: "13px", textDecoration: "none" },
  errorBox: {
    background: "#1c0a0a",
    border: "1px solid #dc2626",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "24px",
  },
  errorText: { color: "#f87171", fontSize: "14px", lineHeight: "1.5" },
  button: {
    width: "100%",
    padding: "14px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "opacity 0.2s",
    marginBottom: "12px",
  },
  info: { textAlign: "center", color: "#4b5563", fontSize: "12px", marginTop: "8px" },
};
