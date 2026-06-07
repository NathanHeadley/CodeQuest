import http from "node:http";

import express from "express";
import helmet from "helmet";

import { config } from "./config.js";
import dashboardRouter from "./routes/dashboard.js";
import gameRouter from "./routes/game.js";
import healthRouter from "./routes/health.js";
import validateRouter from "./routes/validate.js";
import { attachWebSocket } from "./ws/index.js";

const app = express();
app.use(helmet());
app.use(express.json({ limit: "16kb" }));

app.use("/api", healthRouter);
app.use("/api", validateRouter);
app.use("/api", gameRouter);
app.use("/api/dashboard", dashboardRouter);

// Fallback error handler.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

const server = http.createServer(app);
attachWebSocket(server);

// Bind to loopback only; nginx terminates TLS and reverse-proxies.
server.listen(config.port, "127.0.0.1", () => {
  console.log(`CodeQuest API listening on 127.0.0.1:${config.port}`);
});
