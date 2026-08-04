import http from "node:http";
import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./auth/routes.js";
import { visionRouter } from "./vision/routes.js";
import { attachWsServer } from "./ws/server.js";

const app = express();
app.use(cors());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Scoped per-router, not global: /vision needs a much larger body limit for
// base64 screenshots (see vision/routes.ts) — a single global express.json()
// would apply that larger limit to every route, not just this one.
app.use("/auth", express.json(), authRouter);
app.use("/vision", express.json({ limit: "25mb" }), visionRouter);

const httpServer = http.createServer(app);
attachWsServer(httpServer);

httpServer.listen(env.port, () => {
  console.log(`[server] listening on :${env.port} (HTTP + WS on /ws)`);
});
