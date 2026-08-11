import { desktopCapturer, screen } from "electron";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { authManager } from "../auth/authManager.js";

// Primary display only, not all monitors — capturing/describing every
// monitor multiplies cost and "describe my screen" is ambiguous with
// several anyway. See docs/ARCHITECTURE.md.
const MAX_WIDTH = 1280;
const JPEG_QUALITY = 70;

async function captureScreenshotDataUri(): Promise<string> {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: display.size,
  });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!source) throw new Error("no_screen_source");

  const { width } = source.thumbnail.getSize();
  const resized = width > MAX_WIDTH ? source.thumbnail.resize({ width: MAX_WIDTH }) : source.thumbnail;
  return `data:image/jpeg;base64,${resized.toJPEG(JPEG_QUALITY).toString("base64")}`;
}

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
      imageDataUri = await captureScreenshotDataUri();
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
