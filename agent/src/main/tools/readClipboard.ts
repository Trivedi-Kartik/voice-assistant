import { clipboard } from "electron";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";

// Whatever's on the clipboard could be a password, an OTP, anything — this
// isn't about irreversible damage, it's about not silently shipping private
// data to a cloud LLM. Gated by a spoken confirmation the user resolves on
// the next turn (see server/src/ws/session.ts, CONFIRMATION_PROMPTS in
// server/src/tools/schemas.ts) — by the time this execute() runs, it's
// already been confirmed. See docs/ARCHITECTURE.md.
const MAX_CHARS = 4_000;

const argsSchema = z.object({});

export const readClipboardTool: ToolDefinition<Record<string, never>> = {
  name: "read_clipboard",
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute() {
    const text = clipboard.readText().trim();
    if (!text) {
      return { ok: false, message: "The clipboard is empty." };
    }
    const truncated = text.length > MAX_CHARS;
    return { ok: true, message: truncated ? `${text.slice(0, MAX_CHARS)}… (truncated)` : text };
  },
};
