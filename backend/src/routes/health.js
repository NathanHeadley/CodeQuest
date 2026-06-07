import { Router } from "express";

import { config } from "../config.js";
import { ping } from "../db.js";

const router = Router();

// Liveness + dependency check. Public (no auth) so nginx/uptime checks can hit it.
router.get("/health", async (req, res) => {
  const health = {
    status: "ok",
    service: "codequest-api",
    time: new Date().toISOString(),
  };

  try {
    await ping();
    health.db = "ok";
  } catch (e) {
    health.status = "degraded";
    health.db = `error: ${e.message}`;
  }

  try {
    const r = await fetch(`${config.validatorUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    health.validator = r.ok ? "ok" : `error: ${r.status}`;
    if (!r.ok) health.status = "degraded";
  } catch (e) {
    health.status = "degraded";
    health.validator = `error: ${e.message}`;
  }

  res.status(health.status === "ok" ? 200 : 503).json(health);
});

export default router;
