import { API_BASE } from "../config.js";

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  getNonce: (address, doorId) => post("/nonce", { address, doorId }),
  verify: (address, signature, doorId) => post("/verify", { address, signature, doorId }),
  submitTx: (sessionToken, txHash, doorId) => post("/submit-tx", { sessionToken, txHash, doorId }),
};
