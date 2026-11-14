import type { NextFunction, Request, Response } from "express";
import { redis } from "../redis.js";

// Fixed-window limiter backed by Redis (shared across instances, survives restarts). Applied to the
// unauthenticated /auth endpoints, which had no throttle at all: unlimited password guessing, mass
// signups (each new account gets free turns on the shared Groq key), and bcrypt floods that starve
// the event loop serving every live WebSocket.
//
// Fails OPEN if Redis is unavailable — an outage must not also lock every user out of logging in.
export interface RateLimitOptions {
  name: string;
  limit: number;
  windowSeconds: number;
  // Identifier(s) to count against, e.g. the client IP. Return [] to skip.
  keys: (req: Request) => string[];
}

export function rateLimit(opts: RateLimitOptions): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      for (const id of opts.keys(req)) {
        const key = `rl:${opts.name}:${id}`;
        // Create-with-TTL (NX) then INCR — see rateLimit.ts for why not incr-then-expire.
        await redis.set(key, 0, "EX", opts.windowSeconds, "NX");
        const count = await redis.incr(key);
        if (count > opts.limit) {
          const ttl = await redis.ttl(key);
          res.setHeader("Retry-After", String(ttl > 0 ? ttl : opts.windowSeconds));
          res.status(429).json({ error: "too_many_requests" });
          return;
        }
      }
    } catch (err) {
      console.error("[rate-limit] redis unavailable, allowing request", err);
    }
    next();
  };
}

export const clientIp = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? "unknown";

const emailOf = (req: Request): string | null => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" && email.length <= 320 ? email.trim().toLowerCase() : null;
};

// Per-IP and per-account for login (the account bucket slows distributed guessing against one
// victim; it only ever delays, never permanently locks).
export const loginLimiter = rateLimit({
  name: "login",
  limit: 20,
  windowSeconds: 10 * 60,
  keys: (req) => {
    const email = emailOf(req);
    return [`ip:${clientIp(req)}`, ...(email ? [`acct:${email}`] : [])];
  },
});

export const signupLimiter = rateLimit({
  name: "signup",
  limit: 10,
  windowSeconds: 60 * 60,
  keys: (req) => [`ip:${clientIp(req)}`],
});

export const refreshLimiter = rateLimit({
  name: "refresh",
  limit: 120,
  windowSeconds: 10 * 60,
  keys: (req) => [`ip:${clientIp(req)}`],
});
