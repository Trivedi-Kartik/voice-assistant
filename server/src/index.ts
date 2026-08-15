import http from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./auth/routes.js";
import { visionRouter } from "./vision/routes.js";
import { attachWsServer } from "./ws/server.js";

// Real bug, confirmed live: a transient Neon Postgres connectivity blip during
// /auth/refresh crashed the ENTIRE server, disconnecting every user over one
// failed request — Node terminates by default on an unhandled rejection, and
// nothing here was catching one. asyncHandler (see asyncHandler.ts, used by
// every route below) is the correct per-request fix — a failed request becomes
// one 500, not an outage. These two process-level listeners are defense in
// depth for anything that isn't (a WS handler throwing, a background timer,
// etc.) — log and keep running, never exit, since one unexpected error should
// never take down every other connected user.
process.on("unhandledRejection", (err) => {
  console.error("[fatal-guard] unhandled rejection (server kept running)", err);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal-guard] uncaught exception (server kept running)", err);
});

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

// Catches whatever asyncHandler forwards via next(err) — the actual per-request
// response for the crash class described above. Must be registered after every
// route (Express identifies error middleware by its 4-arg signature).
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[http] unhandled route error", err);
  if (!res.headersSent) res.status(500).json({ error: "internal_error" });
});

const httpServer = http.createServer(app);
attachWsServer(httpServer);

httpServer.listen(env.port, () => {
  console.log(`[server] listening on :${env.port} (HTTP + WS on /ws)`);
});
