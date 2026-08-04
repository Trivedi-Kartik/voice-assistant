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
  sensitivity: "high",
  describe: () => "Take a screenshot of your screen and share it with the assistant?",
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute() {
    try {
      const imageDataUri = await captureScreenshotDataUri();
      const description = await authManager.describeScreenshot(imageDataUri);
      return { ok: true, message: description };
    } catch {
      return { ok: false, message: "Couldn't take or describe a screenshot right now." };
    }
  },
};
