import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db.js";
import { signAccessToken } from "./jwt.js";
import { issueRefreshToken, rotateRefreshToken, revokeAllForDevice } from "./refreshTokens.js";
import { issueWsTicket } from "./wsTicket.js";
import { requireAuth, type AuthedRequest } from "./middleware.js";
import { encryptApiKey } from "../crypto.js";
import { env } from "../env.js";
import { SUPPORTED_LANGUAGES } from "../i18n/languages.js";
import { asyncHandler } from "../asyncHandler.js";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  deviceId: z.string().uuid(),
  deviceName: z.string().min(1).max(100),
  platform: z.enum(["windows", "mac", "linux", "android", "ios"]),
  // Tool names this client actually implements — filters which tool schemas the
  // LLM is offered for this connection (see tools/schemas.ts). Defaults to empty
  // (no tools) rather than erroring, so older/other clients degrade to chat-only
  // instead of failing to log in.
  capabilities: z.array(z.string()).default([]),
});

async function upsertDevice(
  userId: string,
  deviceId: string,
  deviceName: string,
  platform: string,
  capabilities: string[]
) {
  return db.device.upsert({
    where: { id: deviceId },
    update: { lastSeenAt: new Date(), deviceName, platform, capabilities },
    create: { id: deviceId, userId, deviceName, platform, capabilities },
  });
}

async function issueSessionTokens(userId: string, deviceId: string, language: string) {
  const accessToken = signAccessToken({ userId, deviceId });
  const refresh = await issueRefreshToken(userId, deviceId);
  return { accessToken, refreshToken: refresh.raw, expiresIn: env.jwtAccessTtlSeconds, language };
}

authRouter.post("/signup", asyncHandler(async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }
  const { email, password, deviceId, deviceName, platform, capabilities } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "email_already_registered" });
    return;
  }

  // bcryptjs is a pure-JS implementation (no native bindings), meaningfully
  // slower per round than compiled bcrypt — 12 rounds was adding real,
  // reported latency to every signup/login on top of the DB round-trip. 10
  // is still solidly within current security guidance (OWASP's floor) and
  // noticeably faster.
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.create({ data: { email, passwordHash } });
  await upsertDevice(user.id, deviceId, deviceName, platform, capabilities);

  res.status(201).json(await issueSessionTokens(user.id, deviceId, user.language));
}));

authRouter.post("/login", asyncHandler(async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }
  const { email, password, deviceId, deviceName, platform, capabilities } = parsed.data;

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  await upsertDevice(user.id, deviceId, deviceName, platform, capabilities);
  res.json(await issueSessionTokens(user.id, deviceId, user.language));
}));

authRouter.post("/refresh", asyncHandler(async (req, res) => {
  const parsed = z.object({ refreshToken: z.string() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const rotated = await rotateRefreshToken(parsed.data.refreshToken);
  if (!rotated) {
    res.status(401).json({ error: "refresh_token_invalid" });
    return;
  }

  const user = await db.user.findUnique({ where: { id: rotated.userId }, select: { language: true } });
  const accessToken = signAccessToken({ userId: rotated.userId, deviceId: rotated.deviceId });
  res.json({
    accessToken,
    refreshToken: rotated.issued.raw,
    expiresIn: env.jwtAccessTtlSeconds,
    language: user?.language ?? "en",
  });
}));

// Exchanged for a short-lived, single-use ticket used only to open the WebSocket —
// see auth/wsTicket.ts for why this indirection exists instead of putting the JWT
// directly in the wss:// URL.
authRouter.post(
  "/ws-ticket",
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const ticket = await issueWsTicket(req.auth!);
    res.json({ ticket });
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    await revokeAllForDevice(req.auth!.userId, req.auth!.deviceId);
    res.status(204).end();
  })
);

// BYOK: lets a user supply their own Groq key so the shared daily cap no longer
// applies to them (see rateLimit.ts). Stored encrypted at rest (AES-256-GCM).
authRouter.put(
  "/me/groq-key",
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const parsed = z.object({ apiKey: z.string().min(10) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    await db.user.update({
      where: { id: req.auth!.userId },
      data: { groqApiKeyEnc: encryptApiKey(parsed.data.apiKey) },
    });
    res.status(204).end();
  })
);

authRouter.delete(
  "/me/groq-key",
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    await db.user.update({ where: { id: req.auth!.userId }, data: { groqApiKeyEnc: null } });
    res.status(204).end();
  })
);

// See i18n/languages.ts for why this is a fixed 8-language allowlist, not any
// arbitrary string — a language the LLM isn't validated on would silently
// degrade tool-calling reliability with no way to test for it.
authRouter.put(
  "/me/language",
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const parsed = z.object({ language: z.enum(SUPPORTED_LANGUAGES) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    await db.user.update({ where: { id: req.auth!.userId }, data: { language: parsed.data.language } });
    res.status(204).end();
  })
);
