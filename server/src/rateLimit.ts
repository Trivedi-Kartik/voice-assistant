import { redis } from "./redis.js";
import { db } from "./db.js";
import { env } from "./env.js";

// Fast path: an atomic Redis counter keyed by user+day gates every Groq call before
// it happens. Postgres `usage_events` is the durable log of the same numbers (for
// your own visibility/cost dashboard) but is never on the hot path of the check
// itself — Redis INCR is what actually protects the shared Groq quota in real time.

function dayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function turnCounterKey(userId: string): string {
  return `usage:turns:${userId}:${dayKey()}`;
}

export interface TurnCheck {
  allowed: boolean;
  remaining: number;
}

// Call BEFORE each Groq STT/LLM round for a turn. `hasByok` users are never capped —
// their own key, their own quota (see docs/ARCHITECTURE.md "Cost control").
export async function checkAndConsumeTurn(userId: string, hasByok: boolean): Promise<TurnCheck> {
  if (hasByok) return { allowed: true, remaining: Infinity };

  const key = turnCounterKey(userId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60 * 60 * 26); // a little over a day, covers timezone slop
  }

  if (count > env.dailyTurnCap) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: env.dailyTurnCap - count };
}

// Fire-and-forget durable log for your own usage visibility — not used for the
// live gating decision above.
export async function recordUsage(
  userId: string,
  delta: { sttSeconds?: number; tokensIn?: number; tokensOut?: number }
): Promise<void> {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);

  await db.usageEvent.upsert({
    where: { userId_day: { userId, day } },
    create: {
      userId,
      day,
      groqSttSeconds: delta.sttSeconds ?? 0,
      groqTokensIn: delta.tokensIn ?? 0,
      groqTokensOut: delta.tokensOut ?? 0,
      turnCount: 1,
    },
    update: {
      groqSttSeconds: { increment: delta.sttSeconds ?? 0 },
      groqTokensIn: { increment: delta.tokensIn ?? 0 },
      groqTokensOut: { increment: delta.tokensOut ?? 0 },
      turnCount: { increment: 1 },
    },
  });
}
