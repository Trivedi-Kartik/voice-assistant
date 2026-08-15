import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { resolveGroqKey } from "../groqKey.js";
import { checkAndConsumeTurn } from "../rateLimit.js";
import { describeImage } from "../vision.js";
import { asyncHandler } from "../asyncHandler.js";

// Deliberately its own route, not routed through the WS tool_call protocol
// like every other tool: a screenshot must never be persisted into
// ToolInvocation (see ws/session.ts's dispatchToolCall, which writes every
// ToolResult to Postgres) — only the text description this endpoint returns
// re-enters the normal tool flow. See docs/ARCHITECTURE.md.
export const visionRouter = Router();

const bodySchema = z.object({
  imageDataUri: z.string().startsWith("data:image/"),
});

visionRouter.post(
  "/describe",
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const { apiKey, isByok } = await resolveGroqKey(req.auth!.userId);

    // Reuses the same daily-turn gate the WS loop uses — without this, an
    // authenticated client could hit this endpoint directly and unbounded,
    // burning through the shared Groq key's quota.
    const turnCheck = await checkAndConsumeTurn(req.auth!.userId, isByok);
    if (!turnCheck.allowed) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }

    try {
      const description = await describeImage(apiKey, parsed.data.imageDataUri);
      res.json({ description });
    } catch (err) {
      console.error("[vision] describe failed", err);
      res.status(502).json({ error: "vision_failed" });
    }
  })
);
