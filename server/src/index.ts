import http from "node:http";
import * as Sentry from "@sentry/node";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./auth/routes.js";
import { visionRouter } from "./vision/routes.js";
import { attachWsServer } from "./ws/server.js";
import { requireAuth } from "./auth/middleware.js";
import { redis } from "./redis.js";
import { db } from "./db.js";
import { PRIVACY_POLICY_HTML } from "./privacyPolicy.js";

// Optional — SENTRY_DSN is not a required() env var (see env.ts): the server
// must still run fine locally or before monitoring is set up. Free tier
// (5k events/month) is enough for a small invited beta.
if (env.sentryDsn) {
  Sentry.init({ dsn: env.sentryDsn });
  console.log("[server] Sentry monitoring enabled");
}

// Real bug, confirmed live: a transient Neon Postgres connectivity blip during
// /auth/refresh crashed the ENTIRE server, disconnecting every user over one
// failed request — Node terminates by default on an unhandled rejection, and
// nothing here was catching one. asyncHandler (see asyncHandler.ts, used by
// every route below) is the correct per-request fix — a failed request becomes
// one 500, not an outage. These two process-level listeners are defense in
// depth for anything that isn't (a WS handler throwing, a background timer,
// etc.) — log and keep running, never exit, since one unexpected error should
// never take down every other connected user. Also reported to Sentry (when
// configured) so "kept running" doesn't silently mean "nobody ever finds out."
process.on("unhandledRejection", (err) => {
  console.error("[fatal-guard] unhandled rejection (server kept running)", err);
  Sentry.captureException(err);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal-guard] uncaught exception (server kept running)", err);
  Sentry.captureException(err);
});

const app = express();
// Behind Render's proxy: without this req.ip is the proxy's address, so every user would share one
// rate-limit bucket. (1 = trust exactly one hop.)
app.set("trust proxy", 1);
app.use(cors());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Readiness (vs /health, which stays static so Render's health check never flaps on a dependency
// blip): actually exercises Postgres and Redis. Safe to expose — returns no detail.
app.get("/ready", async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    db.$queryRaw`select 1`.then(() => true, () => false),
    redis.ping().then((r) => r === "PONG", () => false),
  ]);
  res.status(dbOk && redisOk ? 200 : 503).json({ ok: dbOk && redisOk, db: dbOk, redis: redisOk });
});

app.get("/privacy", (_req, res) => {
  res.type("html").send(PRIVACY_POLICY_HTML);
});

// Scoped per-router, not global: /vision needs a much larger body limit for
// base64 screenshots (see vision/routes.ts) — a single global express.json()
// would apply that larger limit to every route, not just this one.
app.use("/auth", express.json(), authRouter);
// requireAuth runs first so an unauthenticated client can't make us buffer and parse 25 MB bodies.
app.use("/vision", requireAuth, express.json({ limit: "25mb" }), visionRouter);

// Catches whatever asyncHandler forwards via next(err) — the actual per-request
// response for the crash class described above. Must be registered after every
// route (Express identifies error middleware by its 4-arg signature).
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[http] unhandled route error", err);
  Sentry.captureException(err);
  if (!res.headersSent) res.status(500).json({ error: "internal_error" });
});

const httpServer = http.createServer(app);
const wsHandle = attachWsServer(httpServer);

httpServer.listen(env.port, () => {
  console.log(`[server] listening on :${env.port} (HTTP + WS on /ws)`);
});

// Render sends SIGTERM on every deploy/spin-down. Without handling it, sockets are cut without a
// close frame, handleDisconnect never runs (in-flight Task rows stay "running"), and clients only
// notice via timeout. Stop accepting, close sockets cleanly (clients auto-reconnect), then exit.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down`);
  httpServer.close();
  wsHandle.close();
  // Give close frames / disconnect handlers a moment to flush, then release connections and exit.
  setTimeout(async () => {
    await Promise.allSettled([db.$disconnect(), redis.quit()]);
    process.exit(0);
  }, 3000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
