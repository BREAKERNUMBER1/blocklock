/**
 * In-memory nonce store with TTL expiry.
 * Each nonce is keyed by address+doorId, expires after NONCE_TTL_SECONDS.
 * Single-use: consumed on first successful verification.
 */

const store = new Map();
const TTL_MS = (parseInt(process.env.NONCE_TTL_SECONDS) || 120) * 1000;

// Purge expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 60_000);

function makeKey(address, doorId) {
  return `${address.toLowerCase()}:${doorId}`;
}

export function storeNonce(address, doorId, nonce, message) {
  const key = makeKey(address, doorId);
  store.set(key, {
    nonce,
    message,
    expiresAt: Date.now() + TTL_MS,
    used: false,
  });
}

export function getNonce(address, doorId) {
  const key = makeKey(address, doorId);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function consumeNonce(address, doorId) {
  const key = makeKey(address, doorId);
  const entry = store.get(key);
  if (!entry || entry.used) return false;
  store.delete(key);
  return true;
}
