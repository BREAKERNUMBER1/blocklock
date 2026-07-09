import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { nonceRouter } from "./routes/nonceRouter.js";
import { unlockRouter } from "./routes/unlockRouter.js";
import { connectMQTT } from "./services/mqttService.js";
import { initAuditLog } from "./services/auditLog.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  })
);
app.use(express.json());

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", service: "blocklock-api" }));

app.use("/api", nonceRouter);
app.use("/api", unlockRouter);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  try {
    await initAuditLog();
    console.log("[DB] Audit log database ready.");

    await connectMQTT();
    console.log("[MQTT] Connected to broker.");

    const port = process.env.PORT || 3001;
    app.listen(port, () => {
      console.log(`[API] BlockLock API running on port ${port}`);
    });
  } catch (err) {
    console.error("[FATAL] Startup failed:", err);
    process.exit(1);
  }
}

start();
