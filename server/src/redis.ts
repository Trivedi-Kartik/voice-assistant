import { Redis } from "ioredis";
import { env } from "./env.js";

// Ephemeral state only: per-conversation transcript buffers (short TTL) and
// per-user/day rate-limit counters. Nothing here is meant to survive long-term —
// durable facts live in Postgres (see db.ts / prisma/schema.prisma).
export const redis = new Redis(env.redisUrl);

// Without a listener ioredis only prints "[ioredis] Unhandled error event" and the real cause is
// easy to miss. Log (throttled, so an outage doesn't flood logs) and let ioredis keep reconnecting.
let lastRedisErrorLog = 0;
redis.on("error", (err: Error) => {
  const now = Date.now();
  if (now - lastRedisErrorLog > 10_000) {
    lastRedisErrorLog = now;
    console.error("[redis] connection error (will keep retrying):", err.message);
  }
});

export const CONVERSATION_TTL_SECONDS = 60 * 60; // 1 hour of inactivity clears the buffer

export function conversationKey(userId: string, conversationId: string): string {
  return `conv:${userId}:${conversationId}`;
}
