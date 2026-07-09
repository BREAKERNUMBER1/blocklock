import rateLimit from "express-rate-limit";

// 50 attempts per wallet per minute — relaxed for testing
export const unlockLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  keyGenerator: (req) => {
    // Key by wallet address if provided, else by IP
    const addr = req.body?.address;
    return addr ? addr.toLowerCase() : req.ip;
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many requests. Please wait a minute before trying again.",
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limit on nonce generation — 10 per minute per IP
export const nonceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many nonce requests." });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
