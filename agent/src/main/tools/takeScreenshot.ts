import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { authManager } from "../auth/authManager.js";
import { captureScreenshotDataUri } from "./computerUse/screenshotStep.js";

const argsSchema = z.object({});

export const takeScreenshotTool: ToolDefinition<Record<string, never>> = {
  name: "take_screenshot_and_describe",
  // Gated by a spoken confirmation the user resolves on the next turn (see
  // server/src/ws/session.ts, CONFIRMATION_PROMPTS in
  // server/src/tools/schemas.ts) — by the time this execute() runs, it's
  // already been confirmed.
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute() {
    // Split into two try/catches, not one — capture (local, Electron) and
    // description (network, server, Groq) fail for completely different
    // reasons, and a single swallowed catch gave no way to tell which one
    // broke when this failed on real Windows testing.
    let imageDataUri: string;
    try {
      imageDataUri = (await captureScreenshotDataUri()).dataUri;
    } catch (err) {
      console.error("[tools] screenshot capture failed", err);
      return { ok: false, message: "Couldn't take a screenshot right now." };
    }
    try {
      const description = await authManager.describeScreenshot(imageDataUri);
      return { ok: true, message: description };
    } catch (err) {
      console.error("[tools] screenshot description failed", err);
      return { ok: false, message: "Took the screenshot, but couldn't get a description back." };
    }
  },
};
