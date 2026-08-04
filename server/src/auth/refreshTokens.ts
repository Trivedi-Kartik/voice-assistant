import { db } from "../db.js";
import { env } from "../env.js";
import { randomToken, sha256Hex } from "../crypto.js";

export interface IssuedRefreshToken {
  raw: string;
  id: string;
}

export async function issueRefreshToken(userId: string, deviceId: string): Promise<IssuedRefreshToken> {
  const raw = randomToken();
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  const record = await db.refreshToken.create({
    data: { userId, deviceId, tokenHash: sha256Hex(raw), expiresAt },
  });
  return { raw, id: record.id };
}

export interface RotateResult {
  userId: string;
  deviceId: string;
  issued: IssuedRefreshToken;
}

// Rotates a refresh token: validates it hasn't been used/revoked/expired, marks it
// replaced, and issues a fresh one. If a token that was already replaced comes back
// (reuse of a stolen token), the whole chain is revoked — this is what makes theft
// detectable rather than silently exploitable.
export async function rotateRefreshToken(rawToken: string): Promise<RotateResult | null> {
  const tokenHash = sha256Hex(rawToken);
  const existing = await db.refreshToken.findFirst({ where: { tokenHash } });
  if (!existing) return null;

  if (existing.revokedAt || existing.replacedById || existing.expiresAt < new Date()) {
    // Reuse of an already-rotated or revoked token: treat as compromise, kill the chain.
    await db.refreshToken.updateMany({
      where: { userId: existing.userId, deviceId: existing.deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  const issued = await issueRefreshToken(existing.userId, existing.deviceId);
  await db.refreshToken.update({
    where: { id: existing.id },
    data: { replacedById: issued.id, revokedAt: new Date() },
  });

  return { userId: existing.userId, deviceId: existing.deviceId, issued };
}

export async function revokeAllForDevice(userId: string, deviceId: string): Promise<void> {
  await db.refreshToken.updateMany({
    where: { userId, deviceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
