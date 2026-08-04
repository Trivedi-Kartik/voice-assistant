import { redis } from "../redis.js";
import { randomToken } from "../crypto.js";
import type { AccessTokenPayload } from "./jwt.js";

// One-time, 30s-lived ticket exchanged for the access token before opening the
// WebSocket. Keeps the long-lived JWT out of the WS URL (query strings end up in
// proxy/access logs) — see docs/ARCHITECTURE.md "Auth flow" for the full reasoning.
const TICKET_TTL_SECONDS = 30;

function ticketKey(ticket: string): string {
  return `ws-ticket:${ticket}`;
}

export async function issueWsTicket(payload: AccessTokenPayload): Promise<string> {
  const ticket = randomToken();
  await redis.set(ticketKey(ticket), JSON.stringify(payload), "EX", TICKET_TTL_SECONDS);
  return ticket;
}

// Single-use: consumes (deletes) the ticket on read so it can never be replayed.
export async function consumeWsTicket(ticket: string): Promise<AccessTokenPayload | null> {
  const key = ticketKey(ticket);
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw) as AccessTokenPayload;
}
