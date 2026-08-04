import { Redis } from "ioredis";
import { env } from "./env.js";

// Ephemeral state only: per-conversation transcript buffers (short TTL) and
// per-user/day rate-limit counters. Nothing here is meant to survive long-term —
// durable facts live in Postgres (see db.ts / prisma/schema.prisma).
export const redis = new Redis(env.redisUrl);

export const CONVERSATION_TTL_SECONDS = 60 * 60; // 1 hour of inactivity clears the buffer

export function conversationKey(userId: string, conversationId: string): string {
  return `conv:${userId}:${conversationId}`;
}
